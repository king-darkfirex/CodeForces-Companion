# PROJECT_STATUS.md — CF Companion

_Last updated: V1 documentation-reconciliation session (no code changes)._

## Current Status

**V1: COMPLETE.** The extension syncs a Codeforces handle, classifies every problem as
solved/attempted/unattempted, and gives the user filtering, statistics, and a random-problem
picker over that data through a polished popup UI. V2 has not been started and is out of
scope until explicitly planned.

This file previously described a 12-phase roadmap (Phase 1 data layer through Phase 12 final
audit) and had fallen badly out of date — it still claimed only Phase 1 was done. That phase
framing has been retired: V1, as actually built, doesn't map cleanly onto those phase
boundaries (e.g. filtering/statistics/random-selection/UI polish were built incrementally and
interleaved, not as discrete numbered phases). What follows describes what's actually
implemented, verified directly against the current source and a clean `npm run typecheck` +
`npm test` run, not inferred from old notes.

## V1 Feature Set (implemented and verified)

- **Codeforces sync and caching** — `sync/syncService.ts`. `ensureProblemset()` (24h TTL) and
  `ensureUserData()` (10min TTL), both backed by `chrome.storage.local`
  (`storage/cache.ts`/`storageKeys.ts`). Force-refresh bypasses TTL. Incremental user-data
  sync pages only submissions newer than the last known submission id and merges
  (`mergeSubmissions`) rather than re-fetching everything.
- **Solved / attempted / unattempted classification** — `data/classify.ts`
  (`classifySubmissions` → `StatusMap`). Single source of truth for status everywhere it's
  used (statistics, filtering, tag collection).
- **Rating filtering** — `query/getProblems.ts`'s `getProblems()`, `minRating`/`maxRating`.
- **Multi-status filtering** — `getProblems()`'s `status` filter accepts a single
  `ProblemStatus` or an array of them (matches if the problem's status is any of them).
- **Tag filtering** — `getProblems()`'s `tags` filter, AND semantics (a problem must carry
  every listed tag); empty/omitted = no tag filter.
- **Tag selector with recent/all tags** — `popup/tagMenu.ts` + wiring in `popup.ts`. A
  dropdown next to the manual comma-separated tags input showing "Recent tags" (persisted in
  `localStorage`, most-recently-used first, capped) and "All tags" (derived live from the
  currently-loaded `Problem[]`, never hard-coded). Manual typing and clicking a chip both
  operate on the same `#tags` input value, so they can't disagree.
- **Random problem selection** — `query/getRandomProblem.ts` (uniform random pick over a
  given list, injectable `randomFn` for deterministic tests).
- **Filtered random problem selection** — `query/getRandomProblemByFilter.ts` (`getProblems()`
  then `getRandomProblem()` — no duplicated filtering/selection logic). Wired to the same
  rating/status/tags controls as the "Count problems" query.
- **Problem statistics** — `getProblemStats()` (total/solved/attempted/unattempted),
  displayed as a color-coded stat grid.
- **Success rate** — `getSuccessRate()` (`solved / (solved + attempted)`, `null` on 0/0 to
  avoid `NaN`), displayed as a percentage + progress bar.
- **Rating distribution** — `getRatingDistribution()`: discrete 100-point Codeforces rating
  levels (800, 900, …, 3500) plus a separate "Unrated" count, each problem counted exactly
  once (out-of-range/non-multiple-of-100 ratings, which shouldn't occur in real data, are
  clamped/rounded rather than dropped). Displayed as a horizontal bar list. This replaced an
  earlier, coarser 14-bucket range design (`< 800`, `800–999`, …, `3000+`) that didn't match
  how Codeforces actually labels problem ratings.
- **Last-synced state** — `popup/formatRelativeTime.ts` (e.g. "5 minutes ago"), shown in the
  sync status readout after both a fresh sync and a cache restore.
- **Popup cache restoration** — `sync/syncService.ts`'s `peekCachedState()` +
  `PEEK_CACHED_STATE` message (`messaging/protocol.ts`) + `popup.ts`'s `restoreFromCache()`.
  Runs once when the popup opens: a network-free, TTL-free read of whatever's already cached
  for the last-used handle, so stats/rating distribution/handle field are populated instantly
  without waiting for (or forcing) a new sync. No-op (normal empty state) if nothing's cached
  yet.
- **Sync locking / busy state** — `util/exclusiveTask.ts`'s `createExclusiveRunner()`, used by
  `popup.ts`'s `handleSyncClick` so only one sync runs at a time; Sync/Force-refresh/Count/
  Random buttons are disabled while busy. An overlapping click is rejected with
  `AlreadyRunningError` and shown as a message, without disturbing the busy state owned by the
  sync actually in flight.
