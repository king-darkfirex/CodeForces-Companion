# CHANGELOG.md — CF Companion

Concise, chronological record of meaningful changes. Not every edit — only things worth a
future session (or you) knowing happened.

## Session: Add tags filter control to popup

**Type:** Feature (UI), narrowly scoped.

- Added a "Tags (comma-separated)" text input to the popup, wired into both "Count problems
  in range" (`getProblems()`) and "Random Problem" (`getRandomProblemByFilter()`). The
  underlying tag-filtering logic (AND semantics, empty list = no filter) already existed in
  `getProblems()` from an earlier session and was **not modified** — this session only adds
  a way to reach it from the UI.
- New `src/popup/tagsInput.ts` (`parseTagsInput()`): splits on `,`, trims each entry, drops
  empty entries. An empty/blank input naturally parses to `[]`, which the existing filtering
  pipeline already treats as "no tag filter" — no extra translation needed. Extracted as a
  small DOM-free pure function so it's testable, following the same pattern as
  `statusSelect.ts`/`randomProblemDisplay.ts` (`popup.ts` itself can't be unit-tested, since
  it touches `document` at import time).
- 6 new tests (`src/test/tagsInput.test.ts`): empty input, blank/whitespace-only input,
  single tag, multiple tags, whitespace trimming, and empty entries from double/leading/
  trailing commas.
- No changes to rating/status controls, "Any status" behavior, random-problem display/link
  behavior, or statistics — all untouched. No changes to `getProblems()`,
  `getRandomProblem()`, or `getRandomProblemByFilter()` themselves.
- `npm run typecheck`: pass. `npm test`: **95/95 pass** (was 89, +6 new).

---

## Session: Add minimal statistics section to popup

**Type:** Feature (UI), narrowly scoped.

- Added a dedicated `<pre id="stats">` block to the popup showing Total/Solved/Attempted/
  Unattempted, populated by a new `renderStats()` in `popup.ts` that calls the existing,
  already-tested `getProblemStats()` — no statistics logic added or duplicated.
- `renderStats()` is called from `syncAll()` right after `lastState` is set, which removed a
  real pre-existing duplication: `syncAll()` previously computed solved/attempted/unattempted
  itself with a manual loop (the exact same calculation `getProblemStats()` already
  performs) just to print it in the sync-result text. That loop is gone; the printed sync
  summary now only covers handle/problemset/submissions sync status, and the counts live
  solely in the new stats block. Since `syncAll()` doesn't branch differently for a fresh
  fetch vs. a cache hit, the stats block updates correctly in both cases automatically.
- Initial/no-data state: the `<pre id="stats">` defaults to "No statistics yet — sync to see
  problem counts." in the HTML, requiring no extra JS state handling.
- No new pure logic was introduced (this is a direct, single call to an already-exhaustively-
  tested function plus a template-literal join), so no new tests were added — consistent
  with how the previous "apply filters to random problem" session also added no tests for
  the same reason.
- No changes to sync/caching internals, rating/status query behavior (`runRangeQuery`),
  Random Problem behavior (`showRandomProblem`), or `getProblemStats()`/`getProblems()`
  themselves.
- `npm run typecheck`: pass. `npm test`: **89/89 pass** (unchanged — confirms nothing broke).

---

## Session: Random Problem now respects the rating/status filters

**Type:** Feature (UI), narrowly scoped.

- The "Random Problem" button now reads the same min/max rating inputs and status `<select>`
  that "Count problems in range" already reads, and passes them to the existing
  `getRandomProblemByFilter()` — no new filtering or selection logic; `showRandomProblem()`
  swapped its call from `getRandomProblem(lastState.problems)` (whole problemset) to
  `getRandomProblemByFilter(problems, statusMap, { minRating, maxRating, status })`.
  "Any status" still maps to `undefined` (no restriction) via the existing
  `statusFilterFromSelection()`, unchanged.
