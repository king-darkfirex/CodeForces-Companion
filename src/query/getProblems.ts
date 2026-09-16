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

/** Discrete 100-point Codeforces rating levels, 800 through 3500 inclusive. */
export const RATING_LEVELS = [
  800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500, 2600,
  2700, 2800, 2900, 3000, 3100, 3200, 3300, 3400, 3500,
] as const;

export type RatingLevel = (typeof RATING_LEVELS)[number];

/** One label per rating level ("800", "900", ..., "3500"), plus "Unrated". */
export type RatingDistributionLabel = `${RatingLevel}` | "Unrated";

/** RATING_DISTRIBUTION_LABELS, in display order (ascending levels, then "Unrated" last). */
export const RATING_DISTRIBUTION_LABELS: readonly RatingDistributionLabel[] = [
  ...RATING_LEVELS.map((level): RatingDistributionLabel => `${level}`),
  "Unrated",
];

export type RatingDistribution = Record<RatingDistributionLabel, number>;

/**
 * Maps a numeric rating to its 100-point level label. Real Codeforces
 * problem ratings are always exact multiples of 100 within [800, 3500], so
 * this is normally an identity mapping (e.g. 1300 -> "1300"). A rating
 * outside that range, or not a multiple of 100, shouldn't occur in normal
 * data — but rather than dropping it (breaking the "every problem counted
 * exactly once" invariant) or throwing, it's clamped into [800, 3500] and
 * rounded down to the nearest level.
 */
function levelLabelForRating(rating: number): RatingDistributionLabel {
  const clamped = Math.min(3500, Math.max(800, rating));
  const level = Math.floor(clamped / 100) * 100;
  return `${level}` as RatingDistributionLabel;
}

/**
 * Counts `problems` into fixed 100-point rating levels (800, 900, ..., 3500)
 * plus a separate "Unrated" count. Does not use solved/attempted/unattempted
 * status at all — purely a function of `Problem.rating`. Every problem
 * belongs to exactly one label; unrated problems go to "Unrated" rather than
 * being dropped. Does not mutate `problems`.
 */
export function getRatingDistribution(problems: Problem[]): RatingDistribution {
  const distribution = {} as RatingDistribution;
  for (const label of RATING_DISTRIBUTION_LABELS) distribution[label] = 0;

  for (const problem of problems) {
    const label = problem.rating === null ? "Unrated" : levelLabelForRating(problem.rating);
    distribution[label] += 1;
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
