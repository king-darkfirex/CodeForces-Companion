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

/** Runs a single problem through getRatingDistribution and returns the one bucket label that got a count. */
function bucketOf(rating: number | null): string {
  const distribution = getRatingDistribution([problem({ key: "C1-A", rating })]);
  const [label] = Object.entries(distribution).find(([, count]) => count === 1)!;
  return label;
}

test("each rating boundary falls into the correct bucket", () => {
  assertEqual(bucketOf(799), "< 800");
  assertEqual(bucketOf(800), "800–999");
  assertEqual(bucketOf(999), "800–999");
  assertEqual(bucketOf(1000), "1000–1199");
  assertEqual(bucketOf(1199), "1000–1199");
  assertEqual(bucketOf(1200), "1200–1399");
  assertEqual(bucketOf(1399), "1200–1399");
  assertEqual(bucketOf(1400), "1400–1599");
  assertEqual(bucketOf(1599), "1400–1599");
  assertEqual(bucketOf(1600), "1600–1799");
  assertEqual(bucketOf(1799), "1600–1799");
  assertEqual(bucketOf(1800), "1800–1999");
  assertEqual(bucketOf(1999), "1800–1999");
  assertEqual(bucketOf(2000), "2000–2199");
  assertEqual(bucketOf(2199), "2000–2199");
  assertEqual(bucketOf(2200), "2200–2399");
  assertEqual(bucketOf(2399), "2200–2399");
  assertEqual(bucketOf(2400), "2400–2599");
  assertEqual(bucketOf(2599), "2400–2599");
  assertEqual(bucketOf(2600), "2600–2799");
  assertEqual(bucketOf(2799), "2600–2799");
  assertEqual(bucketOf(2800), "2800–2999");
  assertEqual(bucketOf(2999), "2800–2999");
  assertEqual(bucketOf(3000), "3000+");
  assertEqual(bucketOf(3500), "3000+");
});

test("null rating goes into the Unrated bucket", () => {
  assertEqual(bucketOf(null), "Unrated");
});

test("several ratings across different buckets are all counted correctly", () => {
  const problems = [
    problem({ key: "C1-A", rating: 800 }),
    problem({ key: "C1-B", rating: 850 }),
    problem({ key: "C1-C", rating: 1500 }),
    problem({ key: "C1-D", rating: 2100 }),
    problem({ key: "C1-E", rating: null }),
  ];
  const distribution = getRatingDistribution(problems);
  assertEqual(distribution["800–999"], 2);
  assertEqual(distribution["1400–1599"], 1);
  assertEqual(distribution["2000–2199"], 1);
  assertEqual(distribution["Unrated"], 1);
  assertEqual(distribution["< 800"], 0);
});

test("unrated problems are counted, not dropped", () => {
  const problems = [problem({ key: "C1-A", rating: null }), problem({ key: "C1-B", rating: null })];
  const distribution = getRatingDistribution(problems);
  assertEqual(distribution["Unrated"], 2);
  assertEqual(sumAll(distribution), 2);
});

test("an empty problem list gives every bucket a count of zero", () => {
  const distribution = getRatingDistribution([]);
  assertEqual(sumAll(distribution), 0);
  assertEqual(distribution["Unrated"], 0);
  assertEqual(distribution["< 800"], 0);
  assertEqual(distribution["3000+"], 0);
});

test("every problem is accounted for exactly once, regardless of bucket mix", () => {
  const problems = [
    problem({ key: "C1-A", rating: 500 }),
    problem({ key: "C1-B", rating: 800 }),
    problem({ key: "C1-C", rating: 1350 }),
    problem({ key: "C1-D", rating: 2999 }),
    problem({ key: "C1-E", rating: 3000 }),
    problem({ key: "C1-F", rating: null }),
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
