/** Every verdict string Codeforces is known to return. */
export type Verdict =
  | "OK"
  | "FAILED"
  | "PARTIAL"
  | "COMPILATION_ERROR"
  | "RUNTIME_ERROR"
  | "WRONG_ANSWER"
  | "PRESENTATION_ERROR"
  | "TIME_LIMIT_EXCEEDED"
  | "MEMORY_LIMIT_EXCEEDED"
  | "IDLENESS_LIMIT_EXCEEDED"
  | "SECURITY_VIOLATED"
  | "CRASHED"
  | "INPUT_PREPARATION_CRASHED"
  | "CHALLENGED"
  | "SKIPPED"
  | "TESTING"
  | "REJECTED";

/** A single normalized submission, keyed to the problem it targets via {@link ProblemKey}. */
export interface Submission {
  id: number;
  /** The target problem's {@link ProblemKey} — kept as `string` here to avoid a circular import with problem.ts. */
  problemKey: string;
  contestId: number | null;
  problemsetName: string | null;
  index: string;
  creationTimeSeconds: number;
  /** `null` means Codeforces has not returned a verdict yet (still queued/judging), or returned an unrecognized value. */
  verdict: Verdict | null;
  programmingLanguage: string;
}
