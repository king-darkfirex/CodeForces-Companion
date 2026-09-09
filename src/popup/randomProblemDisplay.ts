import { Problem, problemUrl } from "../types/problem";

export interface RandomProblemDisplay {
  label: string;
  url: string;
}

/** Formats a Problem into the label text and link URL shown for the Random Problem result. */
export function formatRandomProblemDisplay(problem: Problem): RandomProblemDisplay {
  const identifier = problem.contestId !== null ? `${problem.contestId}${problem.index}` : problem.index;
  const ratingLabel = problem.rating !== null ? String(problem.rating) : "unrated";
  return {
    label: `${problem.name} (${identifier}, rating ${ratingLabel})`,
    url: problemUrl(problem),
  };
}
