import { test, assertEqual, assertTrue } from "./testKit";
import { createExclusiveRunner, AlreadyRunningError } from "../util/exclusiveTask";

// These tests exist to verify the specific guarantees the sync-lock is
// supposed to provide (see popup.ts's handleSyncClick / syncAll):
//   1. A run can start normally.
//   2. A second run is rejected while the first is still in flight.
//   3. The lock is released when a run succeeds.
//   4. The lock is released when a run fails/throws.
//   5. After a failed run, a new run is accepted (not permanently blocked).
// They test `createExclusiveRunner` directly rather than driving the actual
// popup DOM — the popup has no test coverage of its own (that would need a
// DOM/browser environment, i.e. a new dependency), but the exclusivity and
// release-on-failure guarantees are entirely implemented in this one
// dependency-free function, so testing it in isolation covers the actual
// logic that matters.

function pending<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("a run starts normally and resolves with the task's result", async () => {
  const runExclusive = createExclusiveRunner();
  const result = await runExclusive(async () => 42);
  assertEqual(result, 42);
});

test("a second run is rejected with AlreadyRunningError while the first is still in flight", async () => {
  const runExclusive = createExclusiveRunner();
  const gate = pending<void>();

  const first = runExclusive(() => gate.promise);

  let secondError: unknown = null;
  try {
    await runExclusive(async () => "should not run");
  } catch (err) {
    secondError = err;
  }
  assertTrue(secondError instanceof AlreadyRunningError, "expected the second call to be rejected while the first is running");

  gate.resolve(); // let the first call finish so it doesn't leak into other tests
  await first;
});

test("the lock is released when a run succeeds, so a subsequent run is accepted", async () => {
  const runExclusive = createExclusiveRunner();
  await runExclusive(async () => "first run done");

  let secondRan = false;
  await runExclusive(async () => {
    secondRan = true;
  });
  assertTrue(secondRan, "expected a run started after a successful one to complete normally");
});

test("the lock is released when a run throws, so a subsequent run is accepted (not stuck)", async () => {
  const runExclusive = createExclusiveRunner();

  let caught: unknown = null;
  try {
    await runExclusive(async () => {
      throw new Error("simulated sync failure");
    });
  } catch (err) {
    caught = err;
  }
  assertTrue(caught instanceof Error && (caught as Error).message === "simulated sync failure", "expected the failure to propagate to the caller");

  // The real assertion: the failure above must not have left the runner
  // permanently locked. A follow-up run must be accepted and complete.
  let ranAfterFailure = false;
  await runExclusive(async () => {
    ranAfterFailure = true;
  });
  assertTrue(ranAfterFailure, "expected a run after a failed run to be accepted, not rejected as 'already running'");
});

test("the lock is released when a run's promise rejects (not just when it throws synchronously)", async () => {
  const runExclusive = createExclusiveRunner();

  let caught: unknown = null;
  try {
    await runExclusive(() => Promise.reject(new Error("async rejection")));
  } catch (err) {
    caught = err;
  }
  assertTrue(caught instanceof Error && (caught as Error).message === "async rejection");

  let ranAfter = false;
  await runExclusive(async () => {
    ranAfter = true;
  });
  assertTrue(ranAfter, "expected the runner to accept a new task after an async rejection");
});

test("separate createExclusiveRunner() instances have independent locks", async () => {
  const runnerA = createExclusiveRunner();
  const runnerB = createExclusiveRunner();
  const gate = pending<void>();

  const busyA = runnerA(() => gate.promise);

  // Runner B is a different instance — it must not be affected by A's lock.
  let ranOnB = false;
  await runnerB(async () => {
    ranOnB = true;
  });
  assertTrue(ranOnB, "expected an independent runner instance to be unaffected by another instance's lock");

  gate.resolve();
  await busyA;
});
