import { test, assertEqual, assertTrue } from "./testKit";
import { getRandomProblemByFilter } from "../query/getRandomProblemByFilter";
import { getProblems } from "../query/getProblems";
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

// C1-A: rating 800,  tags [greedy]         -> SOLVED
// C1-B: rating 1200, tags [dp, greedy]     -> ATTEMPTED
// C1-C: rating 1600, tags [dp]             -> UNATTEMPTED (no StatusMap entry)
// C1-D: rating null, tags [implementation] -> UNATTEMPTED (no StatusMap entry)
const p800 = problem({ key: "C1-A", rating: 800, tags: ["greedy"] });
const p1200 = problem({ key: "C1-B", rating: 1200, tags: ["dp", "greedy"] });
const p1600 = problem({ key: "C1-C", rating: 1600, tags: ["dp"] });
const pUnrated = problem({ key: "C1-D", rating: null, tags: ["implementation"] });
const allProblems: Problem[] = [p800, p1200, p1600, pUnrated];

function buildStatusMap(): StatusMap {
  return new Map([
    ["C1-A", summary(ProblemStatus.Solved)],
    ["C1-B", summary(ProblemStatus.Attempted)],
  ]);
}

test("random problem from an unrestricted list can be any of the tracked problems", () => {
  const statusMap = buildStatusMap();
  for (let i = 0; i < 25; i++) {
    const result = getRandomProblemByFilter(allProblems, statusMap);
    assertTrue(result !== null && allProblems.includes(result), "expected a member of the full problem list");
  }
});

test("random problem from a rating range always falls within that range", () => {
  const statusMap = buildStatusMap();
  for (let i = 0; i < 25; i++) {
    const result = getRandomProblemByFilter(allProblems, statusMap, { minRating: 1000, maxRating: 1700 });
    assertTrue(result !== null, "expected a match");
    assertTrue(result!.rating !== null && result!.rating >= 1000 && result!.rating <= 1700, `unexpected rating: ${result!.rating}`);
  }
});

test("random problem from a specific status always has that status", () => {
  const statusMap = buildStatusMap();
  for (let i = 0; i < 10; i++) {
    const result = getRandomProblemByFilter(allProblems, statusMap, { status: ProblemStatus.Unattempted });
    assertTrue(result !== null, "expected a match");
    assertTrue(result!.key === "C1-C" || result!.key === "C1-D", `unexpected key: ${result!.key}`);
  }
});

test("random problem from tags always carries every required tag", () => {
  const statusMap = buildStatusMap();
  for (let i = 0; i < 10; i++) {
    const result = getRandomProblemByFilter(allProblems, statusMap, { tags: ["dp", "greedy"] });
    assertTrue(result !== null, "expected a match");
    assertEqual(result!.key, "C1-B"); // only problem with both tags
  }
});

test("combined filters (rating + status + tag) all apply together", () => {
  const statusMap = buildStatusMap();
  const result = getRandomProblemByFilter(allProblems, statusMap, {
    minRating: 1000,
    status: ProblemStatus.Unattempted,
    tags: ["dp"],
  });
  assertEqual(result, p1600); // the only problem matching all three
});

test("returns null when no problem matches the filters", () => {
  const statusMap = buildStatusMap();
  const result = getRandomProblemByFilter(allProblems, statusMap, { minRating: 5000 });
  assertEqual(result, null);
});

test("returns null for an empty problem list regardless of filters", () => {
  assertEqual(getRandomProblemByFilter([], new Map()), null);
});

test("the returned problem always belongs to getProblems()'s own output for the same filters", () => {
  const statusMap = buildStatusMap();
  const filters = { minRating: 800, maxRating: 1600, tags: ["dp"] };
  const expectedPool = getProblems(allProblems, statusMap, filters);
  for (let i = 0; i < 15; i++) {
    const result = getRandomProblemByFilter(allProblems, statusMap, filters);
    assertTrue(result !== null && expectedPool.includes(result), "expected the result to be a member of getProblems()'s own result for identical filters");
  }
});

test("does not mutate the input problems array, its elements, or the StatusMap", () => {
  const problemsCopy = allProblems.map((p) => ({ ...p, tags: [...p.tags] }));
  const statusMap = buildStatusMap();
  const statusMapSizeBefore = statusMap.size;

  getRandomProblemByFilter(allProblems, statusMap, { minRating: 1000, tags: ["dp"] });

  assertEqual(allProblems, problemsCopy);
  assertEqual(statusMap.size, statusMapSizeBefore);
});
