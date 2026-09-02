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

Nothing mid-flight. The project-management system (this file, `CLAUDE.md`,
`ARCHITECTURE.md`, `CHANGELOG.md`, Git init) was just established. No application code
changed during that setup.

## Completed Recently

- Phase 1 implementation: types, Codeforces API client with throttling/retry, normalization,
  SOLVED/ATTEMPTED/UNATTEMPTED classification, `chrome.storage.local`-backed caching with
  TTLs and incremental submission sync, MV3 manifest, background service worker, debug
  popup, 21-test zero-dependency test suite (all passing), README.
- Git repository initialized; Phase 1 committed as the baseline checkpoint
  (`33536a0 feat: Phase 1 — Codeforces data layer ...`).
- Project-management docs created (this file + `CLAUDE.md` + `ARCHITECTURE.md` +
  `CHANGELOG.md`).

## Known Issues

- **The real Vite/CRXJS build has never been run.** The sandbox this project is developed in
  has no network access, so `npm install` cannot reach the npm registry, and therefore
  `npm run build` has never actually been executed or verified — confirmed by re-running it
  during this audit (`sh: 1: vite: not found`, no `node_modules`, no `dist/`). Everything
  that *can* be checked without external packages (`tsc --noEmit`, the test suite) passes,
  but the extension has not been loaded into an actual Chrome instance. **This should be the
  very first thing verified once development resumes on a machine with normal npm/network
  access.**
- No `@types/chrome` — three files (`chromeStorageAdapter.ts`, `service-worker.ts`,
  `popup.ts`) declare `chrome` as `any` instead. Intentional (see `CLAUDE.md`/`README.md`
  "Why no @types/chrome?"), not a defect, but worth knowing about.
- CORS/direct-fetch-from-extension behavior against `codeforces.com/api` is inferred from
  precedent (other CF browser extensions do this successfully), not personally verified end
  to end, for the same no-network-access reason above.
- Contest names aren't resolved (problems only carry `contestId`, not a human-readable name)
  — deferred; not needed for classification/statistics.
- No mechanism yet auto-detects a changed Codeforces handle and clears stale cache
  (`clearHandleCache()` exists but nothing calls it) — earmarked for the Settings phase
  (Phase 9).

## Tests

Run via `npm test` (= `npx tsx src/test/run.ts`), a zero-dependency custom harness
(`src/test/testKit.ts`) — no test framework installed yet, intentionally, per
`CLAUDE.md`'s "don't add dependencies unnecessarily."

**Current result: 21/21 passing.** Re-verified during this audit session (not assumed from
prior notes). Coverage:

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

**Phase 2 — Core filtering + statistics engine.** Specifically: design and implement a
`getProblems({ minRating?, maxRating?, exactRating?, status?, tags?, contestId? })`-style
query function in a new `src/data/` (or `src/query/`) module, built on top of the existing
`Problem[]` + `StatusMap` primitives from Phase 1 — plus rating-distribution and
success-rate calculation functions. No dashboard UI yet (that's Phase 3). Write tests for
edge cases (empty rating range, no matching tags, exact-rating vs range, status combinations)
before considering it done, per `CLAUDE.md`'s development process.

Do not start Phase 3 (dashboard) until Phase 2 is implemented, tested, and this file is
updated to reflect it.

## Last Session Summary

**This session's actual work:** No application code was changed. This was a project-audit +
project-management-setup session, per explicit user request:

- Inspected the full existing project (file tree, `package.json`, `tsconfig.json`,
  `vite.config.ts`, `manifest.json`, `src/test/testKit.ts` specifically, git status).
- Re-ran `tsc --noEmit` and `npm test` to verify current state rather than trust prior notes
  — both pass (0 typecheck errors, 21/21 tests).
- Confirmed `npm run build` has never succeeded (no network access in this environment to
  `npm install`; re-confirmed by attempting it — `vite: not found`).
- Initialized Git (`main` branch), created the baseline commit for all of Phase 1's work.
- Created `CLAUDE.md`, `PROJECT_STATUS.md` (this file), `ARCHITECTURE.md`, `CHANGELOG.md`.
- Packaged and delivered a downloadable zip backup of the full project (including `.git`)
  for the user to store outside this environment — see the chat response for the persistence
  explanation and download link; this file doesn't restate it since it's environment status,
  not project status.

**Files changed:** `CLAUDE.md` (new), `PROJECT_STATUS.md` (new), `ARCHITECTURE.md` (new),
`CHANGELOG.md` (new). No source files under `src/` were touched.

**Tests run:** `npm run typecheck` (pass), `npm test` (21/21 pass).

**Result:** Project confirmed stable and exactly at "Phase 1 complete." Git established.

**Remaining work:** Everything in "Overall Progress" from Phase 2 onward. See "Next Task"
above for the specific next step.
