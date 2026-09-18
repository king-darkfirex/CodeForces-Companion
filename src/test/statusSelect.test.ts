import { test, assertEqual } from "./testKit";
import { statusFilterFromSelection, statusSummaryLabel } from "../popup/statusSelect";
import { ProblemStatus } from "../types/status";

test("'all' produces no status filter", () => {
  assertEqual(statusFilterFromSelection("all"), undefined);
});

test("'solved' maps to ProblemStatus.Solved", () => {
  assertEqual(statusFilterFromSelection("solved"), ProblemStatus.Solved);
});

test("'attempted' maps to ProblemStatus.Attempted", () => {
  assertEqual(statusFilterFromSelection("attempted"), ProblemStatus.Attempted);
});

test("'unattempted' maps to ProblemStatus.Unattempted", () => {
  assertEqual(statusFilterFromSelection("unattempted"), ProblemStatus.Unattempted);
});

// --- statusSummaryLabel (multi-select status menu) --------------------------

test("statusSummaryLabel: all three selected reads as 'All statuses'", () => {
  const selected = new Set([ProblemStatus.Solved, ProblemStatus.Attempted, ProblemStatus.Unattempted]);
  assertEqual(statusSummaryLabel(selected), "All statuses");
});

test("statusSummaryLabel: none selected reads as 'No statuses selected'", () => {
  assertEqual(statusSummaryLabel(new Set()), "No statuses selected");
});

test("statusSummaryLabel: a single selected status shows just that status", () => {
  assertEqual(statusSummaryLabel(new Set([ProblemStatus.Solved])), "Solved");
  assertEqual(statusSummaryLabel(new Set([ProblemStatus.Attempted])), "Attempted");
  assertEqual(statusSummaryLabel(new Set([ProblemStatus.Unattempted])), "Unattempted");
});

test("statusSummaryLabel: two selected statuses are joined in a fixed order", () => {
  assertEqual(statusSummaryLabel(new Set([ProblemStatus.Solved, ProblemStatus.Attempted])), "Solved, Attempted");
});

test("statusSummaryLabel: the fixed order doesn't depend on the order statuses were added to the Set", () => {
  const selected = new Set([ProblemStatus.Unattempted, ProblemStatus.Solved]);
  assertEqual(statusSummaryLabel(selected), "Solved, Unattempted");
});
