# CF Companion — Phase 1: Codeforces Data Layer

**Status:** Phase 1 of 12 (see the full phase plan you provided). This phase builds only the
foundational data layer — API client, normalization, SOLVED/ATTEMPTED/UNATTEMPTED
classification, and caching. There is intentionally no real UI yet, just a bare debug popup
used to exercise the data layer by hand.

## What Phase 1 can do right now

Given a Codeforces handle, the extension can answer:

- "What is the status (solved / attempted / unattempted) of problem X for user Y?"
- "Give me all problems rated 1200–1400 that this user has never attempted."
  (proven in `src/test/query-demo.test.ts` — the full filtering *engine* is Phase 2)

It does this by:
1. Fetching the full public problemset once (`problemset.problems`) and caching it.
2. Fetching a user's entire submission history (`user.status`, paginated) and caching it.
3. Classifying every problem the user has ever submitted to as SOLVED or ATTEMPTED.
   Everything else in the problemset is implicitly UNATTEMPTED.

## Technical constraints discovered (Codeforces API)

These came from re-checking the official API docs (`codeforces.com/apiHelp`) rather than
assuming from memory, since the exact contract matters for correctness:

- **`user.status` is sorted newest-submission-first** (decreasing submission id), and `from`
  is a 1-based index into that list, not a submission id. This is what makes incremental
  sync cheap: we page from the top and can stop as soon as we see a submission id we've
  already cached — everything after it is guaranteed older.
- **No official rate-limit number is published.** Community experience is that rapid bursts
  get throttled. The client serializes all requests through a single throttling gate
  (≥400ms apart) and retries `RateLimitedError`/`NetworkError` with exponential backoff
  (1s/2s/4s) rather than assuming a specific limit.
- **A problem's identity is (contestId, index)**, *not* its name. The same statement
  sometimes appears at two different (contestId, index) pairs (e.g. a Div. 2 G reused as a
  Div. 1 E) — Codeforces treats these as distinct problems with independent submissions and
  ratings, and so does this extension. This is documented behavior, not a bug.
- **A small number of legacy/archive problems have no `contestId`**, only a
  `problemsetName` (e.g. `acmsguru`). The problem key format (`makeProblemKey`) handles
  both, and some submissions carry the contest id at the submission level rather than
  inside the nested `problem` object — normalization checks both places.
- **`verdict` can be absent** on a submission that's still queued/being judged. Treated as
  `null` (an in-flight attempt), not a crash.
- **`problemset.problems` is not paginated** — it always returns the entire problemset in
  one call. `user.status` has no hard documented page size, but very large accounts (many
  thousands of submissions) risk a slow/failing single request, so we always page it
  ourselves in chunks of 500.
- **CORS / browser-side fetch:** Codeforces' API has long been used directly from
  browser-side JS by numerous existing Codeforces companion extensions, which is why this
  design assumes a direct `fetch()` from the extension's background service worker works
  without a proxy. This assumption should be confirmed the first time you load the unpacked
  extension (see Setup below) — I was not able to run an actual Chrome instance in the
  environment this was built in to verify it end-to-end myself.

## Architecture

```
manifest.json              MV3 manifest (points straight at .ts/.html source — see vite.config.ts)
vite.config.ts              @crxjs/vite-plugin wiring
tsconfig.json
package.json

public/icons/               Extension icons (placeholder, replace with real branding later)

src/
  types/                     Pure type definitions, no logic
    problem.ts                 Problem, ProblemKey, makeProblemKey(), problemUrl()
    submission.ts               Submission, Verdict
    status.ts                   ProblemStatus enum, ProblemAttemptSummary, StatusMap
    user.ts                      CFUserProfile

  api/                        Talking to codeforces.com/api — no caching, no app logic
    endpoints.ts                 Raw wire-format types (CFRawProblem, CFRawSubmission, ...)
    errors.ts                    CodeforcesApiError / InvalidHandleError / RateLimitedError / NetworkError
    codeforcesClient.ts           fetchUserInfo, fetchAllUserSubmissions, fetchProblemset
                                   (throttling + retry-with-backoff live here)

  data/                       Pure functions: raw API shapes -> internal types -> classification
    normalize.ts                 normalizeProblemset / normalizeSubmission / normalizeUser
    classify.ts                  classifySubmissions() -> StatusMap  (the core SOLVED/ATTEMPTED/
                                   UNATTEMPTED algorithm, dedupe-by-id, failed-attempt counting)

  storage/                    chrome.storage.local, wrapped
    chromeStorageAdapter.ts      Lazy Promise wrapper around chrome.storage.local
    storageKeys.ts                Key naming + CacheMeta shape
    cache.ts                      Typed read/write helpers for meta/problemset/submissions/profile

  sync/
    syncService.ts               Orchestrates API + storage + classify:
                                    ensureProblemset()  — 24h TTL cache
                                    ensureUserData()    — 10min TTL cache, incremental re-sync
                                    mergeSubmissions()  — dedupe-by-id merge for incremental sync

  background/
    service-worker.ts            MV3 background: routes {SYNC_PROBLEMSET, SYNC_USER} messages
                                   from the popup to syncService

  popup/                       Debug-only UI for this phase (real UI starts Phase 3)
    popup.html
    popup.ts

  test/                        Zero-dependency test harness + tests (`npm test`)
    testKit.ts, *.test.ts, run.ts
```