- Empty-result message changed from "No problems available to pick from." to "No problems
  match the selected filters." to reflect that a match failure is now about the filters, not
  just an empty problemset.
- No new pure logic was introduced (this only wires two already-tested functions together
  the same way `runRangeQuery` already does), so no new tests were added — the existing
  `getRandomProblemByFilter` and `statusSelect` suites already cover the behavior being
  reused. `npm run typecheck`: pass. `npm test`: **89/89 pass** (unchanged from before this
  session — confirms nothing else broke).
- No changes to sync, caching, statistics, or the underlying filtering/random-selection
  implementations (`getProblems`, `getRandomProblem`, `getRandomProblemByFilter` themselves
  are all untouched).

---

## Session: Add minimal Random Problem popup UI

**Type:** Feature (UI), narrowly scoped.

- Added a "Random Problem" button to the popup, reusing the existing `getRandomProblem()`
  unfiltered (rating/status/tag filtering via `getRandomProblemByFilter()` is a separate,
  later task). Displays the picked problem's name, contest+index identifier, and rating as
  a clickable link to its real Codeforces page, built with the existing `problemUrl()`
  helper — no new URL-construction logic.
- New `src/popup/randomProblemDisplay.ts` (`formatRandomProblemDisplay()`): the only new
  logic, a small DOM-free formatting function, extracted so it's testable (same reason
  `statusSelect.ts` was split out from `popup.ts` earlier — `popup.ts` itself touches
  `document` at import time and can't be unit tested directly).
- 3 new tests (`src/test/randomProblemDisplay.test.ts`): rated contest problem, unrated
  problem, and a `problemsetName`-based problem with no `contestId`.
- No changes to filtering, statistics, sync, caching, or the status-selector — all untouched.
- `npm run typecheck`: pass. `npm test`: **89/89 pass** (was 86, +3 new).
- **Note:** `PROJECT_STATUS.md`/this file had fallen behind several already-committed Phase 2
  sessions (filtering engine, statistics, random selection, multi-status filters, the
  status-selector UI) before this session started. Not backfilled here — out of scope for a
  narrowly-scoped task. `git log` is the authoritative record for that gap.

---

## Session: Verify + fix sync-lock/lifecycle behavior

**Type:** Verification + targeted bug fix. Scope deliberately narrow per instruction (this
task only — no Phase 2).

- **Verified `createExclusiveRunner`'s core lock semantics were already correct** via 6 new
  direct unit tests (`src/test/exclusiveTask.test.ts`, previously zero coverage): a run
  starts normally; a concurrent second run is rejected with `AlreadyRunningError`; the lock
  is released in a `finally` on success, on a thrown error, and on an async rejection; and
  separate runner instances don't share a lock. No changes to `exclusiveTask.ts` were
  needed — it was correct as written.
- **Found and fixed one real bug** in `popup.ts`'s `handleSyncClick`: `setBusy(true)`/
  `setBusy(false)` wrapped the entire `runExclusive(...)` call, so a rejected
  (`AlreadyRunningError`) overlapping sync attempt's own `finally` block would call
  `setBusy(false)` and re-enable the Sync/Refresh/Query buttons while the *first* sync was
  still genuinely running. Fix: `setBusy(true)`/`setBusy(false)` moved inside the task
  passed to `runExclusive`, so only the call that actually acquires the lock touches busy
  state; a rejected overlapping call now only prints a message and leaves busy state alone.
- Confirmed (already correct, unaffected by the above): `handleSyncClick`'s `try/catch`
  around the whole `runExclusive` call means any unexpected exception from `syncAll` is
  always caught and shown in the popup — it cannot get stuck showing "Syncing…" forever.
- Noted but did not fix (out of scope for this task): `popup.ts`'s `sendMessage` doesn't
  check `chrome.runtime.lastError`, so a closed message port with no response (an MV3
  service-worker-termination edge case) surfaces as an uninformative generic `TypeError`
  rather than a clear message. Still caught and displayed, just not worded well — tracked in
  `PROJECT_STATUS.md` "Known Issues".

