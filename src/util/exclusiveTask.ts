/**
 * Wraps async tasks so only one can be "in flight" at a time for a given
 * runner instance. If a call arrives while a previous one is still
 * running, it's rejected immediately with {@link AlreadyRunningError}
 * rather than queued or silently dropped — the caller decides how (or
 * whether) to tell the user.
 *
 * The lock is released in a `finally`, so a task that throws or rejects can
 * never leave the runner stuck "on" — the very next call is always free to
 * proceed. This is what actually fixes "stuck on Syncing… forever after an
 * error": the bug wasn't really about locking at all, it was that nothing
 * upstream caught the exception, but this makes the intended lifecycle
 * (busy -> not busy, no matter what) impossible to get wrong by omission.
 */
export class AlreadyRunningError extends Error {
  constructor() {
    super("A task is already running.");
    this.name = "AlreadyRunningError";
  }
}

export function createExclusiveRunner() {
  let running = false;
  return async function runExclusive<T>(task: () => Promise<T>): Promise<T> {
    if (running) throw new AlreadyRunningError();
    running = true;
    try {
      return await task();
    } finally {
      running = false;
    }
  };
}
