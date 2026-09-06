import { Problem } from "../types/problem";

/**
 * Returns one uniformly random element of `problems`, or `null` if it's
 * empty. Does not filter, sort, or mutate `problems` — callers pass an
 * already-eligible list (e.g. the output of `getProblems()`).
 */
export function getRandomProblem(problems: Problem[]): Problem | null {
  if (problems.length === 0) return null;
  const index = Math.floor(Math.random() * problems.length);
  // Safe: index is always in [0, problems.length), so this is never undefined.
  return problems[index]!;
}
