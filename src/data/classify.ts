import { Submission } from "../types/submission";
import { ProblemAttemptSummary, ProblemStatus, StatusMap } from "../types/status";

/**
 * Builds a per-problem attempt summary from a user's full submission
 * history. This is the single source of truth for SOLVED / ATTEMPTED /
 * UNATTEMPTED classification used everywhere else in the extension.
 *
 * Rules:
 *  - A problem is SOLVED if at least one submission to it has verdict "OK".
 *  - Otherwise, if there is at least one submission to it, it is ATTEMPTED.
 *  - If there is no submission at all, the problem simply has no entry in
 *    the returned map — callers treat a missing entry as UNATTEMPTED (see
 *    {@link getStatus}). A problem can never be both.
 *  - Submissions are de-duplicated by submission id, so re-processing an
 *    overlapping page (e.g. from an incremental sync merge) never double
 *    counts a submission.
 *  - `failedAttempts` counts only the non-OK submissions made *before* the
 *    first OK submission — genuine failures on the way to solving it.
 *    Submissions made after a problem is already solved (a cleanup
 *    resubmission, trying a different language, etc.) still count toward
 *    `totalSubmissions` but are not counted as failures.
 */
export function classifySubmissions(submissions: Submission[]): StatusMap {
  const byProblem = new Map<string, Submission[]>();
  const seenSubmissionIds = new Set<number>();

  for (const sub of submissions) {
    if (seenSubmissionIds.has(sub.id)) continue; // de-dupe
    seenSubmissionIds.add(sub.id);
    const list = byProblem.get(sub.problemKey);
    if (list) {
      list.push(sub);
    } else {
      byProblem.set(sub.problemKey, [sub]);
    }
  }

  const result: StatusMap = new Map();

  for (const [problemKey, subs] of byProblem) {
    subs.sort((a, b) => a.creationTimeSeconds - b.creationTimeSeconds);

    let firstSolvedAt: number | null = null;
    let failedAttempts = 0;

    for (const sub of subs) {
      if (sub.verdict === "OK") {
        if (firstSolvedAt === null) firstSolvedAt = sub.creationTimeSeconds;
      } else if (firstSolvedAt === null) {
        failedAttempts += 1;
      }
    }

    const summary: ProblemAttemptSummary = {
      status: firstSolvedAt !== null ? ProblemStatus.Solved : ProblemStatus.Attempted,
      totalSubmissions: subs.length,
      failedAttempts,
      // Non-null: `subs` is only ever created with a first element pushed in (see `byProblem.set` above), so it's never empty here.
      firstAttemptAt: subs[0]!.creationTimeSeconds,
      lastAttemptAt: subs[subs.length - 1]!.creationTimeSeconds,
      firstSolvedAt,
    };
    result.set(problemKey, summary);
  }

  return result;
}

/** Looks up a problem's status, defaulting to UNATTEMPTED when there's no submission history for it. */
export function getStatus(statusMap: StatusMap, problemKey: string): ProblemStatus {
  return statusMap.get(problemKey)?.status ?? ProblemStatus.Unattempted;
}
