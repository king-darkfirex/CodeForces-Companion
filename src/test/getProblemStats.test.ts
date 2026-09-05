import { test, assertEqual } from "./testKit";
import { getProblemStats } from "../query/getProblems";
import { Problem } from "../types/problem";
import { ProblemAttemptSummary, ProblemStatus, StatusMap } from "../types/status";

function problem(overrides: Partial<Problem> & { key: string }): Problem {
  return {
    contestId: 1,
    problemsetName: null,
    index: overrides.key.split("-")[1] ?? "A",
    name: `Problem ${overrides.key}`,
    type: "PROGRAMMING",
    rating: null,
    tags: [],
    points: null,
    solvedCount: null,
    ...overrides,
  };
}

function summary(status: ProblemStatus.Solved | ProblemStatus.Attempted): ProblemAttemptSummary {
  return {
    status,
    totalSubmissions: 1,
    failedAttempts: status === ProblemStatus.Attempted ? 1 : 0,
    firstAttemptAt: 1,
    lastAttemptAt: 1,
    firstSolvedAt: status === ProblemStatus.Solved ? 1 : null,
  };
}

test("all solved", () => {
  const problems = [problem({ key: "C1-A" }), problem({ key: "C1-B" })];
  const statusMap: StatusMap = new Map([
    ["C1-A", summary(ProblemStatus.Solved)],
    ["C1-B", summary(ProblemStatus.Solved)],
  ]);
  assertEqual(getProblemStats(problems, statusMap), { total: 2, solved: 2, attempted: 0, unattempted: 0 });
});

test("all attempted", () => {
  const problems = [problem({ key: "C1-A" }), problem({ key: "C1-B" })];
  const statusMap: StatusMap = new Map([
    ["C1-A", summary(ProblemStatus.Attempted)],
    ["C1-B", summary(ProblemStatus.Attempted)],
  ]);
  assertEqual(getProblemStats(problems, statusMap), { total: 2, solved: 0, attempted: 2, unattempted: 0 });
});

test("all unattempted (empty StatusMap)", () => {
  const problems = [problem({ key: "C1-A" }), problem({ key: "C1-B" })];
  const statusMap: StatusMap = new Map();
  assertEqual(getProblemStats(problems, statusMap), { total: 2, solved: 0, attempted: 0, unattempted: 2 });
});

test("mixed statuses are counted correctly", () => {
  const problems = [problem({ key: "C1-A" }), problem({ key: "C1-B" }), problem({ key: "C1-C" }), problem({ key: "C1-D" })];
  const statusMap: StatusMap = new Map([
    ["C1-A", summary(ProblemStatus.Solved)],
    ["C1-B", summary(ProblemStatus.Attempted)],
    // C1-C, C1-D absent -> unattempted
  ]);
  assertEqual(getProblemStats(problems, statusMap), { total: 4, solved: 1, attempted: 1, unattempted: 2 });
});

test("a problem missing from StatusMap counts as unattempted, not omitted", () => {
  const problems = [problem({ key: "C1-A" })];
  const statusMap: StatusMap = new Map(); // no entry for C1-A at all
  assertEqual(getProblemStats(problems, statusMap), { total: 1, solved: 0, attempted: 0, unattempted: 1 });
});

test("an empty problem list gives all-zero stats", () => {
  assertEqual(getProblemStats([], new Map()), { total: 0, solved: 0, attempted: 0, unattempted: 0 });
});

test("total always equals the supplied problem list's length, not statusMap.size", () => {
  const problems = [problem({ key: "C1-A" })];
  // StatusMap has extra entries for problems not in the supplied list (e.g. an
  // orphaned/out-of-universe key) -- total must still reflect problems.length only.
  const statusMap: StatusMap = new Map([
    ["C1-A", summary(ProblemStatus.Solved)],
    ["C1-Z", summary(ProblemStatus.Solved)],
    ["C1-Y", summary(ProblemStatus.Attempted)],
  ]);
  const stats = getProblemStats(problems, statusMap);
  assertEqual(stats.total, problems.length);
  assertEqual(stats, { total: 1, solved: 1, attempted: 0, unattempted: 0 });
});

test("does not mutate the input array or its elements", () => {
  const problems = [problem({ key: "C1-A", tags: ["dp"] }), problem({ key: "C1-B" })];
  const original = problems.map((p) => ({ ...p, tags: [...p.tags] }));
  const statusMap: StatusMap = new Map([["C1-A", summary(ProblemStatus.Solved)]]);

  getProblemStats(problems, statusMap);

  assertEqual(problems, original);
});
