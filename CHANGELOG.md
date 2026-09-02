# CHANGELOG.md — CF Companion

Concise, chronological record of meaningful changes. Not every edit — only things worth a
future session (or you) knowing happened.

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
