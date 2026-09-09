import { test, assertEqual } from "./testKit";
import { formatRandomProblemDisplay } from "../popup/randomProblemDisplay";
import { Problem } from "../types/problem";

function problem(overrides: Partial<Problem>): Problem {
  return {
    key: "C1-A",
    contestId: 1,
    problemsetName: null,
    index: "A",
    name: "Some Problem",
    type: "PROGRAMMING",
    rating: null,
    tags: [],
    points: null,
    solvedCount: null,
    ...overrides,
  };
}

test("formats a rated contest problem with its identifier, name, and rating", () => {
  const result = formatRandomProblemDisplay(problem({ contestId: 1234, index: "C", name: "Great Problem", rating: 1500 }));
  assertEqual(result.label, "Great Problem (1234C, rating 1500)");
  assertEqual(result.url, "https://codeforces.com/problemset/problem/1234/C");
});

test("formats an unrated problem with 'unrated' instead of a number", () => {
  const result = formatRandomProblemDisplay(problem({ contestId: 2000, index: "A", name: "New Problem", rating: null }));
  assertEqual(result.label, "New Problem (2000A, rating unrated)");
});

test("formats a problemsetName-based problem (no contestId) using its index alone and the archive URL", () => {
  const result = formatRandomProblemDisplay(
    problem({ contestId: null, problemsetName: "acmsguru", index: "101", name: "Archive Problem", rating: 2000 })
  );
  assertEqual(result.label, "Archive Problem (101, rating 2000)");
  assertEqual(result.url, "https://codeforces.com/problemsets/acmsguru/problem/101");
});