**Files changed:** `src/popup/popup.ts` (the `handleSyncClick` fix), `src/test/exclusiveTask.test.ts`
(new, 6 tests), `src/test/run.ts` (added one import). `src/util/exclusiveTask.ts` inspected,
not modified.

**Tests performed:** `npm run typecheck` (pass), `npm test` (30/30 pass, was 24). `npm run
build` intentionally not attempted this session per instruction.

**Result:** All 7 requested sync-lock/lifecycle guarantees verified; the one broken
guarantee (accurate busy-state during an overlapping attempt) fixed and regression-tested.

---

## Session: Fix — statusMap lost its Map prototype across chrome.runtime.sendMessage

**Type:** Bug fix + regression tests. Scope deliberately narrow per instruction (this fix
only — no sync-lock work, no Phase 2).

- **Root cause:** `ensureUserData()`'s `StatusMap` (a real `Map`) was returned as-is through
  `chrome.runtime.sendMessage`'s response. Chrome's extension messaging API serializes
  messages as JSON by default (structured-clone messaging is opt-in, Chrome 148+ only) —
  `JSON.stringify(new Map(...))` produces `"{}"`. The popup's `statusMap.get(...)` then threw
  `TypeError: f.get is not a function` against that empty plain object.
- **Fix:** Added `src/messaging/protocol.ts` — a documented message-boundary contract with
  `serializeStatusMap`/`deserializeStatusMap` converting `Map<string, ProblemAttemptSummary>`
  ⇄ `Array<[string, ProblemAttemptSummary]>` (JSON-safe both directions), plus explicit
  `ExtensionRequest`/`ExtensionResponse`/`SyncProblemsetResponseData`/`SyncUserResponseData`
  types so nothing can accidentally send a raw `Map`/`Set` through this boundary again.
  `service-worker.ts` now serializes before `sendResponse`; `popup.ts` deserializes after
  receiving, before any `.get()` call. `classify.ts` and the internal `StatusMap`
  representation were **not** changed — `Map` is still used internally, exactly as before.
- Verified no other `Map`/`Set` crosses a storage or messaging boundary anywhere in the
  codebase (`normalize.ts` and `syncService.ts`'s `mergeSubmissions` both use a `Map`
  purely as a local temporary, never returned as one).
- Added `src/test/protocol.test.ts` (3 tests): plain-array serialization, a real
  `JSON.stringify`/`JSON.parse` round-trip with `.get()` verified afterward, and a direct
  regression test of the original bug (`Map` → JSON → `{}`).
- Also present in the working tree from an earlier pass, left untouched per instruction:
  sync-lock/lifecycle scaffolding (`createExclusiveRunner`, `AlreadyRunningError`,
  button-disable-while-busy) in `popup.ts`/`src/util/exclusiveTask.ts`. **Not tested or
  reviewed this session** — tracked as a separate follow-up in `PROJECT_STATUS.md`, not
  claimed as verified.

**Files changed:** `src/test/run.ts` (added one import so the new tests actually run — this
was the only gap found; everything else needed for the fix was already correctly implemented
in the working tree before this session started).

**Tests performed:** `npm run typecheck` (pass), `npm test` (24/24 pass, was 21), `npm run
build` (fails — same pre-existing, unrelated "no network access to install vite" limitation
as every prior session; not caused by this fix).

**Result:** statusMap Chrome-messaging bug fixed and regression-tested.

---

## Session: Project-management setup (no application code changed)

**Type:** Audit + process establishment, per explicit user request.

- Audited the existing Phase 1 project in full: directory structure, `package.json`,
  `tsconfig.json`, `vite.config.ts`, `manifest.json`, and specifically re-verified
  `src/test/testKit.ts`'s `process.exit` typing fix (confirmed complete — a minimal
  `declare const process: { exit(code: number): never }` ambient declaration, no
  `@types/node` added).