### Why no `@types/chrome`?

To keep the dependency list minimal for this phase, `chrome` is declared as `any` in the two
files that touch it directly (`chromeStorageAdapter.ts`, `service-worker.ts`, `popup.ts`).
Everything else in the codebase is fully typed. If you'd like full typing on the `chrome.*`
surface, `npm i -D @types/chrome` and delete the `declare const chrome: any;` lines — no
other changes needed.

### Why is there no formal "query/filter engine" yet?

The brief calls that out explicitly as Phase 2 scope. `query-demo.test.ts` proves the data
layer already has everything a filter engine would need (rating, tags, status via
`classifySubmissions`), without prematurely building the reusable `getProblems({...})` API —
that's next.

### Caching strategy

- **Problemset:** `chrome.storage.local`, refreshed if older than 24h or on manual force-refresh.
  Problems don't change often enough to justify polling more aggressively.
- **User submissions:** refreshed if older than 10 minutes, or force-refreshed. On a
  refresh where we already have cached submissions, `ensureUserData` does an **incremental**
  fetch: it pages `user.status` from the top only until it reaches a submission id it has
  already cached, then merges. A brand-new sync (or a forced one) does a full paginated fetch.
- **Why not cache the computed `StatusMap`?** It's derived data — recomputing it from cached
  submissions is O(submissions) and takes well under a millisecond even for a few thousand
  submissions, so persisting it would just be another place for it to go stale relative to
  the submissions it's derived from, for no real performance benefit.
- **Why `chrome.storage.local` and not `.sync`?** `.sync` caps out at 100KB total / 8KB per
  item — a full problemset (several thousand problems) or a large submission history would
  blow through that immediately. `.local` defaults to ~10MB, which is enough for the
  problemset plus most users' submission histories (see Known Limitations for the very
  largest accounts).

## Testing

No test framework is installed yet (kept out to minimize dependencies for a phase that's
pure logic) — `src/test/testKit.ts` is a ~40-line dependency-free `test`/`assertEqual`/`run`
harness, executed via `tsx` (already a devDependency).

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # runs src/test/run.ts via tsx
```

All 21 tests pass as of this phase, covering:
- Classification: solved-with-no-failures, attempted-only, failed-attempts-before-a-solve,
  resubmissions-after-solving not counted as failures, duplicate submission ids, independent
  problems, pending/null verdicts, out-of-order input.
- Normalization: problem-key derivation, `problemStatistics` joined by id (not array order),
  missing rating/solvedCount → `null`, missing verdict → `null`, submission-level contestId
  fallback.
- Sync: incremental merge dedupes and re-sorts correctly.
- API client: invalid-handle detection, rate-limit retry/backoff, pagination continuing
  across pages and stopping early once a known submission id is reached.
- The end-to-end "unattempted problems rated 1200–1400" query from the Phase 1 brief.

## Setup (load the unpacked extension)

I could not run an actual Chrome instance or `npm install` against the public registry in
the sandboxed environment this was built in (no network egress), so the build itself is
unverified end-to-end — please run these steps and let me know what you see, especially any
manifest/build errors, so Phase 2 can fix anything Phase 1 got wrong before building on it.

```bash
npm install
npm run build        # outputs dist/
```

Then in Chrome:
1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked**, select the `dist/` folder produced by `npm run build`.
4. Click the extension icon, enter a Codeforces handle (e.g. `tourist`), click **Sync**.
5. You should see solved/attempted/unattempted counts, and can try the rating-range query box.

For active development with hot reload, `npm run dev` and load the `dist/` folder the same
way — CRXJS handles live-reloading the unpacked extension as you edit source files.

## Known limitations (Phase 1)

- **No real UI.** The popup is a debug harness, not the dashboard/practice UI (Phases 3–4).
- **Contest names aren't resolved.** Problems only carry `contestId`, not a human-readable
  contest name (that requires a separate `contest.list` call) — deferred since it's not
  needed for classification/statistics, only for display polish later.
- **Extremely large accounts:** `chrome.storage.local`'s default quota (~10MB) comfortably
  fits the problemset (~10k problems) and the vast majority of users' submission histories.
  A user with an unusually large number of submissions could theoretically approach that
  limit; if this becomes a real issue we'd request the `unlimitedStorage` permission — not
  done preemptively since it's an extra permission prompt for a case that may not occur.
- **No `@types/chrome`** — see above; a straightforward one-line-per-file addition if wanted.
- **Handle rename:** if a user changes their Codeforces handle, the extension has no way to
  know the old cache is for a stale handle; `clearHandleCache()` exists for this but nothing
  currently calls it automatically. Likely belongs in the Settings phase (Phase 9) once
  there's a persisted "current handle" setting whose change can be detected.
- **CORS assumption unverified by me** — see the API constraints section above.

## Next: Phase 2

Build the reusable filtering/statistics engine (`getProblems({ minRating, maxRating, status,
tags, ... })`) on top of this data layer, plus rating-distribution and success-rate
calculations — still no dashboard UI yet.
