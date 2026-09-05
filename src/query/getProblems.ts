import { Problem } from "../types/problem";
import { ProblemStatus, StatusMap } from "../types/status";
import { getStatus } from "../data/classify";

/** A problem must carry every listed tag (AND, not OR). Omit or pass `[]` for no tag filter. */
export interface ProblemFilters {
  minRating?: number;
  maxRating?: number;
  status?: ProblemStatus;
  tags?: string[];
}

/**
 * Returns the subset of `problems` matching `filters`. Does not mutate
 * `problems` or any `Problem` in it. Status is looked up via `getStatus()`,
 * so a problem with no entry in `statusMap` is UNATTEMPTED, as elsewhere.
 * A problem with `rating: null` never matches once minRating/maxRating is set.
 */
export function getProblems(problems: Problem[], statusMap: StatusMap, filters: ProblemFilters = {}): Problem[] {
  const { minRating, maxRating, status, tags } = filters;
  const hasRatingFilter = minRating !== undefined || maxRating !== undefined;
  const requiredTags = tags && tags.length > 0 ? tags : null;

  return problems.filter((problem) => {
    if (hasRatingFilter) {
      if (problem.rating === null) return false;
      if (minRating !== undefined && problem.rating < minRating) return false;
      if (maxRating !== undefined && problem.rating > maxRating) return false;
    }

    if (status !== undefined && getStatus(statusMap, problem.key) !== status) {
      return false;
    }

    if (requiredTags) {
      for (const tag of requiredTags) {
        if (!problem.tags.includes(tag)) return false;
      }
    }

    return true;
  });
}
