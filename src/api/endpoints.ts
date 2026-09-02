/**
 * Raw shapes as documented at https://codeforces.com/apiHelp/objects and
 * https://codeforces.com/apiHelp/methods. These are intentionally close to
 * the wire format (optional fields left optional) — normalization into our
 * internal types happens in `src/data/normalize.ts`.
 */

export const CF_API_BASE = "https://codeforces.com/api";

export interface CFApiSuccess<T> {
  status: "OK";
  result: T;
}
export interface CFApiFailure {
  status: "FAILED";
  comment: string;
}
export type CFApiResponse<T> = CFApiSuccess<T> | CFApiFailure;

export interface CFRawProblem {
  contestId?: number;
  problemsetName?: string;
  index: string;
  name: string;
  type: string;
  points?: number;
  rating?: number;
  tags: string[];
}

export interface CFRawProblemStatistics {
  contestId?: number;
  problemsetName?: string;
  index: string;
  solvedCount: number;
}

export interface CFRawProblemsetProblemsResult {
  problems: CFRawProblem[];
  problemStatistics: CFRawProblemStatistics[];
}

export interface CFRawParty {
  contestId?: number;
  members: { handle: string }[];
  participantType: string;
}

export interface CFRawSubmission {
  id: number;
  /**
   * Present for contest submissions. Some archive/gym submissions instead
   * carry the contest identity purely inside `problem.contestId`, so callers
   * should fall back to that — see `normalizeSubmission`.
   */
  contestId?: number;
  creationTimeSeconds: number;
  relativeTimeSeconds?: number;
  problem: CFRawProblem;
  author?: CFRawParty;
  programmingLanguage: string;
  /** Absent while a submission is still queued/being judged. */
  verdict?: string;
  testset?: string;
  passedTestCount?: number;
}

export interface CFRawUser {
  handle: string;
  rating?: number;
  maxRating?: number;
  rank?: string;
  maxRank?: string;
  contribution: number;
  titlePhoto?: string;
}
