import { test, assertEqual } from "./testKit";
import { getRatingDistribution, RatingDistribution } from "../query/getProblems";
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

function sumAll(distribution: RatingDistribution): number {
  return Object.values(distribution).reduce((sum, count) => sum + count, 0);
}

/** Runs a single problem through getRatingDistribution and returns the one label that got a count. */
function labelOf(rating: number | null): string {
  const distribution = getRatingDistribution([problem({ key: "C1-A", rating })]);
  const [label] = Object.entries(distribution).find(([, count]) => count === 1)!;
  return label;
}

test("every exact 100-point level maps to its own label", () => {
  assertEqual(labelOf(800), "800");
  assertEqual(labelOf(900), "900");
  assertEqual(labelOf(1000), "1000");
  assertEqual(labelOf(1200), "1200");
  assertEqual(labelOf(1600), "1600");
  assertEqual(labelOf(2000), "2000");
  assertEqual(labelOf(2400), "2400");
  assertEqual(labelOf(2800), "2800");
  assertEqual(labelOf(3000), "3000");
  assertEqual(labelOf(3400), "3400");
  assertEqual(labelOf(3500), "3500");
});

test("a rating just below a level boundary rounds down into the lower level", () => {
  assertEqual(labelOf(899), "800");
  assertEqual(labelOf(999), "900");
  assertEqual(labelOf(1199), "1100");
  assertEqual(labelOf(2299), "2200");
  assertEqual(labelOf(3499), "3400");
});

test("a rating at a level boundary belongs to that level, not the one below", () => {
  assertEqual(labelOf(1200), "1200");
  assertEqual(labelOf(2300), "2300");
});

test("ratings below 800 are handled safely by clamping up into the 800 level", () => {
  assertEqual(labelOf(0), "800");
  assertEqual(labelOf(1), "800");
  assertEqual(labelOf(799), "800");
});

test("ratings above 3500 are handled safely by clamping down into the 3500 level", () => {
  assertEqual(labelOf(3501), "3500");
  assertEqual(labelOf(4000), "3500");
});

test("null rating goes into the Unrated label", () => {
  assertEqual(labelOf(null), "Unrated");
});

test("several ratings across different levels are all counted correctly", () => {
  const problems = [
    problem({ key: "C1-A", rating: 800 }),
    problem({ key: "C1-B", rating: 850 }),
    problem({ key: "C1-C", rating: 1500 }),
    problem({ key: "C1-D", rating: 2100 }),
    problem({ key: "C1-E", rating: null }),
  ];
  const distribution = getRatingDistribution(problems);
  assertEqual(distribution["800"], 2); // 800 exact, and 850 rounds down to 800
  assertEqual(distribution["900"], 0);
  assertEqual(distribution["1500"], 1);
  assertEqual(distribution["2100"], 1);
  assertEqual(distribution["Unrated"], 1);
  assertEqual(distribution["1000"], 0);
});

test("unrated problems are counted, not dropped", () => {
  const problems = [problem({ key: "C1-A", rating: null }), problem({ key: "C1-B", rating: null })];
  const distribution = getRatingDistribution(problems);
  assertEqual(distribution["Unrated"], 2);
  assertEqual(sumAll(distribution), 2);
});

test("an empty problem list gives every level a count of zero", () => {
  const distribution = getRatingDistribution([]);
  assertEqual(sumAll(distribution), 0);
  assertEqual(distribution["Unrated"], 0);
  assertEqual(distribution["800"], 0);
  assertEqual(distribution["3500"], 0);
});

test("every problem is accounted for exactly once, regardless of the rating mix", () => {
  const problems = [
    problem({ key: "C1-A", rating: -100 }),
    problem({ key: "C1-B", rating: 800 }),
    problem({ key: "C1-C", rating: 1350 }),
    problem({ key: "C1-D", rating: 2999 }),
    problem({ key: "C1-E", rating: 3000 }),
    problem({ key: "C1-F", rating: 5000 }),
    problem({ key: "C1-G", rating: null }),
  ];
  const distribution = getRatingDistribution(problems);
  assertEqual(sumAll(distribution), problems.length);
});

test("does not mutate the input array or its elements", () => {
  const problems = [problem({ key: "C1-A", rating: 1200 }), problem({ key: "C1-B", rating: null })];
  const original = problems.map((p) => ({ ...p, tags: [...p.tags] }));

  getRatingDistribution(problems);

  assertEqual(problems, original);
  assertEqual(problems.length, 2);
});