- **Error handling** — Typed error hierarchy (`api/errors.ts`:
  `InvalidHandleError`/`RateLimitedError`/`NetworkError`/base `CodeforcesApiError`) surfaces
  through `messaging/protocol.ts`'s `ExtensionResponse` as `{ok:false, error:{name,message}}`.
  The popup maps known error names to short, friendly, plain-language messages
  (`friendlySyncErrorMessage()`) styled as a distinct error state (`.status-readout--error`),
  while the full technical error is always still logged via `console.error` for debugging.
  Unexpected exceptions are always caught (`handleSyncClick`'s `try`/`catch`,
  `runRangeQuery`'s, `showRandomProblem`'s) so the popup can never get stuck on "Syncing…".
  Starting a new Sync/Force-refresh immediately clears the previous sync's stats/rating
  distribution/random result/in-memory data (`clearSyncedDisplays()`), so a failed sync (e.g.
  an invalid handle) can never leave a previous user's results visible or queryable.
- **Final popup UI/polish** — Branded dashboard layout (header, six clearly separated panels:
  Sync / Problem stats / Rating distribution / Filters / Random problem), a cohesive slate +
  blue color palette defined as CSS custom properties, consistent button/input/chip styling,
  real empty states, and an original logo (an ascending four-bar "rating progression" mark,
  geometric and blue-toned — not the Codeforces logo, not derived from any third-party icon)
  used both as the popup header mark and the extension's 16/48/128px icons.

## Known Limitation (documented, not investigated further here)

**The tracked Codeforces problemset does not necessarily equal a user's profile-wide solved
count.** This extension classifies solved/attempted/unattempted by matching a user's
submissions against `problemset.problems` (the current, general Codeforces problemset, as
returned by the API and cached in `cf:problemset`). A user's own Codeforces profile page can
report a different total-solved number. The discrepancy has been observed but its root cause
has not been investigated (per explicit instruction, out of scope for this and the
immediately preceding sessions) — do not assume a specific cause (e.g. gym/mashup problems,
removed/renamed problems) without actually investigating it first.

## Known Issues (carried forward, still accurate)

- **The real Vite/CRXJS build has never been run.** `npm install` fails in this sandbox (no
  registry access — verified again this session: `npm install` returns a 403 from
  `registry.npmjs.org`). `npm run typecheck` and `npm test` work because `tsc`/`tsx` happen to
  already be available as global binaries in this environment, bypassing the need for
  `node_modules`. **First thing to verify once development continues with normal network
  access:** an actual `npm install` + `npm run build`, and loading the built output as an
  unpacked extension in Chrome.
- No `@types/chrome` — `chrome` is declared as `any` in the files that need it, by deliberate
  choice (see "Important Decisions" below), not an oversight.
- CORS/direct-fetch-from-extension behavior against `codeforces.com/api` is inferred from
  precedent, not personally verified end to end, for the no-network-access reason above.
- Contest names aren't resolved/displayed — not needed for classification/statistics/the
  current UI.
- No mechanism auto-detects a changed Codeforces handle and clears stale cache for a
  different handle. `peekCachedState()` always restores the single most-recently-used handle.
- The problemset-vs-profile-solved-count limitation above.

## Tests

Run via `npm test` (= `npx tsx src/test/run.ts`), a zero-dependency custom harness
(`src/test/testKit.ts`) — no test framework dependency, by design (see `CLAUDE.md`).

**Current result: 142/142 passing** (re-run directly this session, not assumed).
`npm run typecheck` (`tsc --noEmit`) also passes cleanly.

Test files (`src/test/*.test.ts`, all registered in `src/test/run.ts`):

- `classify.test.ts` — SOLVED/ATTEMPTED/UNATTEMPTED classification, failed-attempt counting,
  dedup, per-problem independence, null-verdict handling, order independence.
- `normalize.test.ts` — problem-key derivation, statistics join-by-id, missing
  rating/solvedCount/verdict → `null`, submission-level `contestId` fallback.
- `sync.test.ts` — incremental-merge dedup + sort.
- `query-demo.test.ts` — an end-to-end rating-range query over the data-layer primitives.
- `api.test.ts` — invalid-handle detection, rate-limit retry/backoff, pagination.
- `protocol.test.ts` — `StatusMap` (de)serialization across the JSON messaging boundary,
  including a direct regression test of the original Map-collapses-to-`{}` bug.