- Re-ran `npm run typecheck` and `npm test` from scratch rather than trusting prior notes:
  0 typecheck errors, 21/21 tests passing.
- Confirmed `npm run build` has never successfully run in this environment (no network
  access to the npm registry — `node_modules` doesn't exist, `vite` binary not found).
- Initialized a Git repository (`main` branch) and created the baseline commit covering all
  of Phase 1's work: `33536a0 feat: Phase 1 — Codeforces data layer (API client,
  normalization, classification, caching, debug popup)`.
- Added `CLAUDE.md`, `PROJECT_STATUS.md`, `ARCHITECTURE.md`, and this file.
- Packaged the full project (including `.git`) as a downloadable zip for external backup.

**Files changed:** `CLAUDE.md` (new), `PROJECT_STATUS.md` (new), `ARCHITECTURE.md` (new),
`CHANGELOG.md` (new, this file). Nothing under `src/` touched.

**Tests performed:** `npm run typecheck` (pass), `npm test` (21/21 pass).

**Result:** Project confirmed stable at "Phase 1 complete." Process/documentation
infrastructure now in place for safe multi-session development going forward.

---

## Session: Phase 1 — Codeforces Data Layer

**Type:** Feature (initial implementation).

Implemented the full foundational data layer per the Phase 1 brief:

- `src/types/*` — `Problem`/`ProblemKey`/`makeProblemKey`, `Submission`/`Verdict`,
  `ProblemStatus`/`ProblemAttemptSummary`/`StatusMap`, `CFUserProfile`.
- `src/api/*` — raw CF API wire types (`endpoints.ts`), a typed error hierarchy
  (`CodeforcesApiError`, `InvalidHandleError`, `RateLimitedError`, `NetworkError`), and
  `codeforcesClient.ts` (throttled + retrying `fetchUserInfo`, `fetchUserStatusPage`,
  `fetchAllUserSubmissions` with pagination and incremental stop-at-id support,
  `fetchProblemset`).
- `src/data/*` — `normalize.ts` (raw → internal types) and `classify.ts`
  (`classifySubmissions` → `StatusMap`, the SOLVED/ATTEMPTED/UNATTEMPTED source of truth,
  with dedupe-by-submission-id and correct failed-attempt counting relative to the first
  solve).
- `src/storage/*` — lazy `chrome.storage.local` wrapper (`chromeStorageAdapter.ts`), key
  naming + cache metadata shape (`storageKeys.ts`), typed read/write helpers (`cache.ts`).
- `src/sync/syncService.ts` — `ensureProblemset` (24h TTL), `ensureUserData` (10min TTL,
  incremental re-sync via `mergeSubmissions`).
- `src/background/service-worker.ts` — MV3 background message router.
- `src/popup/*` — bare debug popup (handle input, sync button, rating-range query box).
- `manifest.json`, `vite.config.ts` (`@crxjs/vite-plugin`), `tsconfig.json`,
  `package.json`, placeholder icons (`public/icons/`).
- `src/test/*` — zero-dependency test harness (`testKit.ts`) plus 21 tests across
  classification, normalization, incremental-merge, an end-to-end rating-range query
  demonstration, and the API client's error handling/pagination.
- `README.md` — product description, CF API constraints discovered, architecture, setup/
  build instructions, known limitations.

**Files changed:** All of the above (initial creation — see `ARCHITECTURE.md` for the full
tree).

**Tests performed:** `npx tsc --noEmit` (fixed 6 strict-mode errors surfaced by
`noUncheckedIndexedAccess`, then passed cleanly); `npx tsx src/test/run.ts` (21/21 passing).

**Result:** Data layer complete and internally verified. Actual Chrome-loaded / built-extension
verification not possible in this environment (no network access for `npm install`) — flagged
as the first thing to check once development continues with normal network access.
