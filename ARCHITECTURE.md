# ARCHITECTURE.md — CF Companion

This describes the architecture **as it actually exists today** (end of Phase 1). It does
not describe planned Phase 2+ functionality — see `PROJECT_STATUS.md` for the roadmap.
Update this file whenever the architecture intentionally changes.

## Overall Architecture

A Manifest V3 Chrome extension, built with Vite + `@crxjs/vite-plugin`, in TypeScript with
no framework yet (React is planned starting Phase 3 for the real UI; Phase 1's popup is
plain HTML/TS). Three runtime contexts:

- **Background service worker** (`src/background/service-worker.ts`) — the only place that
  talks to `chrome.storage` and orchestrates syncing; receives messages from the popup.
- **Popup** (`src/popup/`) — currently a bare debug harness, not real UI. Sends messages to
  the background worker and renders plain text output.
- Everything else (`types/`, `api/`, `data/`, `storage/`, `sync/`) is plain TypeScript with
  no dependency on being inside an extension context, except `storage/chromeStorageAdapter.ts`
  which lazily touches the `chrome` global only when actually invoked — this is what lets the
  whole data layer be unit-tested under plain Node via `tsx`, with no browser/extension
  environment required.

## Directory Structure

```
manifest.json          MV3 manifest — points directly at .ts/.html source; @crxjs/vite-plugin
                        rewrites this into a build manifest pointing at bundled output.
vite.config.ts          Wires @crxjs/vite-plugin against manifest.json.
tsconfig.json           strict mode + noUncheckedIndexedAccess; target ES2022; no @types/chrome.
package.json            Scripts: dev, build, typecheck, test. Deps: vite, @crxjs/vite-plugin,
                        typescript, tsx. No React yet, no test framework yet (see below).

public/icons/           16/48/128px placeholder icons (flat "CF" wordmark, generated via sharp
                        during development — not final branding).

src/
  types/                Pure type definitions, zero logic, zero imports from anywhere but
                         each other.
    problem.ts             Problem, ProblemKey, makeProblemKey(), problemUrl()
    submission.ts           Submission, Verdict (full CF verdict union)
    status.ts               ProblemStatus enum {Solved, Attempted, Unattempted},
                             ProblemAttemptSummary, StatusMap = Map<ProblemKey, Summary>
    user.ts                  CFUserProfile
    index.ts                 Barrel re-export of the above

  api/                  Talking to codeforces.com/api. No caching, no app-level logic —
                         purely "given params, return normalized-shape raw API data, or
                         throw a typed error."
    endpoints.ts            Wire-format types matching the CF API docs almost verbatim
                             (CFRawProblem, CFRawSubmission, CFRawUser, CFApiResponse<T>, ...)
    errors.ts                CodeforcesApiError (base), InvalidHandleError, RateLimitedError,
                             NetworkError
    codeforcesClient.ts       fetchUserInfo(), fetchUserStatusPage(), fetchAllUserSubmissions(),
                             fetchProblemset(). Contains the only two cross-cutting concerns
                             at this layer: a request-throttling gate (≥400ms between calls)
                             and retry-with-exponential-backoff (1s/2s/4s) for
                             RateLimitedError/NetworkError.

  data/                 Pure functions: raw API shapes -> internal types -> classification.
                         No I/O, no chrome/*, fully unit-testable.
    normalize.ts            normalizeProblemset(), normalizeSubmission(s)(), normalizeUser()
    classify.ts              classifySubmissions(submissions) -> StatusMap. This is the single
                             source of truth for SOLVED/ATTEMPTED/UNATTEMPTED. getStatus()
                             looks up a key, defaulting to Unattempted when absent.

  storage/              chrome.storage.local, wrapped so nothing else in the codebase touches
                         the chrome global directly.
    chromeStorageAdapter.ts  getLocalStorage(): StorageArea — lazy wrap of chrome.storage.local
                             (touches `chrome` only when called, not at import time, which is
                             what makes this import-safe from plain Node test files).
    storageKeys.ts            Key name builders + CacheMeta shape (schema version, last-sync
                             timestamps per handle, latest-known-submission-id per handle).
    cache.ts                  Typed read/write helpers: readMeta/writeMeta, readProblemset/
                             writeProblemset, readSubmissions/writeSubmissions,
                             readUserProfile/writeUserProfile, clearHandleCache.

  sync/
    syncService.ts            The orchestration layer — the thing everything else calls.
                             ensureProblemset({force?}): 24h TTL cache around fetchProblemset
                               + normalizeProblemset.
                             ensureUserData(handle, {force?}): 10min TTL cache; validates the
                               handle via fetchUserInfo; does an INCREMENTAL fetch (only pages
                               newer than the last known submission id) when a prior cache
                               exists, otherwise a full fetch; merges via mergeSubmissions();
                               returns {profile, submissions, statusMap, fromCache, syncedAt}.
                             mergeSubmissions(cached, fresh): dedupe-by-id union, sorted
                               newest-first. Exported specifically so it's unit-testable in
                               isolation from chrome.storage.

  messaging/
    protocol.ts               THE message-boundary contract between popup and background.
                             Defines ExtensionRequest/ExtensionResponse and the JSON-safe
                             response shapes (SyncProblemsetResponseData,
                             SyncUserResponseData). Also home to serializeStatusMap /
                             deserializeStatusMap: chrome.runtime.sendMessage serializes
                             messages as JSON by default (not structured clone), which
                             silently collapses a Map into {} — this module converts
                             StatusMap to/from a JSON-safe array of [key, value] tuples so
                             that can't happen again. See the file's doc comment and
                             CHANGELOG.md for the bug this fixed.

  util/
    exclusiveTask.ts           createExclusiveRunner()/AlreadyRunningError — a generic,
                             dependency-free mutual-exclusion helper used by popup.ts to
                             guard against overlapping syncs. NOTE: present in the codebase
                             but not yet test-covered or reviewed as its own task — see
                             PROJECT_STATUS.md "Known Issues" before relying on it.

  background/
    service-worker.ts         MV3 background entry point. Listens for
                             {type: "SYNC_PROBLEMSET", force?} and
                             {type: "SYNC_USER", handle, force?} messages via
                             chrome.runtime.onMessage (types from messaging/protocol.ts),
                             calls the matching syncService function, serializes the
                             StatusMap via serializeStatusMap before responding, and replies
                             {ok: true, data} or {ok: false, error: {name, message}}.

  popup/                 DEBUG UI ONLY — not the real product UI (that's Phase 3+).
    popup.html               Handle input, Sync/Force-refresh buttons, a min/max rating query
                             box, and a <pre> output area.
    popup.ts                  Sends SYNC_PROBLEMSET / SYNC_USER messages to the background
                             worker, calls deserializeStatusMap on the response to rebuild a
                             real Map before any .get() call, then does a plain array
                             filter+count to print solved/attempted/unattempted counts and
                             answer an ad hoc rating-range query. Sync actions are wrapped in
                             a try/catch and an exclusive-run guard (see the exclusiveTask.ts
                             caveat above) so an unexpected error is shown in the popup
                             instead of becoming a silent unhandled rejection.

  test/                 Zero-dependency test harness + all current tests.
    testKit.ts                ~50-line test()/assertEqual()/assertTrue()/run() harness. No
                             external test framework dependency.
    classify.test.ts, normalize.test.ts, sync.test.ts, query-demo.test.ts, api.test.ts,
    protocol.test.ts          (statusMap serialization: plain-array shape, a real
                             JSON.stringify/JSON.parse round-trip with .get() verified
                             afterward, and a direct regression test of the original bug)
    run.ts                    Imports every *.test.ts file (registering their tests as a
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
`fetchAllUserSubmissions(handle, {stopAtSubmissionId: <cached max id>})`, which pages from
the newest submission backward and stops as soon as it reaches that id — typically 1 request
for an active user checking in again soon after their last sync. The new page(s) are merged
with the cached list via `mergeSubmissions` (dedupe by id, re-sort newest-first).

## Codeforces API Interaction

See `README.md`'s "Technical constraints discovered" section for the full list of
API-specific facts this design depends on (submission ordering, pagination semantics,
problem identity, rate-limit handling, etc.). In short: `problemset.problems` (one
unpaginated call) and `user.status` (paginated in chunks of 500, newest-first) are the only
two endpoints used. `user.info` doubles as handle validation.

## Data Normalization

Raw API responses (`CFRawProblem`, `CFRawSubmission`, `CFRawUser` in `api/endpoints.ts`) are
converted to internal types (`Problem`, `Submission`, `CFUserProfile` in `types/`) by
`data/normalize.ts`. Normalization's job is entirely about smoothing over API inconsistency:
resolving `contestId` vs `problemsetName` vs a missing rating/verdict into a single
predictable shape, and computing the canonical `ProblemKey` via `makeProblemKey()`. No
business logic (classification, filtering, stats) lives here.

## Problem Status Classification

Implemented once, in `data/classify.ts`, and used everywhere status is needed — there is no
second implementation of this logic anywhere else in the codebase.

- SOLVED: at least one submission to that problem has verdict `"OK"`.
- ATTEMPTED: at least one submission exists, none is `"OK"` (yet).
- UNATTEMPTED: no entry in the `StatusMap` at all (not an explicit third enum value stored
  per-problem — `getStatus()` returns `ProblemStatus.Unattempted` for any key with no entry).
- Submissions are de-duplicated by id before classification.
- `failedAttempts` only counts non-OK submissions that happened *before* the first OK
  submission (chronologically, regardless of input array order — the function sorts by
  `creationTimeSeconds` internally).

## Storage / Caching

- Backing store: `chrome.storage.local` only (never `.sync` — see `PROJECT_STATUS.md`
  "Important Decisions" for why).
- Cache entries: `cf:meta` (schema version + per-handle sync timestamps + per-handle latest
  submission id), `cf:problemset` (full normalized `Problem[]`), `cf:submissions:<handle>`,
  `cf:userProfile:<handle>`.
- TTLs: problemset 24h, user data 10min — both overridable via an explicit `force` flag.
- The `StatusMap` itself is never cached; it's always recomputed from cached submissions on
  read (cheap — see "Important Decisions" #3 in `PROJECT_STATUS.md`).

## Filtering System

**Does not exist yet.** This is explicitly Phase 2 scope. `data/query-demo.test.ts` proves
the underlying primitives (`Problem[]` + `StatusMap`) are sufficient for a rating-range +
status query via a plain `Array.filter`, but there is no reusable `getProblems({...})`
function, no tag filtering, no contest filtering, and no shared query engine yet. Do not
assume one exists when planning Phase 2 — build it.

## Recommendation System

**Does not exist.** Phase 5 scope, not started.

## Chrome Extension Components

- **Manifest** (`manifest.json`): `manifest_version: 3`, `action.default_popup`,
  `background.service_worker` (type `module`), `permissions: ["storage"]`,
  `host_permissions: ["https://codeforces.com/api/*"]`. No content scripts (Phase 8 territory,
  not started).
- **Background service worker**: see Directory Structure above. Its only job right now is
  message routing to `syncService`.
- **Popup**: debug-only, described above.
- **No options/settings page yet** (Phase 9).
- **No content scripts / Codeforces page integration yet** (Phase 8).

## Important Interfaces/Types

The ones every future phase will build on top of — treat changes to these as
interface-breaking and update every consumer:

- `Problem` (`types/problem.ts`) — `key`, `contestId`, `problemsetName`, `index`, `name`,
  `type`, `rating`, `tags`, `points`, `solvedCount`.
- `Submission` (`types/submission.ts`) — `id`, `problemKey`, `contestId`, `problemsetName`,
  `index`, `creationTimeSeconds`, `verdict`, `programmingLanguage`.
- `ProblemStatus` enum + `ProblemAttemptSummary` + `StatusMap` (`types/status.ts`).
- `CFUserProfile` (`types/user.ts`).
- `ensureProblemset()` / `ensureUserData()` return shapes (`sync/syncService.ts`) —
  `{problems, fromCache, syncedAt}` and `{profile, submissions, statusMap, fromCache,
  syncedAt}` respectively.

## Important Dependencies

Runtime/build: `vite`, `@crxjs/vite-plugin` (MV3-aware bundling — reads `manifest.json`,
bundles the popup HTML and background service worker as real entry points with resolved
imports), `typescript`. Dev/test: `tsx` (runs TypeScript directly under Node for the test
suite — no test framework like vitest/jest installed yet, by design; see `CLAUDE.md`). No
React yet — planned starting Phase 3. No `@types/chrome` — see `PROJECT_STATUS.md`
"Important Decisions" #2.

**As of this writing, none of these have actually been `npm install`ed in the environment
this project has been developed in (no network access) — see `PROJECT_STATUS.md` "Known
Issues" for what that means for build verification.**
