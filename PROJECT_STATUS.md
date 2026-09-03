# PROJECT_STATUS.md — CF Companion

_Last updated: Phase 1 completion + project-management setup session._

## Current Phase

**Phase 1 — Codeforces Data Layer: COMPLETE and verified.**
Not yet started: Phase 2.

## Overall Progress

- [x] Phase 1 — Codeforces data layer (API client, normalization, classification, caching)
- [ ] Phase 2 — Core filtering + statistics engine
- [ ] Phase 3 — Dashboard
- [ ] Phase 4 — Random problem engine
- [ ] Phase 5 — Recommendation engine
- [ ] Phase 6 — Retry My Failures
- [ ] Phase 7 — Tag analysis
- [ ] Phase 8 — Codeforces website integration
- [ ] Phase 9 — Settings + preferences
- [ ] Phase 10 — Performance + reliability pass
- [ ] Phase 11 — UI/UX polish
- [ ] Phase 12 — Testing + final audit

Only Phase 1 is checked off. Everything else is unbuilt — no placeholder/stub code exists
for later phases beyond what Phase 1 needed (e.g. there is no `getProblems()` filter API
yet; `query-demo.test.ts` only proves the *data layer* can support one by direct array
filtering, it is not the Phase 2 engine).

## Currently Working On

Nothing mid-flight on the statusMap fix — it's complete and tested (see below). One item is
intentionally left open and untouched: `src/popup/popup.ts` and `src/util/exclusiveTask.ts`
already contain sync-lock/lifecycle scaffolding (`createExclusiveRunner`, `AlreadyRunningError`,
button-disable-while-busy) that was drafted alongside the statusMap fix in an earlier pass.
Per explicit instruction, that lifecycle work was left as-is (not removed — it's harmless and
already wired up) but was **not** extended, tested, or verified in this session. It has no
test coverage yet. Treat it as a distinct, separately-trackable follow-up, not part of the
statusMap fix below.

## Completed Recently

- **Fixed a real Phase 1 bug**: `StatusMap` (a `Map`) was being returned as-is through
  `chrome.runtime.sendMessage`'s response. Chrome's extension messaging API serializes
  messages as JSON by default (not structured clone), which collapses any `Map` into `{}`.
  The popup's `statusMap.get(...)` then failed with `TypeError: f.get is not a function`.
  Root cause, trace, and fix are documented in `src/messaging/protocol.ts`.
  - Fix: `serializeStatusMap`/`deserializeStatusMap` in a new, documented message-boundary
    module (`src/messaging/protocol.ts`), used by `service-worker.ts` (serialize before
    `sendResponse`) and `popup.ts` (deserialize after receiving). `classify.ts` and the
    internal `StatusMap` type were **not** changed — `Map` is still used internally.
  - Verified every other `Map`/`Set` usage in the codebase (`normalize.ts`,
    `syncService.ts`'s `mergeSubmissions`) is fully local and never crosses a
    storage/messaging boundary. `chrome.storage.local` never persists a `StatusMap` (already
    true before this fix — see "Important Decisions" below).
  - Added `src/test/protocol.test.ts` (3 tests): serialization produces a plain array,
    survives a real `JSON.stringify`/`JSON.parse` round-trip with `.get()` still working
    afterward, and a regression test reproducing the original bug directly
    (`JSON.parse(JSON.stringify(new Map()))` → `{}`).
  - `npm run typecheck`: pass. `npm test`: 24/24 pass (was 21; +3 new). `npm run build`:
    still fails in this sandbox for the pre-existing, unrelated reason (no network access to
    install `vite`/`@crxjs/vite-plugin` — see "Known Issues", unchanged by this fix).

- Phase 1 implementation, project-management docs, and Git init (see earlier entries below /
  in `CHANGELOG.md`).

## Known Issues

- **The real Vite/CRXJS build has never been run.** Same as before this session — no network
  access in this sandbox to `npm install`. Re-confirmed again after this fix
  (`sh: 1: vite: not found`, no `node_modules`, no `dist/`). Not caused by or related to the
  statusMap fix. **First thing to verify once development continues with normal network
  access.**
- **Untested sync-lock/lifecycle scaffolding already sits in `popup.ts`/`exclusiveTask.ts`**
  (see "Currently Working On"). It's plausible-looking code (mutex-style guard, released in
  a `finally`) but has zero test coverage and hasn't been through a dedicated review/fix
  pass. Don't assume it's correct just because it's present — treat it the same as any other
  unverified code per `CLAUDE.md`.
- No `@types/chrome` — three files declare `chrome` as `any` instead. Intentional, not a
  defect (see `README.md`/`ARCHITECTURE.md`).
- CORS/direct-fetch-from-extension behavior against `codeforces.com/api` is inferred from
  precedent, not personally verified end to end, for the no-network-access reason above.
- Contest names aren't resolved — deferred; not needed for classification/statistics.
- No mechanism yet auto-detects a changed Codeforces handle and clears stale cache —
  earmarked for the Settings phase (Phase 9).

## Tests

Run via `npm test` (= `npx tsx src/test/run.ts`), a zero-dependency custom harness
(`src/test/testKit.ts`) — no test framework installed yet, intentionally, per
`CLAUDE.md`'s "don't add dependencies unnecessarily."

**Current result: 24/24 passing** (re-verified this session; was 21, +3 new). Coverage:

