import { test, assertEqual, assertTrue } from "./testKit";
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

function keys(problems: Problem[]): string[] {
  return problems.map((p) => p.key).sort();
}

test("no filters returns every tracked problem, including unrated ones", () => {
  const result = getProblems(allProblems, buildStatusMap());
  assertEqual(keys(result), ["C1-A", "C1-B", "C1-C", "C1-D"]);
});

test("minRating excludes problems below it and excludes unrated problems entirely", () => {
  const result = getProblems(allProblems, buildStatusMap(), { minRating: 1200 });
  assertEqual(keys(result), ["C1-B", "C1-C"]);
});

test("minRating: 0 still filters (not treated as 'no filter' just because it's falsy)", () => {
  const result = getProblems(allProblems, buildStatusMap(), { minRating: 0 });
  assertEqual(keys(result), ["C1-A", "C1-B", "C1-C"]);
});

test("maxRating excludes problems above it and excludes unrated problems entirely", () => {
  const result = getProblems(allProblems, buildStatusMap(), { maxRating: 1200 });
  assertEqual(keys(result), ["C1-A", "C1-B"]);
});

test("minRating + maxRating together narrow to a rating range", () => {
  const result = getProblems(allProblems, buildStatusMap(), { minRating: 1000, maxRating: 1500 });
  assertEqual(keys(result), ["C1-B"]);
});

test("unrated problems are only ever returned when no rating filter is applied", () => {
  const withoutFilter = getProblems(allProblems, buildStatusMap());
  assertTrue(withoutFilter.some((p) => p.key === "C1-D"), "expected the unrated problem when no rating filter is set");

  const withFilter = getProblems(allProblems, buildStatusMap(), { minRating: 1 });
  assertTrue(!withFilter.some((p) => p.key === "C1-D"), "expected the unrated problem to be excluded once any rating filter is set");
});

test("status: SOLVED returns only solved problems", () => {
  const result = getProblems(allProblems, buildStatusMap(), { status: ProblemStatus.Solved });
  assertEqual(keys(result), ["C1-A"]);
});

test("status: ATTEMPTED returns only attempted problems", () => {
  const result = getProblems(allProblems, buildStatusMap(), { status: ProblemStatus.Attempted });
  assertEqual(keys(result), ["C1-B"]);
});

test("status: UNATTEMPTED returns problems with no StatusMap entry, including unrated ones", () => {
  const result = getProblems(allProblems, buildStatusMap(), { status: ProblemStatus.Unattempted });
  assertEqual(keys(result), ["C1-C", "C1-D"]);
});

test("a single tag filters to problems that carry it", () => {
  const result = getProblems(allProblems, buildStatusMap(), { tags: ["dp"] });
  assertEqual(keys(result), ["C1-B", "C1-C"]);
});

test("multiple tags require ALL of them (AND semantics), not just any one", () => {
  const result = getProblems(allProblems, buildStatusMap(), { tags: ["dp", "greedy"] });
  assertEqual(keys(result), ["C1-B"]);
});

test("an empty tags array applies no tag filter at all", () => {
  const result = getProblems(allProblems, buildStatusMap(), { tags: [] });
  assertEqual(keys(result), ["C1-A", "C1-B", "C1-C", "C1-D"]);
});

test("rating + status + tag filters combine (all must match)", () => {
  const result = getProblems(allProblems, buildStatusMap(), {
    minRating: 1000,
    status: ProblemStatus.Unattempted,
    tags: ["dp"],
  });
  assertEqual(keys(result), ["C1-C"]);
});

test("an impossible filter combination returns an empty array", () => {
  const result = getProblems(allProblems, buildStatusMap(), { minRating: 5000 });
  assertEqual(result, []);
});

test("getProblems never mutates the input array or its elements", () => {
  const original = allProblems.map((p) => ({ ...p, tags: [...p.tags] }));
  const originalLength = allProblems.length;

  const result = getProblems(allProblems, buildStatusMap(), { minRating: 1000, tags: ["dp"] });

  assertEqual(allProblems.length, originalLength);
  assertEqual(allProblems, original);
  assertTrue(result !== allProblems, "expected a new array, not the same reference");
});

test("status accepts an array: solved + attempted matches either", () => {
  const result = getProblems(allProblems, buildStatusMap(), { status: [ProblemStatus.Solved, ProblemStatus.Attempted] });
  assertEqual(keys(result), ["C1-A", "C1-B"]);
});

test("status accepts an array: solved + unattempted matches either", () => {
  const result = getProblems(allProblems, buildStatusMap(), { status: [ProblemStatus.Solved, ProblemStatus.Unattempted] });
  assertEqual(keys(result), ["C1-A", "C1-C", "C1-D"]);
});

test("status accepts an array of all three statuses, matching everything", () => {
  const result = getProblems(allProblems, buildStatusMap(), {
    status: [ProblemStatus.Solved, ProblemStatus.Attempted, ProblemStatus.Unattempted],
  });
  assertEqual(keys(result), ["C1-A", "C1-B", "C1-C", "C1-D"]);
});

test("an empty status array matches nothing", () => {
  const result = getProblems(allProblems, buildStatusMap(), { status: [] });
  assertEqual(result, []);
});

test("a missing StatusMap entry still behaves as UNATTEMPTED when status is an array", () => {
  const result = getProblems(allProblems, buildStatusMap(), { status: [ProblemStatus.Unattempted] });
  assertEqual(keys(result), ["C1-C", "C1-D"]);
});

test("a single-status array behaves the same as passing that status directly (backward compatible)", () => {
  const viaValue = getProblems(allProblems, buildStatusMap(), { status: ProblemStatus.Solved });
  const viaArray = getProblems(allProblems, buildStatusMap(), { status: [ProblemStatus.Solved] });
  assertEqual(keys(viaValue), keys(viaArray));
});

test("multi-status filter combines with a rating filter", () => {
  const result = getProblems(allProblems, buildStatusMap(), {
    minRating: 1000,
    status: [ProblemStatus.Attempted, ProblemStatus.Unattempted],
  });
  // C1-B (1200, attempted) and C1-C (1600, unattempted) qualify; C1-D is unrated so excluded by the rating filter.
  assertEqual(keys(result), ["C1-B", "C1-C"]);
});

test("multi-status filter combines with a tag filter", () => {
  const result = getProblems(allProblems, buildStatusMap(), {
    status: [ProblemStatus.Solved, ProblemStatus.Unattempted],
    tags: ["dp"],
  });
  // Only C1-C has tag "dp" and is in {SOLVED, UNATTEMPTED}; C1-A has no "dp" tag; C1-B is ATTEMPTED not in the list.
  assertEqual(keys(result), ["C1-C"]);
});

test("multi-status filtering does not mutate the input array or its elements", () => {
  const original = allProblems.map((p) => ({ ...p, tags: [...p.tags] }));
  getProblems(allProblems, buildStatusMap(), { status: [ProblemStatus.Solved, ProblemStatus.Attempted] });
  assertEqual(allProblems, original);
});
