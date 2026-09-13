import { Problem } from "../types/problem";
import { ProblemStatus, StatusMap } from "../types/status";
import { getStatus } from "../data/classify";

/** A problem must carry every listed tag (AND, not OR). Omit or pass `[]` for no tag filter. */
export interface ProblemFilters {
  minRating?: number;
  maxRating?: number;
  /** A single status, or a list of acceptable statuses (matches if the problem's status is any of them). An empty list matches nothing. */
  status?: ProblemStatus | ProblemStatus[];
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
  const allowedStatuses = status === undefined ? null : Array.isArray(status) ? status : [status];

  return problems.filter((problem) => {
    if (hasRatingFilter) {
      if (problem.rating === null) return false;
      if (minRating !== undefined && problem.rating < minRating) return false;
      if (maxRating !== undefined && problem.rating > maxRating) return false;
    }

    if (allowedStatuses !== null && !allowedStatuses.includes(getStatus(statusMap, problem.key))) {
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

/** Fixed Codeforces rating buckets, in display order. Unrated problems (rating: null) always go to "Unrated". */
export const RATING_BUCKET_LABELS = [
  "< 800",
  "800–999",
  "1000–1199",
  "1200–1399",
  "1400–1599",
  "1600–1799",
  "1800–1999",
  "2000–2199",
  "2200–2399",
  "2400–2599",
  "2600–2799",
  "2800–2999",
  "3000+",
  "Unrated",
] as const;

export type RatingBucketLabel = (typeof RATING_BUCKET_LABELS)[number];

export type RatingDistribution = Record<RatingBucketLabel, number>;

function bucketForRating(rating: number | null): RatingBucketLabel {
  if (rating === null) return "Unrated";
  if (rating < 800) return "< 800";
  if (rating < 1000) return "800–999";
  if (rating < 1200) return "1000–1199";
  if (rating < 1400) return "1200–1399";
  if (rating < 1600) return "1400–1599";
  if (rating < 1800) return "1600–1799";
  if (rating < 2000) return "1800–1999";
  if (rating < 2200) return "2000–2199";
  if (rating < 2400) return "2200–2399";
  if (rating < 2600) return "2400–2599";
  if (rating < 2800) return "2600–2799";
  if (rating < 3000) return "2800–2999";
  return "3000+";
}

/**
 * Counts `problems` into fixed rating buckets. Does not use solved/attempted/
 * unattempted status at all — purely a function of `Problem.rating`. Every
 * problem belongs to exactly one bucket; unrated problems go to "Unrated"
 * rather than being dropped. Does not mutate `problems`.
 */
export function getRatingDistribution(problems: Problem[]): RatingDistribution {
  const distribution = {} as RatingDistribution;
  for (const label of RATING_BUCKET_LABELS) distribution[label] = 0;

  for (const problem of problems) {
    distribution[bucketForRating(problem.rating)] += 1;
  }

  return distribution;
}

export interface ProblemStats {
  total: number;
  solved: number;
  attempted: number;
  unattempted: number;
}

/** Counts `problems` by status. `total` is always `problems.length`, not `statusMap.size`. */
export function getProblemStats(problems: Problem[], statusMap: StatusMap): ProblemStats {
  let solved = 0;
  let attempted = 0;

  for (const problem of problems) {
    const status = getStatus(statusMap, problem.key);
    if (status === ProblemStatus.Solved) solved += 1;
    else if (status === ProblemStatus.Attempted) attempted += 1;
  }

  return {
    total: problems.length,
    solved,
    attempted,
    unattempted: problems.length - solved - attempted,
  };
}

/**
 * Success rate = solved / (solved + attempted), as a ratio in [0, 1].
 * `null` when there's no attempted-or-solved activity at all (solved +
 * attempted === 0) — avoids returning NaN for a meaningless 0/0.
 * `unattempted`/`total` are irrelevant here and intentionally ignored.
 */
export function getSuccessRate(stats: ProblemStats): number | null {
  const denominator = stats.solved + stats.attempted;
  if (denominator === 0) return null;
  return stats.solved / denominator;
}
