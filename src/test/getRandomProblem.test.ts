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

test("an injected randomFn returning 0 selects the first element", () => {
  const problems = [problem({ key: "C1-A" }), problem({ key: "C1-B" }), problem({ key: "C1-C" })];
  assertEqual(getRandomProblem(problems, () => 0), p("C1-A", problems));
});

test("an injected randomFn returning a value close to 1 selects the last element", () => {
  const problems = [problem({ key: "C1-A" }), problem({ key: "C1-B" }), problem({ key: "C1-C" })];
  assertEqual(getRandomProblem(problems, () => 0.999999), p("C1-C", problems));
});

test("an injected randomFn returning a middle value selects the expected element", () => {
  const problems = [problem({ key: "C1-A" }), problem({ key: "C1-B" }), problem({ key: "C1-C" })];
  // 0.5 * 3 = 1.5 -> floor -> index 1 -> "C1-B"
  assertEqual(getRandomProblem(problems, () => 0.5), p("C1-B", problems));
});

test("an injected randomFn does not change the empty-array -> null behavior", () => {
  assertEqual(getRandomProblem([], () => 0.5), null);
});

test("an injected randomFn never produces an out-of-bounds index for any value in [0, 1)", () => {
  const problems = [problem({ key: "C1-A" }), problem({ key: "C1-B" }), problem({ key: "C1-C" }), problem({ key: "C1-D" })];
  for (const value of [0, 0.1, 0.25, 0.25001, 0.5, 0.7499999, 0.75, 0.9999999999]) {
    const result = getRandomProblem(problems, () => value);
    assertTrue(result !== null && problems.includes(result), `randomFn() = ${value} produced an invalid result`);
  }
});

test("getRandomProblem without an injected function still works exactly as before", () => {
  const problems = [problem({ key: "C1-A" }), problem({ key: "C1-B" })];
  for (let i = 0; i < 25; i++) {
    const result = getRandomProblem(problems);
    assertTrue(result !== null && problems.includes(result), "expected a member of the input array using the default Math.random source");
  }
});

function p(key: string, problems: Problem[]): Problem {
  const found = problems.find((problem) => problem.key === key);
  if (!found) throw new Error(`test fixture error: no problem with key ${key}`);
  return found;
}
