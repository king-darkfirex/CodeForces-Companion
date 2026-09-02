import { test, assertEqual } from "./testKit";
import { normalizeProblemset, normalizeSubmission } from "../data/normalize";
import { makeProblemKey } from "../types/problem";
import { CFRawSubmission } from "../api/endpoints";

test("makeProblemKey prefers contestId, falls back to problemsetName", () => {
  assertEqual(makeProblemKey({ contestId: 4, index: "A" }), "C4-A");
  assertEqual(makeProblemKey({ contestId: null, problemsetName: "acmsguru", index: "101" }), "Pacmsguru-101");
});

test("normalizeProblemset joins problemStatistics to problems by (contestId,index), not array order", () => {
  const result = normalizeProblemset({
    problems: [
      { contestId: 1, index: "A", name: "First", type: "PROGRAMMING", tags: ["math"], rating: 800 },
      { contestId: 1, index: "B", name: "Second", type: "PROGRAMMING", tags: ["dp"], rating: 1200 },
    ],
    // Deliberately out of order relative to `problems` above.
    problemStatistics: [
      { contestId: 1, index: "B", solvedCount: 50 },
      { contestId: 1, index: "A", solvedCount: 900 },
    ],
  });
  const a = result.find((p) => p.key === "C1-A")!;
  const b = result.find((p) => p.key === "C1-B")!;
  assertEqual(a.solvedCount, 900);
  assertEqual(b.solvedCount, 50);
});

test("a problem with no rating or solve-count data normalizes to null, not 0 or undefined", () => {
  const result = normalizeProblemset({
    problems: [{ contestId: 1, index: "A", name: "Unrated", type: "PROGRAMMING", tags: [] }],
    problemStatistics: [],
  });
  assertEqual(result[0]!.rating, null);
  assertEqual(result[0]!.solvedCount, null);
});

test("normalizeSubmission treats a missing verdict (still judging) as null, not a crash", () => {
  const raw: CFRawSubmission = {
    id: 1,
    creationTimeSeconds: 100,
    problem: { index: "A", contestId: 1, name: "X", type: "PROGRAMMING", tags: [] },
    programmingLanguage: "GNU C++17",
  };
  const s = normalizeSubmission(raw);
  assertEqual(s.verdict, null);
  assertEqual(s.problemKey, "C1-A");
});

test("normalizeSubmission falls back to the submission-level contestId when problem.contestId is absent", () => {
  const raw: CFRawSubmission = {
    id: 1,
    contestId: 99999,
    creationTimeSeconds: 100,
    problem: { index: "A", name: "X", type: "PROGRAMMING", tags: [] },
    programmingLanguage: "GNU C++17",
  };
  const s = normalizeSubmission(raw);
  assertEqual(s.contestId, 99999);
  assertEqual(s.problemKey, "C99999-A");
});
