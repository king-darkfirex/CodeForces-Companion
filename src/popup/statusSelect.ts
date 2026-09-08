import { ProblemStatus } from "../types/status";

export type StatusSelectValue = "all" | "solved" | "attempted" | "unattempted";

/** Maps the status <select>'s value to ProblemFilters.status: undefined for "all" (no filter), otherwise the matching ProblemStatus. */
export function statusFilterFromSelection(value: StatusSelectValue): ProblemStatus | undefined {
  switch (value) {
    case "solved":
      return ProblemStatus.Solved;
    case "attempted":
      return ProblemStatus.Attempted;
    case "unattempted":
      return ProblemStatus.Unattempted;
    case "all":
    default:
      return undefined;
  }
}
