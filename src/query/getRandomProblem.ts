import { Problem } from "../types/problem";

/**
 * Returns one uniformly random element of `problems`, or `null` if it's
 * empty. Does not filter, sort, or mutate `problems` — callers pass an
 * already-eligible list (e.g. the output of `getProblems()`).
 *
 * `randomFn` defaults to `Math.random` and must follow its same contract:
 * a number in `[0, 1)`. It's only used to pick the index — swap it in
 * tests for deterministic selection instead of asserting on real
 * randomness.
 */
export function getRandomProblem(problems: Problem[], randomFn: () => number = Math.random): Problem | null {
  if (problems.length === 0) return null;
  const index = Math.floor(randomFn() * problems.length);
  // Safe: for any randomFn value in [0, 1), index is always in [0, problems.length).
  return problems[index]!;
}