- `classify.test.ts` (8 tests): SOLVED/ATTEMPTED/UNATTEMPTED classification, failed-attempt
  counting, duplicate-submission dedup, independent per-problem classification, null-verdict
  handling, input-order independence.
- `normalize.test.ts` (5 tests): problem-key derivation, `problemStatistics` join-by-id
  (not array order), missing rating/solvedCount → `null`, missing verdict → `null`,
  submission-level `contestId` fallback.
- `sync.test.ts` (2 tests): incremental-merge dedup + sort.
- `query-demo.test.ts` (1 test): the Phase 1 target query — unattempted problems in a rating
  range.
- `api.test.ts` (5 tests): invalid-handle detection, rate-limit retry/backoff, pagination
  continuation and early-stop.
- `protocol.test.ts` (3 tests, new): `StatusMap` serializes to a plain JSON-safe array (not
  a `Map`); survives a real `JSON.stringify`/`JSON.parse` round-trip with `.get()` still
  working afterward; a regression test reproducing the original bug directly.

`npm run typecheck` (`tsc --noEmit`) also passes cleanly — re-verified during this audit.

## Important Decisions

Recorded here so future sessions don't accidentally undo them without realizing they were
deliberate:

1. **Problem identity = `(contestId, index)`**, not name. Duplicate statements across
   contests are treated as distinct problems — this matches the API and every other CF tool.
2. **`chrome` is typed as `any` via a local `declare const chrome: any` in 3 files**, instead
   of adding `@types/chrome`, to keep the Phase 1 dependency list minimal. Fine to change
   later, but do it as a deliberate one-line-per-file addition, not accidentally by mixing
   in a global chrome types package that then conflicts with the local declarations.
3. **`StatusMap` is never persisted** — always recomputed from cached submissions. Cheap
   (O(submissions)) and avoids a second place for staleness to creep in.
4. **Incremental sync relies on `user.status` being sorted newest-first** (confirmed against
   the official API docs, not assumed). If this ever changes, `fetchAllUserSubmissions`'s
   `stopAtSubmissionId` early-exit logic would silently return incomplete data — this is the
   single most load-bearing external assumption in the codebase.
5. **`chrome.storage.local`, not `.sync`** — `.sync`'s 100KB/8-per-item quota can't hold a
   full problemset or a large submission history.
6. **No filtering engine yet** — deliberately deferred to Phase 2 per the original phase
   plan, even though the data layer could technically support ad hoc filters today (see
   `query-demo.test.ts`).

## Next Task

**Verify/finish the sync-lock scaffolding already sitting in `popup.ts`/`exclusiveTask.ts`**
as its own isolated task (it currently has zero test coverage and hasn't been reviewed).
Only after that's resolved: **Phase 2 — Core filtering + statistics engine** — a
`getProblems({ minRating?, maxRating?, exactRating?, status?, tags?, contestId? })`-style
query function built on the existing `Problem[]` + `StatusMap` primitives, plus
rating-distribution and success-rate calculations. No dashboard UI yet (Phase 3). Write
tests for edge cases before considering it done, per `CLAUDE.md`.

## Last Session Summary

**This session's actual work:** Fixed a real, user-reported Phase 1 bug — `StatusMap`
losing its `Map` prototype across `chrome.runtime.sendMessage`. Scope was deliberately
narrow per explicit instruction (statusMap fix only; no sync-lock work; no Phase 2):

- Inspected pre-existing uncommitted changes from an earlier pass (`service-worker.ts`,
  `popup.ts`, `src/messaging/protocol.ts`, `src/util/exclusiveTask.ts`,
  `src/test/protocol.test.ts`) and confirmed the statusMap serialize/deserialize design was
  already correctly implemented and did not need further changes.
- Found and fixed the one gap: `src/test/run.ts` didn't import `protocol.test.ts` yet, so
  those tests never actually ran.
- Left the pre-existing, untouched sync-lock/lifecycle scaffolding
  (`createExclusiveRunner`/`AlreadyRunningError` in `popup.ts`/`exclusiveTask.ts`) exactly as
  found — not removed (per instruction not to discard existing changes), not extended or
  tested (per instruction not to work on it this session).
- Ran `npm run typecheck` (pass), `npm test` (24/24 pass, +3 new), `npm run build` (fails —
  confirmed this is the same pre-existing "no network access to install vite" limitation,
  unrelated to this fix).
- Updated `PROJECT_STATUS.md` (this file) and `CHANGELOG.md`. Committed.

**Files changed:** `src/test/run.ts` (added one import). No other application files needed
changes — `service-worker.ts`, `popup.ts`, `messaging/protocol.ts`, `util/exclusiveTask.ts`,
`test/protocol.test.ts` were already correct from the earlier uncommitted pass and are now
committed as-is.

**Tests run:** `npm run typecheck` (pass), `npm test` (24/24 pass), `npm run build`
(fails — pre-existing, unrelated environment limitation).

**Result:** statusMap Chrome-messaging bug fixed and regression-tested. Sync-lock
scaffolding remains present but unverified/untested — flagged as a distinct next item, not
silently treated as done.

**Remaining work:** Verify/test the sync-lock scaffolding as its own isolated task (not yet
started); then Phase 2 (filtering + statistics engine) once that's resolved. See "Next Task."
