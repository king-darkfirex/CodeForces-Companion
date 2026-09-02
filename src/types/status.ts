export enum ProblemStatus {
  Solved = "SOLVED",
  Attempted = "ATTEMPTED",
  Unattempted = "UNATTEMPTED",
}

/**
 * Per-problem, per-user aggregate derived from that user's submission
 * history. A problem with no entry in a {@link StatusMap} is implicitly
 * UNATTEMPTED — see {@link getStatus}.
 */
export interface ProblemAttemptSummary {
  /** Always SOLVED or ATTEMPTED — UNATTEMPTED problems never get an entry. */
  status: ProblemStatus.Solved | ProblemStatus.Attempted;
  /** Total submissions ever made to this problem, any verdict, de-duplicated by submission id. */
  totalSubmissions: number;
  /** Non-OK submissions made before the first OK submission (or all of them, if never solved). */
  failedAttempts: number;
  firstAttemptAt: number | null; // unix seconds
  lastAttemptAt: number | null; // unix seconds
  /** unix seconds of the first accepted submission, or `null` if never solved. */
  firstSolvedAt: number | null;
}

/** Maps a {@link ProblemKey} to that user's attempt summary for it. */
export type StatusMap = Map<string, ProblemAttemptSummary>;
