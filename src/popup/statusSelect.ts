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

/** The three checkable statuses for the multi-select status menu, in display order. */
export const STATUS_OPTIONS: ReadonlyArray<{ value: ProblemStatus; label: string }> = [
  { value: ProblemStatus.Solved, label: "Solved" },
  { value: ProblemStatus.Attempted, label: "Attempted" },
  { value: ProblemStatus.Unattempted, label: "Unattempted" },
];

/**
 * Produces the compact label shown on the status menu's toggle button for a
 * given set of checked statuses: "All statuses" when all three are checked,
 * "No statuses selected" when none are, otherwise the checked statuses'
 * labels joined by comma in `STATUS_OPTIONS`' fixed order (so the label
 * doesn't depend on click order).
 */
export function statusSummaryLabel(selected: ReadonlySet<ProblemStatus>): string {
  if (selected.size === 0) return "No statuses selected";
  if (selected.size === STATUS_OPTIONS.length) return "All statuses";
  return STATUS_OPTIONS.filter((option) => selected.has(option.value))
    .map((option) => option.label)
    .join(", ");
}
