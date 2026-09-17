# ARCHITECTURE.md — CF Companion

This describes the architecture **as it actually exists today (V1, complete)**. Update this
file whenever the architecture intentionally changes; don't let it drift the way it did
before this reconciliation pass (it previously still described a Phase-1-only, no-filtering,
debug-popup state that hadn't been true for a long time).

## Overall Architecture

A Manifest V3 Chrome extension, built with Vite + `@crxjs/vite-plugin`, in TypeScript with no
frontend framework (plain HTML/CSS/TS popup). Three runtime contexts:

- **Background service worker** (`src/background/service-worker.ts`) — the only place that
  talks to `chrome.storage` and orchestrates syncing; receives messages from the popup.
- **Popup** (`src/popup/`) — the real product UI: a branded dashboard with sync controls,
  problem statistics, rating distribution, filters (rating/status/tags), a tag selector, and
  a random-problem picker. Sends messages to the background worker; all rendering happens
  directly against the DOM (no framework).
- Everything else (`types/`, `api/`, `data/`, `query/`, `storage/`, `sync/`) is plain
  TypeScript with no dependency on being inside an extension context, except
  `storage/chromeStorageAdapter.ts`, which lazily touches the `chrome` global only when
  actually invoked — this is what lets the whole data/query layer be unit-tested under plain
  Node via `tsx`, with no browser/extension environment required.

## Directory Structure

```
manifest.json           MV3 manifest — points at .ts/.html source; @crxjs/vite-plugin
                         rewrites this into a build manifest pointing at bundled output.
vite.config.ts           Wires @crxjs/vite-plugin against manifest.json.
tsconfig.json            strict mode + noUncheckedIndexedAccess; target ES2022; no @types/chrome.
package.json             Scripts: dev, build, typecheck, test. Deps: vite, @crxjs/vite-plugin,
                         typescript, tsx. No React, no test framework (see "Tests" below).

icon-src.svg             Source of the extension's icon/logo — an original geometric mark
                         (four ascending bars, light-to-dark blue), NOT the Codeforces logo
                         and not derived from any third-party/stock icon. Regenerated to
                         public/icons/icon{16,48,128}.png via `sharp` when it changes (no
                         build-time asset pipeline for this yet — it's a manual step).
public/icons/            16/48/128px PNGs rasterized from icon-src.svg.

src/
  types/                 Pure type definitions, zero logic, zero imports from anywhere but
                          each other.
    problem.ts               Problem, ProblemKey, makeProblemKey(), problemUrl()
    submission.ts             Submission, Verdict (full CF verdict union)
    status.ts                 ProblemStatus enum {Solved, Attempted, Unattempted},
                               ProblemAttemptSummary, StatusMap = Map<ProblemKey, Summary>
    user.ts                    CFUserProfile
    index.ts                   Barrel re-export of the above

  api/                   Talking to codeforces.com/api. No caching, no app-level logic —
                          purely "given params, return normalized-shape raw API data, or
                          throw a typed error."
    endpoints.ts              Wire-format types matching the CF API docs (CFRawProblem,
                               CFRawSubmission, CFRawUser, CFApiResponse<T>, ...)
    errors.ts                  CodeforcesApiError (base), InvalidHandleError, RateLimitedError,
                               NetworkError
    codeforcesClient.ts         fetchUserInfo(), fetchUserStatusPage(), fetchAllUserSubmissions(),
                               fetchProblemset(). Also home to a request-throttling gate and
                               retry-with-backoff for RateLimitedError/NetworkError.

  data/                  Pure functions: raw API shapes -> internal types -> classification.
                          No I/O, no chrome/*, fully unit-testable.
    normalize.ts              normalizeProblemset(), normalizeSubmission(s)(), normalizeUser()
    classify.ts                classifySubmissions(submissions) -> StatusMap. Single source of
                               truth for SOLVED/ATTEMPTED/UNATTEMPTED. getStatus() looks up a
                               key, defaulting to Unattempted when absent.

  query/                 Pure functions over (Problem[], StatusMap) — the filtering/
                          statistics/selection engine. No I/O, no chrome/*, fully
                          unit-testable. This layer didn't exist in the original Phase 1
                          data-layer design; it's the core of what makes V1 an actual product
                          rather than a sync-only debug tool.
    getProblems.ts             getProblems(problems, statusMap, filters): rating range
                               (minRating/maxRating), status (single ProblemStatus or an
                               array — matches any), tags (AND semantics, empty/omitted = no
                               filter). Also home to getProblemStats() (total/solved/
                               attempted/unattempted), getSuccessRate() (solved/(solved+
                               attempted), null on 0/0), and getRatingDistribution() +
                               RATING_LEVELS/RATING_DISTRIBUTION_LABELS (discrete 100-point
                               levels 800..3500 plus "Unrated"; out-of-range/non-round
                               ratings are clamped/rounded into range rather than dropped).
    getRandomProblem.ts         getRandomProblem(problems, randomFn?): uniform random pick,
                               null on empty input, injectable RNG for deterministic tests.
    getRandomProblemByFilter.ts getRandomProblemByFilter(problems, statusMap, filters):
                               getProblems() then getRandomProblem() — composes the two
                               above, no duplicated logic.

  storage/               chrome.storage.local, wrapped so nothing else in the codebase touches
                          the chrome global directly.
    chromeStorageAdapter.ts    getLocalStorage(): StorageArea — lazy wrap of chrome.storage.local
                               (touches `chrome` only when called, not at import time — what
                               makes this import-safe from plain Node test files).
    storageKeys.ts              Key name builders + CacheMeta shape (schema version, last-sync
                               timestamps per handle, latest-known-submission-id per handle,
                               last-used handle).
    cache.ts                    Typed read/write helpers: readMeta/writeMeta, readProblemset/
                               writeProblemset, readSubmissions/writeSubmissions,
                               readUserProfile/writeUserProfile, clearHandleCache.

  sync/
    syncService.ts              The orchestration layer.
                               ensureProblemset({force?}): 24h TTL cache around fetchProblemset
                                 + normalizeProblemset.
                               ensureUserData(handle, {force?}): 10min TTL cache; validates the
                                 handle via fetchUserInfo; does an INCREMENTAL fetch (only pages
                                 newer than the last known submission id) when a prior cache
                                 exists, otherwise a full fetch; merges via mergeSubmissions();
                                 returns {profile, submissions, statusMap, fromCache, syncedAt}.
                               mergeSubmissions(cached, fresh): dedupe-by-id union, sorted
                                 newest-first.
                               peekCachedState(): network-free, TTL-free read of whatever's
                                 already cached for the last-used handle (problems, profile,
                                 statusMap, both sync timestamps), or null if anything required
                                 is missing. Used only to rehydrate the popup on open — never
                                 used as a substitute for an explicit sync.

  messaging/
    protocol.ts                THE message-boundary contract between popup and background.
                               ExtensionRequest is a union of {type:"SYNC_PROBLEMSET",force?},
                               {type:"SYNC_USER",handle,force?}, and
                               {type:"PEEK_CACHED_STATE"}. ExtensionResponse<T> is
                               {ok:true,data:T} | {ok:false,error:{name,message}}. Also home
                               to serializeStatusMap/deserializeStatusMap: chrome.runtime.
                               sendMessage serializes messages as JSON by default (not
                               structured clone), which silently collapses a Map into {} — this
                               module converts StatusMap to/from a JSON-safe array of
                               [key, value] tuples so that can't happen again (see
                               CHANGELOG.md for the bug this originally fixed).

  util/
    exclusiveTask.ts             createExclusiveRunner()/AlreadyRunningError — a generic,
                               dependency-free mutual-exclusion helper used by popup.ts to
                               guard against overlapping syncs.

  background/
    service-worker.ts            MV3 background entry point. Listens for SYNC_PROBLEMSET /
                               SYNC_USER / PEEK_CACHED_STATE messages (types from
                               messaging/protocol.ts) via chrome.runtime.onMessage, calls the
                               matching syncService function, serializes the StatusMap via
                               serializeStatusMap before responding, and replies
                               {ok: true, data} or {ok: false, error: {name, message}}.

  popup/                  The real product UI.
    popup.html                 Branded header (inline SVG logo + "CF Companion" wordmark) and
                               six panels: Sync (handle input, Sync/Force-refresh buttons, a
                               sync-status readout), Problem stats (a 4-cell stat grid +
                               success-rate bar), Rating distribution (a horizontal bar list),
                               Filters (min/max rating, status select, tags input + tag-menu
                               toggle/dropdown, "Count problems" button), and Random problem
                               (button + result area). All styling is plain CSS using custom
                               properties defined once in :root (slate neutrals + a blue accent
                               family) — no CSS framework.
    popup.ts                    Wires every control to the query/sync layers. Key pieces:
                               - sendMessage(): thin chrome.runtime.sendMessage wrapper.
                               - syncAll()/handleSyncClick(): runs a sync through
                                 createExclusiveRunner() (only one sync at a time) inside a
                                 try/catch (so any unexpected error is always shown, never a
                                 silent hang); setBusy() is scoped *inside* the exclusive task
                                 specifically so a rejected overlapping click never re-enables
                                 buttons out from under a genuinely in-flight sync.
                               - clearSyncedDisplays(): resets stats/rating distribution/
                                 random result/in-memory lastState back to their pre-sync
                                 state, called at the very start of every sync attempt so a
                                 failed sync (e.g. invalid handle) never leaves a previous
                                 user's results visible or queryable.
                               - printSyncError()/friendlySyncErrorMessage(): maps a raw
                                 {name,message} error to a short display message and an error-
                                 styled readout, while console.error always keeps the raw
                                 detail.
                               - renderStats()/renderRatingDistribution(): the only places
                                 that call getProblemStats()/getSuccessRate()/
                                 getRatingDistribution() and turn the result into DOM (a stat
                                 grid + progress bar; a list of bar rows).
                               - Tag menu wiring: renderTagChips()/renderTagMenu() build the
                                 "Recent tags"/"All tags" chip lists from collectAllTags()
                                 (query/tagMenu.ts) and a localStorage-backed recent-tags list
                                 (loadRecentTags/saveRecentTags); clicking a chip calls
                                 toggleTagInInput() against the same #tags input the manual
                                 typing path uses, so there's one source of truth, not two.
                               - runRangeQuery()/showRandomProblem(): read the rating/status/
                                 tags controls, call getProblems()/getRandomProblemByFilter()
                                 respectively, and render the result (a scrollIntoView() call
                                 brings the Count result into view since the button sits below
                                 it in the layout).
                               - restoreFromCache(): runs once on popup open via
                                 PEEK_CACHED_STATE; populates the same displays a real sync
                                 would, with no network call.
                               - invalidateRandomResult(): resets the random-result area to a
                                 placeholder whenever a filter control changes or new data is
                                 synced/restored, so a stale pick is never left on screen.
    statusSelect.ts              statusFilterFromSelection(): maps the status <select>'s value
                               to ProblemFilters.status (undefined for "all").
    tagsInput.ts                 parseTagsInput(): comma-separated text -> trimmed, non-empty
                               tag list.
    tagMenu.ts                   collectAllTags() (derives the tag list from loaded problems,
                               never hard-coded), toggleTagInInput(), addRecentTags(),
                               isOutsideTagMenu() (click-outside-closes-menu logic, written to
                               treat the manual tags input as "inside" the control so typing
                               doesn't close the menu on you).
    randomProblemDisplay.ts      formatRandomProblemDisplay(): a Problem -> {label, url} for
                               the Random Problem result link, using the existing
                               problemUrl() helper.
    formatRelativeTime.ts        formatRelativeTime(elapsedMs): "just now" / "N minute(s)
                               ago" / "N hour(s) ago" / "N day(s) ago", used for the
                               "Last synced: …" line.

  test/                  Zero-dependency test harness + all current tests (see
                          PROJECT_STATUS.md "Tests" for the full annotated list).
    testKit.ts                  ~50-line test()/assertEqual()/assertTrue()/run() harness. No
                               external test framework dependency.
    run.ts                      Imports every *.test.ts file (registering their tests as a
                               side effect) then calls run(). This is what `npm test` executes.
```

## Data Flow

**Cold sync (no cache):**
```
popup.ts
  --sendMessage({type:"SYNC_PROBLEMSET"})-->
background/service-worker.ts
  --ensureProblemset()-->
sync/syncService.ts
  --fetchProblemset()--> api/codeforcesClient.ts --HTTP--> codeforces.com/api/problemset.problems
  --normalizeProblemset(raw)--> data/normalize.ts
  --writeProblemset(problems)--> storage/cache.ts --> chrome.storage.local
  <-- {problems, fromCache: false, syncedAt} --
  <-- {ok: true, data: {...}} -- back through sendResponse to popup.ts
```

```
popup.ts
  --sendMessage({type:"SYNC_USER", handle})-->
background/service-worker.ts --ensureUserData(handle)--> sync/syncService.ts
  --fetchUserInfo(handle)--> api/codeforcesClient.ts   (validates handle; throws
                                                         InvalidHandleError if unknown)
  --fetchAllUserSubmissions(handle)--> paginates user.status in pages of 500 until a short
                                        page is returned
  --normalizeSubmissions(raw)--> data/normalize.ts
  --classifySubmissions(submissions)--> data/classify.ts  -->  StatusMap
  --writeSubmissions/writeUserProfile--> storage/cache.ts --> chrome.storage.local
  <-- {profile, submissions, statusMap, fromCache: false, syncedAt} --
```

**Warm sync (fresh cache, < TTL):** `ensureProblemset`/`ensureUserData` short-circuit straight
to a `readX()` call plus (for user data) a fresh `classifySubmissions()` over the cached
submissions — no network call at all.

**Incremental sync (stale cache, prior data exists):** `ensureUserData` still calls
`fetchUserInfo` (cheap, also revalidates the handle), then calls
`fetchAllUserSubmissions(handle, {stopAtSubmissionId: <cached max id>})`, which pages from the
newest submission backward and stops as soon as it reaches that id. The new page(s) are merged
with the cached list via `mergeSubmissions` (dedupe by id, re-sort newest-first).

**Popup-open cache restoration (no sync, no network):**
```
popup.ts (on load)
  --sendMessage({type:"PEEK_CACHED_STATE"})-->
background/service-worker.ts --peekCachedState()--> sync/syncService.ts
  --readProblemset/readSubmissions/readUserProfile--> storage/cache.ts (no TTL check, no fetch)
  <-- {problems, profile, statusMap, problemsetSyncedAt, userSyncedAt} | null --
popup.ts: if non-null, populates handle/stats/rating-distribution exactly as a real sync
would, via the same renderStats()/renderRatingDistribution() functions.
```

**Sync-start display reset:** the moment `syncAll()` confirms a non-empty handle (before any
network call), `clearSyncedDisplays()` resets stats/rating-distribution/random-result/
`lastState` to their pre-sync state, so a subsequent failure can't leave stale data on screen
or queryable.

**Filtering / statistics / random selection (all pure, no I/O):**
```
(Problem[], StatusMap)
  --getProblems(filters)--> Problem[]              (rating/status/tags)
  --getProblemStats()--> {total,solved,attempted,unattempted}
  --getSuccessRate(stats)--> number | null
  --getRatingDistribution(problems)--> Record<label, count>   (doesn't need StatusMap)
  --getRandomProblemByFilter(filters)--> Problem | null        (= getProblems + getRandomProblem)
```

## Codeforces API Interaction

See `README.md`'s "Technical constraints discovered" section for the full list of
API-specific facts this design depends on (submission ordering, pagination semantics, problem
identity, rate-limit handling, etc.). In short: `problemset.problems` (one unpaginated call)
and `user.status` (paginated in chunks of 500, newest-first) are the only two endpoints used.
`user.info` doubles as handle validation.

## Data Normalization

Raw API responses (`CFRawProblem`, `CFRawSubmission`, `CFRawUser` in `api/endpoints.ts`) are
converted to internal types (`Problem`, `Submission`, `CFUserProfile` in `types/`) by
`data/normalize.ts`. Normalization's job is entirely about smoothing over API inconsistency:
resolving `contestId` vs `problemsetName` vs a missing rating/verdict into a single
predictable shape, and computing the canonical `ProblemKey` via `makeProblemKey()`. No
business logic (classification, filtering, stats) lives here.

## Problem Status Classification

Implemented once, in `data/classify.ts`, and used everywhere status is needed.

- SOLVED: at least one submission to that problem has verdict `"OK"`.
- ATTEMPTED: at least one submission exists, none is `"OK"` (yet).
- UNATTEMPTED: no entry in the `StatusMap` at all (`getStatus()` returns
  `ProblemStatus.Unattempted` for any key with no entry).
- Submissions are de-duplicated by id before classification.
- `failedAttempts` only counts non-OK submissions that happened *before* the first OK
  submission, chronologically (the function sorts by `creationTimeSeconds` internally).

## Storage / Caching

- Backing store: `chrome.storage.local` only (never `.sync`).
- Cache entries: `cf:meta` (schema version, per-handle sync timestamps, per-handle latest
  submission id, last-used handle), `cf:problemset` (full normalized `Problem[]`),
  `cf:submissions:<handle>`, `cf:userProfile:<handle>`.
- TTLs: problemset 24h, user data 10min — both overridable via an explicit `force` flag.
- The `StatusMap` itself is never cached; it's always recomputed from cached submissions on
  read.
- Recent-tags (the tag menu's "Recent tags" list) is the one piece of state that deliberately
  lives outside this system, in plain `localStorage` — see PROJECT_STATUS.md "Important
  Decisions" #8.

## Filtering / Statistics / Random-Selection System

Fully implemented in `query/getProblems.ts` (`getProblems`, `getProblemStats`,
`getSuccessRate`, `getRatingDistribution`), `query/getRandomProblem.ts`, and
`query/getRandomProblemByFilter.ts`. All pure functions over `(Problem[], StatusMap)` with no
I/O, exhaustively unit-tested (see `PROJECT_STATUS.md`). This is the core of V1 — it does not
exist as a separate future phase.

## Recommendation System

**Does not exist.** Not part of V1. Not started.

## Chrome Extension Components

- **Manifest** (`manifest.json`): `manifest_version: 3`, `action.default_popup`,
  `background.service_worker` (type `module`), `permissions: ["storage"]`,
  `host_permissions: ["https://codeforces.com/api/*"]`. No content scripts.
- **Background service worker**: message routing to `syncService` (SYNC_PROBLEMSET,
  SYNC_USER, PEEK_CACHED_STATE).
- **Popup**: the full V1 product UI, described above.
- **No options/settings page.**
- **No content scripts / Codeforces page integration.**

## Important Interfaces/Types

Treat changes to these as interface-breaking and update every consumer:

- `Problem` (`types/problem.ts`) — `key`, `contestId`, `problemsetName`, `index`, `name`,
  `type`, `rating`, `tags`, `points`, `solvedCount`.
- `Submission` (`types/submission.ts`) — `id`, `problemKey`, `contestId`, `problemsetName`,
  `index`, `creationTimeSeconds`, `verdict`, `programmingLanguage`.
- `ProblemStatus` enum + `ProblemAttemptSummary` + `StatusMap` (`types/status.ts`).
- `CFUserProfile` (`types/user.ts`).
- `ProblemFilters`, `ProblemStats`, `RatingDistribution`, `RatingDistributionLabel`
  (`query/getProblems.ts`).
- `ensureProblemset()` / `ensureUserData()` / `peekCachedState()` return shapes
  (`sync/syncService.ts`).
- `ExtensionRequest` / `ExtensionResponse<T>` (`messaging/protocol.ts`).

## Important Dependencies

Runtime/build: `vite`, `@crxjs/vite-plugin` (MV3-aware bundling), `typescript`. Dev/test:
`tsx` (runs TypeScript directly under Node for the test suite — no test framework like
vitest/jest installed, by design; see `CLAUDE.md`). No React. No `@types/chrome`.

**As of this writing, none of these have actually been `npm install`ed in the environment
this project has been developed in (no network access to the npm registry) — see
`PROJECT_STATUS.md` "Known Issues" for what that means for build verification.** `sharp`,
used to rasterize `icon-src.svg` into the PNG icons, is available as a pre-existing global
binary in the development sandbox, not a project dependency (`package.json` does not list
it) — regenerating the icons requires an equivalent SVG-to-PNG tool if `sharp` isn't already
present wherever this is next developed.
