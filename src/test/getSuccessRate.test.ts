import { test, assertEqual } from "./testKit";
import { getSuccessRate, ProblemStats } from "../query/getProblems";

function stats(overrides: Partial<ProblemStats>): ProblemStats {
  return { total: 0, solved: 0, attempted: 0, unattempted: 0, ...overrides };
}

test("a normal solved/attempted ratio is computed correctly", () => {
  assertEqual(getSuccessRate(stats({ solved: 80, attempted: 20 })), 0.8);
});

test("solved = 0 gives a rate of 0, not null", () => {
  assertEqual(getSuccessRate(stats({ solved: 0, attempted: 10 })), 0);
});

test("attempted = 0 (with some solved) gives a rate of 1", () => {
  assertEqual(getSuccessRate(stats({ solved: 10, attempted: 0 })), 1);
});

test("solved equals attempted gives a rate of 0.5", () => {
  assertEqual(getSuccessRate(stats({ solved: 5, attempted: 5 })), 0.5);
});

test("both solved and attempted are zero -> null, not NaN", () => {
  const result = getSuccessRate(stats({ solved: 0, attempted: 0 }));
  assertEqual(result, null);
});

test("a fractional ratio is returned with full precision, not rounded", () => {
  const result = getSuccessRate(stats({ solved: 1, attempted: 2 }));
  assertEqual(result, 1 / 3);
});

test("never returns NaN or Infinity for any solved/attempted combination", () => {
  const combos: Array<[number, number]> = [
    [0, 0],
    [0, 1],
    [1, 0],
    [3, 7],
    [1000, 1],
  ];
  for (const [solved, attempted] of combos) {
    const result = getSuccessRate(stats({ solved, attempted }));
    if (result !== null) {
      assertEqual(Number.isFinite(result), true);
    }
  }
});

test("does not mutate the input stats object", () => {
  const input = stats({ total: 30, solved: 20, attempted: 5, unattempted: 5 });
  const original = { ...input };

  getSuccessRate(input);

  assertEqual(input, original);
});
