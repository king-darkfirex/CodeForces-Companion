import { test, assertEqual } from "./testKit";
import { collectAllTags, toggleTagInInput, addRecentTags } from "../popup/tagMenu";
import { Problem } from "../types/problem";

function makeProblem(overrides: Partial<Problem>): Problem {
  return {
    key: "C1-A",
    contestId: 1,
    problemsetName: null,
    index: "A",
    name: "Test problem",
    type: "PROGRAMMING",
    rating: 1200,
    tags: [],
    points: null,
    solvedCount: null,
    ...overrides,
  };
}

// --- collectAllTags ---------------------------------------------------------

test("collectAllTags returns no tags for an empty problem list", () => {
  assertEqual(collectAllTags([]), []);
});

test("collectAllTags returns the sorted union of every problem's tags", () => {
  const problems = [
    makeProblem({ key: "C1-A", tags: ["greedy", "dp"] }),
    makeProblem({ key: "C1-B", tags: ["dp", "math"] }),
  ];
  assertEqual(collectAllTags(problems), ["dp", "greedy", "math"]);
});

test("collectAllTags de-duplicates tags across problems", () => {
  const problems = [
    makeProblem({ key: "C1-A", tags: ["dp"] }),
    makeProblem({ key: "C1-B", tags: ["dp"] }),
  ];
  assertEqual(collectAllTags(problems), ["dp"]);
});

test("collectAllTags ignores problems with no tags", () => {
  const problems = [makeProblem({ key: "C1-A", tags: [] }), makeProblem({ key: "C1-B", tags: ["dp"] })];
  assertEqual(collectAllTags(problems), ["dp"]);
});

// --- toggleTagInInput --------------------------------------------------------

test("toggleTagInInput adds a tag to an empty input", () => {
  assertEqual(toggleTagInInput("", "dp"), "dp");
});

test("toggleTagInInput adds a tag alongside existing ones", () => {
  assertEqual(toggleTagInInput("dp", "greedy"), "dp, greedy");
});

test("toggleTagInInput removes a tag that is already present", () => {
  assertEqual(toggleTagInInput("dp, greedy", "dp"), "greedy");
});

test("toggleTagInInput removes the only tag, yielding an empty string", () => {
  assertEqual(toggleTagInInput("dp", "dp"), "");
});

test("toggleTagInInput normalizes whitespace/formatting of the untouched tags", () => {
  assertEqual(toggleTagInInput(" dp ,  greedy ", "math"), "dp, greedy, math");
});

// --- addRecentTags -----------------------------------------------------------

test("addRecentTags adds new tags to an empty list", () => {
  assertEqual(addRecentTags([], ["dp"]), ["dp"]);
});

test("addRecentTags puts newly-used tags first, ahead of existing recent tags", () => {
  assertEqual(addRecentTags(["greedy"], ["dp"]), ["dp", "greedy"]);
});

test("addRecentTags de-duplicates a tag that was already in the recent list", () => {
  assertEqual(addRecentTags(["dp", "greedy"], ["dp"]), ["dp", "greedy"]);
});

test("addRecentTags caps the list at the given max length", () => {
  assertEqual(addRecentTags(["a", "b", "c"], ["d"], 3), ["d", "a", "b"]);
});
