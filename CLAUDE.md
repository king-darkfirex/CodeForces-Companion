# CLAUDE.md — Development Rules for CF Companion

This file is the permanent instruction set for anyone (human or Claude) working on this
project across sessions. Read this before touching any code.

## Project Safety

- Never delete working functionality without a clear, stated reason.
- Never rewrite the project from scratch. If something looks messy, refactor it in place,
  in a small isolated commit — don't regenerate it.
- Never replace working architecture merely because another approach looks cleaner.
  Working code has value; only change it for a concrete bug, requirement, or limitation.
- Inspect existing code before modifying it. Read the file, understand what calls it and
  what it depends on, before editing.
- Prefer small, isolated changes over large sweeping ones.
- Preserve existing APIs/interfaces (function signatures, exported types, storage key
  formats, message types) unless there's a strong, stated reason to change them — changing
  a storage key format, for instance, silently orphans everyone's existing cache.
- Do not introduce dependencies unnecessarily. Ask "does the standard library / an existing
  dependency already do this?" before adding a package.
- Do not introduce external services (analytics, backends, third-party APIs beyond
  Codeforces) without explicit justification and the user's sign-off — this project's
  privacy stance (see README) is that nothing but Codeforces itself is contacted.
- Never hardcode fake Codeforces data (problems, ratings, submissions, statistics) anywhere,
  including tests-adjacent demo code that might get mistaken for real behavior. Test
  fixtures using clearly-fake ids (e.g. `contestId: 1, index: "A"`) are fine and expected;
  presenting fabricated data as if it came from the API is not.
- Never commit secrets, credentials, or API keys. This project currently has none — keep it
  that way. Codeforces' public API requires no key for the endpoints this project uses.

## Development Process

Before implementing a significant feature:

1. Understand the existing implementation (read the relevant files in full).
2. Identify exactly which files will be affected.
3. Briefly explain the intended change (in the response, not necessarily in a file).
4. Implement the smallest sensible change that satisfies the requirement.
5. Run the relevant tests/typecheck/build.
6. Fix any problems found.
7. Verify previously working functionality still works (re-run the full test suite, not
   just tests for the new code).
8. Update project documentation (`ARCHITECTURE.md` if the architecture changed,
   `README.md` if user-facing behavior changed).
9. Update `PROJECT_STATUS.md`.
10. Create a Git checkpoint when the change represents a meaningful, stable milestone.

## Session Continuity

At the start of every new session, before writing or changing any code:

1. Read `CLAUDE.md` (this file).
2. Read `PROJECT_STATUS.md`.
3. Read `ARCHITECTURE.md`.
4. Inspect `git status` and recent `git log`.
5. Inspect the current implementation directly — read the actual source files for the area
   you're about to touch. Don't infer state purely from documentation; docs can drift.
6. Determine exactly where the previous session stopped, using the "Next Task" and "Last
   Session Summary" sections of `PROJECT_STATUS.md` as a starting hypothesis, then confirm
   against the actual code and test results.
7. Do not assume previous work is complete just because a document says so — run the tests
   and typecheck yourself before building on top of anything.

## When Context/Usage Is Running Low

Never start a large new feature when a session is nearly exhausted (context budget or
message limit). Instead:

1. Finish the smallest safe, self-contained unit of work you're currently on.
2. Run tests/typecheck/build.
3. Leave the project in a working (buildable, test-passing) state — never mid-refactor.
4. Update `PROJECT_STATUS.md` with exactly what's done and what isn't.
5. Update `CHANGELOG.md`.
6. Commit the work if it's stable.
7. Clearly record the exact next step in `PROJECT_STATUS.md`'s "Next Task" section — specific
   enough that a future session doesn't have to guess.

## Workspace Persistence Warning (read this)

The sandboxed filesystem this project lives in (`/home/claude/cf-companion`) is **not
guaranteed to persist between separate conversation sessions**. Treat every session as
potentially the last time this exact copy of the workspace exists. Practical implications:

- Git history inside `.git` here is only as durable as the workspace itself — it is not a
  substitute for an external backup.
- The user should hold an external copy (a downloaded zip, and ideally its own separate Git
  remote) outside this environment. See `PROJECT_STATUS.md` for the current backup status.
- If a new session starts and this directory is empty, missing, or looks unfamiliar: **stop
  and ask the user for their external backup/zip before recreating anything.** Do not
  regenerate the project from the original prompt/spec — that would silently discard any
  work done after the last export.

## Governing Priority

Optimize for, in this order: **correctness → stability → recoverability → maintainability →
speed.** A feature that takes two sessions and works correctly beats one finished in a
single session that introduces a hidden problem.
