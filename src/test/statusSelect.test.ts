import { test, assertEqual } from "./testKit";
import { statusFilterFromSelection } from "../popup/statusSelect";
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
