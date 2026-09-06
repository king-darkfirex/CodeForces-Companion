import { test, assertEqual, assertTrue } from "./testKit";
import { getRandomProblem } from "../query/getRandomProblem";
import { Problem } from "../types/problem";

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

test("returns null for an empty array", () => {
  assertEqual(getRandomProblem([]), null);
});

test("the result belongs to the supplied array", () => {
  const problems = [problem({ key: "C1-A" }), problem({ key: "C1-B" }), problem({ key: "C1-C" })];
  for (let i = 0; i < 25; i++) {
    const result = getRandomProblem(problems);
    assertTrue(result !== null && problems.includes(result), "expected the picked problem to be one of the supplied problems");
  }
});

test("a single-element array always returns that element", () => {
  const onlyProblem = problem({ key: "C1-A" });
  for (let i = 0; i < 10; i++) {
    assertEqual(getRandomProblem([onlyProblem]), onlyProblem);
  }
});

test("does not mutate or reorder the input array", () => {
  const problems = [problem({ key: "C1-A" }), problem({ key: "C1-B" }), problem({ key: "C1-C" })];
  const originalOrder = problems.map((p) => p.key);

  getRandomProblem(problems);

  assertEqual(
    problems.map((p) => p.key),
    originalOrder
  );
  assertEqual(problems.length, 3);
});

test("repeated calls only ever produce values from the input, never anything else", () => {
  const problems = [problem({ key: "C1-A" }), problem({ key: "C1-B" })];
  const seenKeys = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const result = getRandomProblem(problems);
    assertTrue(result !== null, "expected a non-null result for a non-empty array");
    seenKeys.add(result!.key);
  }
  for (const key of seenKeys) {
    assertTrue(key === "C1-A" || key === "C1-B", `unexpected key produced: ${key}`);
  }
});
