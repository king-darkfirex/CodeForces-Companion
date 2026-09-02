import { test, assertEqual } from "./testKit";
import { mergeSubmissions } from "../sync/syncService";
import { Submission } from "../types/submission";

function sub(id: number, t: number): Submission {
  return {
    id,
    problemKey: "C1-A",
    contestId: 1,
    problemsetName: null,
    index: "A",
    creationTimeSeconds: t,
    verdict: "OK",
    programmingLanguage: "GNU C++17",
  };
}

test("mergeSubmissions de-duplicates overlapping ids and sorts newest-first", () => {
  const cached = [sub(2, 200), sub(1, 100)];
  const fresh = [sub(3, 300), sub(2, 200)]; // id 2 overlaps between fetches
  const merged = mergeSubmissions(cached, fresh);
  assertEqual(
    merged.map((s) => s.id),
    [3, 2, 1]
  );
});

test("mergeSubmissions with no overlap simply unions and sorts", () => {
  const merged = mergeSubmissions([sub(1, 100)], [sub(2, 200)]);
  assertEqual(
    merged.map((s) => s.id),
    [2, 1]
  );
});