- `exclusiveTask.test.ts` — sync-lock semantics (normal run, concurrent rejection, lock
  release on success/thrown-error/async-rejection, independent instances).
- `getProblems.test.ts` — rating range, single/multi status, tag AND-semantics, combined
  filters, no-filter passthrough, non-mutation.
- `getProblemStats.test.ts` — total/solved/attempted/unattempted counting.
- `getSuccessRate.test.ts` — ratio calculation, `null` on 0/0, never `NaN`/`Infinity`.
- `getRandomProblem.test.ts` — uniform selection via injectable `randomFn`, empty list →
  `null`, non-mutation.
- `getRandomProblemByFilter.test.ts` — filter-then-pick composition, no match → `null`.
- `getRatingDistribution.test.ts` — every 100-point level, boundary rounding, clamping of
  out-of-range ratings, `Unrated`, mixed input, empty input, non-mutation.
- `statusSelect.test.ts` — status `<select>` value → `ProblemFilters.status` mapping.
- `randomProblemDisplay.test.ts` — random-result label/URL formatting (rated, unrated,
  `problemsetName`-based problems).
- `tagsInput.test.ts` — comma-separated tags parsing (whitespace, empty entries, dedup-free
  passthrough).
- `tagMenu.test.ts` — `collectAllTags`, `toggleTagInInput`, `addRecentTags`, and
  `isOutsideTagMenu` (the tag-menu-vs-manual-input click-outside fix).
- `formatRelativeTime.test.ts` — relative-time formatting boundaries (just now, minutes,
  hours, days, singular/plural, negative-elapsed fallback).

## Important Decisions

Recorded so future sessions don't accidentally undo them without realizing they were
deliberate:

1. **Problem identity = `(contestId, index)`**, not name. Duplicate statements across
   contests are treated as distinct problems.
2. **`chrome` is typed as `any`** via a local `declare const chrome: any` in the files that
   need it, instead of adding `@types/chrome`, to keep the dependency list minimal.
3. **`StatusMap` is never persisted** — always recomputed from cached submissions
   (`classifySubmissions`). Cheap and avoids a second place for staleness to creep in.
4. **Incremental sync relies on `user.status` being sorted newest-first** (per the official
   API docs). If this ever changes, the stop-at-id early-exit logic would silently return
   incomplete data — the single most load-bearing external assumption in the codebase.
5. **`chrome.storage.local`, not `.sync`** — `.sync`'s quota can't hold a full problemset or a
   large submission history.
6. **Rating distribution uses discrete 100-point levels (800–3500) + "Unrated"**, not the
   originally-used 14 broad ranges — this matches how Codeforces actually labels problem
   ratings. Out-of-range/non-round ratings are clamped/rounded into the nearest level rather
   than dropped, so every problem is still counted exactly once.
7. **The tag menu never maintains its own "selected tags" state.** Both the manual text input
   and the clickable menu read/write the same `#tags` input value; the menu is re-rendered
   from that value every time it's shown, so the two can't drift apart.
8. **Recent tags are stored in `localStorage`, not `chrome.storage.local`.** It's a small,
   purely-cosmetic, per-browser-profile convenience (not synced data worth the extra
   messaging round-trip through the background worker), so the simplest available browser
   storage was used deliberately.
9. **Sync errors are friendly-mapped for display but never lose their technical detail** —
   `console.error` always logs the raw `{name, message}` even though the popup shows a short,
   plain-language message. Error *handling* (what's thrown, caught, and how) was not changed
   when this was added — only what's displayed.
10. **The logo/icon is original artwork** (an ascending four-bar mark), deliberately not the
    Codeforces logo and not derived from any third-party/stock icon (an earlier attempt to use
    a downloaded Icons8 icon was declined for licensing/trademark reasons — see `git log`).

## Next Task

None queued. V1 is complete and not to be extended without explicit new instruction. A future
session planning V2 should start by reading this file, `ARCHITECTURE.md`, and `git log` in
full — per `CLAUDE.md`'s session-continuity rules — rather than assuming any specific V2
feature list, since none has been agreed yet.

## Last Session Summary

This session performed **documentation reconciliation only** — no source, test, or manifest
changes. `PROJECT_STATUS.md`, `ARCHITECTURE.md`, and `CHANGELOG.md` were rewritten/updated to
match the actual current implementation (verified by reading the current source directly, not
by trusting the previous, badly-stale versions of these files, which still described the
project as "Phase 1 of 12" complete). `CLAUDE.md` had one factual correction (a stale
workspace path). `npm run typecheck` and `npm test` (142/142) were re-run to confirm nothing
was broken by the doc-only changes (as expected, since no source file was touched).
