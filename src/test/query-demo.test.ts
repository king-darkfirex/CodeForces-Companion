import { test, assertEqual } from "./testKit";
import { classifySubmissions, getStatus } from "../data/classify";
import { normalizeSubmission } from "../data/normalize";
import { ProblemStatus } from "../types/status";
import { Problem } from "../types/problem";
import { CFRawSubmission } from "../api/endpoints";

// This test exists to prove out the specific capability the Phase 1 brief
// calls out: "give me all problems between rating 1200 and 1400 that this
// user has never attempted." The formal, reusable filtering *engine* (a
// proper options object supporting tags, contests, exact-rating, etc.) is
// Phase 2 — this intentionally stays a plain array filter over the data
// layer's primitives, to show the primitives are sufficient without
// building ahead of schedule.

function problem(key: string, index: string, rating: number | null): Problem {
  return {
    key,
    contestId: 1,
    problemsetName: null,
    index,
    name: `Problem ${index}`,
    type: "PROGRAMMING",
    rating,
    tags: [],
    points: null,
    solvedCount: null,
  };
}

const problems: Problem[] = [
  problem("C1-A", "A", 900),
  problem("C1-B", "B", 1200),
  problem("C1-C", "C", 1400),
  problem("C1-D", "D", 1900),
  problem("C1-E", "E", null), // unrated — must never match a rating-range query
];

test("can answer: unattempted problems rated 1200-1400", () => {
  const attemptedB: CFRawSubmission = {
    id: 1,
    contestId: 1,
    creationTimeSeconds: 1,
    problem: { contestId: 1, index: "B", name: "Problem B", type: "PROGRAMMING", tags: [] },
    programmingLanguage: "GNU C++17",
    verdict: "WRONG_ANSWER",
  };
  const statusMap = classifySubmissions([normalizeSubmission(attemptedB)]);

  const unattempted1200to1400 = problems.filter(
    (p) =>
      p.rating !== null &&
      p.rating >= 1200 &&
      p.rating <= 1400 &&
      getStatus(statusMap, p.key) === ProblemStatus.Unattempted
  );

  // B was attempted (excluded), D is out of range, E is unrated (excluded) -> only C remains.
  assertEqual(
    unattempted1200to1400.map((p) => p.key),
    ["C1-C"]
  );
});
