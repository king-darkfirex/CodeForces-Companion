/**
 * Types describing a Codeforces problem, normalized from the
 * `problemset.problems` API response into the shape used internally
 * by the rest of the extension.
 */

/** Codeforces problem "type" as returned by the API. */
export type CFProblemType = "PROGRAMMING" | "QUESTION";

/**
 * A unique, stable identifier for a problem.
 *
 * Codeforces problems are uniquely identified by the pair
 * (contestId, index) for the vast majority of problems. A small number of
 * legacy/archive problems (e.g. the "acmsguru" set) instead carry a
 * `problemsetName` with no contestId. We fold both cases into a single
 * string key so the rest of the app never has to special-case it.
 *
 * Note on duplicates: Codeforces sometimes reuses the same statement across
 * multiple contests (e.g. a Div. 2 G that is also Div. 1 E). The API treats
 * these as distinct (contestId, index) entries with their own rating and
 * submissions, and so does this extension — that matches how a user's
 * submissions are actually recorded, and how every other CF tool behaves.
 */
export type ProblemKey = string;

export interface Problem {
  /** Stable dedupe/lookup key. See {@link makeProblemKey}. */
  key: ProblemKey;
  contestId: number | null;
  problemsetName: string | null;
  index: string;
  name: string;
  type: CFProblemType;
  /** Difficulty rating. `null` when the problem has not been rated (common for very new or very old problems). */
  rating: number | null;
  tags: string[];
  points: number | null;
  /** Number of accepted solutions across all users, if known (from `problemStatistics`). */
  solvedCount: number | null;
}

/** Builds the canonical key for a problem given raw API-shaped identity fields. */
export function makeProblemKey(p: {
  contestId?: number | null;
  problemsetName?: string | null;
  index: string;
}): ProblemKey {
  if (p.contestId !== undefined && p.contestId !== null) {
    return `C${p.contestId}-${p.index}`;
  }
  if (p.problemsetName) {
    return `P${p.problemsetName}-${p.index}`;
  }
  // Should not normally happen given real API data; fall back to something
  // stable rather than throwing, so a single malformed entry can't take
  // down the whole sync.
  return `?-${p.index}`;
}

export function problemUrl(p: Pick<Problem, "contestId" | "problemsetName" | "index">): string {
  if (p.contestId !== null) {
    return `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`;
  }
  if (p.problemsetName) {
    return `https://codeforces.com/problemsets/${p.problemsetName}/problem/${p.index}`;
  }
  return "https://codeforces.com/problemset";
}
