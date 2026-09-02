import { Problem, makeProblemKey } from "../types/problem";
import { Submission, Verdict } from "../types/submission";
import { CFUserProfile } from "../types/user";
import {
  CFRawProblemsetProblemsResult,
  CFRawSubmission,
  CFRawUser,
} from "../api/endpoints";

export function normalizeProblemset(raw: CFRawProblemsetProblemsResult): Problem[] {
  // `problemStatistics` is returned as a parallel array to `problems`, but we
  // deliberately join by (contestId, index) instead of trusting array order —
  // that's both more robust and easier to reason about.
  const solvedCountByKey = new Map<string, number>();
  for (const stat of raw.problemStatistics) {
    const key = makeProblemKey({
      contestId: stat.contestId ?? null,
      problemsetName: stat.problemsetName ?? null,
      index: stat.index,
    });
    solvedCountByKey.set(key, stat.solvedCount);
  }

  return raw.problems.map((p) => {
    const contestId = p.contestId ?? null;
    const problemsetName = p.problemsetName ?? null;
    const key = makeProblemKey({ contestId, problemsetName, index: p.index });
    return {
      key,
      contestId,
      problemsetName,
      index: p.index,
      name: p.name,
      type: p.type === "QUESTION" ? "QUESTION" : "PROGRAMMING",
      rating: typeof p.rating === "number" ? p.rating : null,
      tags: p.tags ?? [],
      points: typeof p.points === "number" ? p.points : null,
      solvedCount: solvedCountByKey.get(key) ?? null,
    };
  });
}

const KNOWN_VERDICTS = new Set<Verdict>([
  "OK",
  "FAILED",
  "PARTIAL",
  "COMPILATION_ERROR",
  "RUNTIME_ERROR",
  "WRONG_ANSWER",
  "PRESENTATION_ERROR",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "IDLENESS_LIMIT_EXCEEDED",
  "SECURITY_VIOLATED",
  "CRASHED",
  "INPUT_PREPARATION_CRASHED",
  "CHALLENGED",
  "SKIPPED",
  "TESTING",
  "REJECTED",
]);

function normalizeVerdict(raw: string | undefined): Verdict | null {
  if (!raw) return null; // still judging
  return KNOWN_VERDICTS.has(raw as Verdict) ? (raw as Verdict) : null;
}

export function normalizeSubmission(raw: CFRawSubmission): Submission {
  // `problem.contestId` is the identity that actually matches problemset
  // entries; a few archive/gym submissions omit it on the problem but carry
  // it on the submission itself, so we fall back to that.
  const contestId = raw.problem.contestId ?? raw.contestId ?? null;
  const problemsetName = raw.problem.problemsetName ?? null;
  return {
    id: raw.id,
    problemKey: makeProblemKey({ contestId, problemsetName, index: raw.problem.index }),
    contestId,
    problemsetName,
    index: raw.problem.index,
    creationTimeSeconds: raw.creationTimeSeconds,
    verdict: normalizeVerdict(raw.verdict),
    programmingLanguage: raw.programmingLanguage,
  };
}

export function normalizeSubmissions(raw: CFRawSubmission[]): Submission[] {
  return raw.map(normalizeSubmission);
}

export function normalizeUser(raw: CFRawUser): CFUserProfile {
  return {
    handle: raw.handle,
    rating: typeof raw.rating === "number" ? raw.rating : null,
    maxRating: typeof raw.maxRating === "number" ? raw.maxRating : null,
    rank: raw.rank ?? null,
    maxRank: raw.maxRank ?? null,
    contribution: raw.contribution ?? 0,
    titlePhoto: raw.titlePhoto ?? null,
  };
}
