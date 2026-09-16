import { test, assertEqual } from "./testKit";
import { collectAllTags, toggleTagInInput, addRecentTags, isOutsideTagMenu, ClickContainer } from "../popup/tagMenu";
import { Problem } from "../types/problem";

/** A minimal stand-in for an HTMLElement's `.contains()`, so this menu-closing logic can be tested with no DOM. */
function fakeContainer(childNodes: unknown[] = []): ClickContainer {
  return { contains: (node) => childNodes.includes(node) };
}

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

// --- isOutsideTagMenu ---------------------------------------------------------
//
// Regression coverage for a bug where clicking into the manual tags input
// while the menu was open closed the menu on that same click (because the
// input wasn't recognized as part of the tags control), making it
// impossible to use manual typing and the menu together.

test("isOutsideTagMenu is false for a click on the toggle button", () => {
  const tagMenu = fakeContainer();
  const toggle = fakeContainer();
  const tagsInput = {};
  assertEqual(isOutsideTagMenu(toggle, tagMenu, toggle, tagsInput), false);
});

test("isOutsideTagMenu is false for a click inside the menu", () => {
  const chip = {};
  const tagMenu = fakeContainer([chip]);
  assertEqual(isOutsideTagMenu(chip, tagMenu, fakeContainer(), {}), false);
});

test("isOutsideTagMenu is false for a click on the manual tags input (the fix)", () => {
  const tagsInput = {};
  const tagMenu = fakeContainer();
  const tagMenuToggle = fakeContainer();
  assertEqual(isOutsideTagMenu(tagsInput, tagMenu, tagMenuToggle, tagsInput), false);
});

test("isOutsideTagMenu is true for a click elsewhere on the page", () => {
  const elsewhere = {};
  const tagMenu = fakeContainer();
  const tagMenuToggle = fakeContainer();
  assertEqual(isOutsideTagMenu(elsewhere, tagMenu, tagMenuToggle, {}), true);
});
