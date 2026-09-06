import { Problem } from "../types/problem";
import { StatusMap } from "../types/status";
import { getProblems, ProblemFilters } from "./getProblems";
import { getRandomProblem } from "./getRandomProblem";

/**
 * Filters `problems` via `getProblems()`, then picks one at random via
 * `getRandomProblem()`. Returns `null` when nothing matches. All filtering
 * logic lives in `getProblems()` — this function does not reimplement any
 * of it, and does not mutate `problems` or `statusMap`.
 */
export function getRandomProblemByFilter(
  problems: Problem[],
  statusMap: StatusMap,
  filters: ProblemFilters = {}
): Problem | null {
  const eligible = getProblems(problems, statusMap, filters);
  return getRandomProblem(eligible);
}
