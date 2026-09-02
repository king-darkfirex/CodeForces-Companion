import { test, assertEqual } from "./testKit";
import { classifySubmissions, getStatus } from "../data/classify";
import { ProblemStatus } from "../types/status";
import { Submission } from "../types/submission";

function sub(overrides: Partial<Submission>): Submission {
  return {
    id: 1,
    problemKey: "C1-A",
    contestId: 1,
    problemsetName: null,
    index: "A",
    creationTimeSeconds: 1000,
    verdict: "WRONG_ANSWER",
    programmingLanguage: "GNU C++17",
    ...overrides,
  };
}

test("a problem with no submissions has no entry (treated as UNATTEMPTED)", () => {
  const map = classifySubmissions([]);
  assertEqual(getStatus(map, "C1-A"), ProblemStatus.Unattempted);
});

test("a single OK submission marks the problem SOLVED with zero failed attempts", () => {
  const map = classifySubmissions([sub({ id: 1, verdict: "OK" })]);
  const summary = map.get("C1-A")!;
  assertEqual(summary.status, ProblemStatus.Solved);
  assertEqual(summary.failedAttempts, 0);
  assertEqual(summary.totalSubmissions, 1);
});

test("only non-OK submissions -> ATTEMPTED, never SOLVED", () => {
  const map = classifySubmissions([
    sub({ id: 1, verdict: "WRONG_ANSWER", creationTimeSeconds: 100 }),
    sub({ id: 2, verdict: "TIME_LIMIT_EXCEEDED", creationTimeSeconds: 200 }),
  ]);
  const summary = map.get("C1-A")!;
  assertEqual(summary.status, ProblemStatus.Attempted);
  assertEqual(summary.failedAttempts, 2);
  assertEqual(summary.firstSolvedAt, null);
});

test("failed attempts before a solve count; resubmissions after solving don't add extra failures", () => {
  const map = classifySubmissions([
    sub({ id: 1, verdict: "WRONG_ANSWER", creationTimeSeconds: 100 }),
    sub({ id: 2, verdict: "WRONG_ANSWER", creationTimeSeconds: 200 }),
    sub({ id: 3, verdict: "OK", creationTimeSeconds: 300 }),
    sub({ id: 4, verdict: "WRONG_ANSWER", creationTimeSeconds: 400 }), // e.g. trying another language after already solving
  ]);
  const summary = map.get("C1-A")!;
  assertEqual(summary.status, ProblemStatus.Solved);
  assertEqual(summary.failedAttempts, 2);
  assertEqual(summary.totalSubmissions, 4);
  assertEqual(summary.firstSolvedAt, 300);
});

test("duplicate submission ids (e.g. from an overlapping incremental re-fetch) are not double counted", () => {
  const map = classifySubmissions([
    sub({ id: 1, verdict: "WRONG_ANSWER", creationTimeSeconds: 100 }),
    sub({ id: 1, verdict: "WRONG_ANSWER", creationTimeSeconds: 100 }), // duplicate
    sub({ id: 2, verdict: "OK", creationTimeSeconds: 200 }),
  ]);
  const summary = map.get("C1-A")!;
  assertEqual(summary.totalSubmissions, 2);
  assertEqual(summary.status, ProblemStatus.Solved);
});

test("submissions to different problems are classified independently, and a problem is never both ATTEMPTED and UNATTEMPTED", () => {
  const map = classifySubmissions([
    sub({ id: 1, problemKey: "C1-A", verdict: "OK" }),
    sub({ id: 2, problemKey: "C1-B", verdict: "WRONG_ANSWER" }),
  ]);
  assertEqual(getStatus(map, "C1-A"), ProblemStatus.Solved);
  assertEqual(getStatus(map, "C1-B"), ProblemStatus.Attempted);
  assertEqual(getStatus(map, "C1-C"), ProblemStatus.Unattempted); // never submitted
});

test("a pending/still-judging submission (null verdict) counts as an attempt, not a solve", () => {
  const map = classifySubmissions([sub({ id: 1, verdict: null })]);
  assertEqual(getStatus(map, "C1-A"), ProblemStatus.Attempted);
});

test("submissions are sorted by time before classification, regardless of input order", () => {
  const map = classifySubmissions([
    sub({ id: 2, verdict: "OK", creationTimeSeconds: 300 }),
    sub({ id: 1, verdict: "WRONG_ANSWER", creationTimeSeconds: 100 }), // arrives "after" the OK in the input array
  ]);
  const summary = map.get("C1-A")!;
  assertEqual(summary.firstSolvedAt, 300);
  assertEqual(summary.failedAttempts, 1); // the WA at t=100 is still before the solve chronologically
});
