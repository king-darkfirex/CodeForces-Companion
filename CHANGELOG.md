# CHANGELOG.md — CF Companion

Concise, chronological record of meaningful changes. Not every edit — only things worth a
future session (or you) knowing happened.

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
