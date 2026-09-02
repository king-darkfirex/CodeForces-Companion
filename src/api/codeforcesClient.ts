import {
  CF_API_BASE,
  CFApiResponse,
  CFRawProblemsetProblemsResult,
  CFRawSubmission,
  CFRawUser,
} from "./endpoints";
import { CodeforcesApiError, InvalidHandleError, NetworkError, RateLimitedError } from "./errors";

// ---------------------------------------------------------------------------
// Throttling
//
// Codeforces does not publish an exact rate limit for anonymous API use, but
// community experience is that bursts of rapid requests get throttled. Since
// a full submission-history sync can mean several sequential requests, we
// serialize all outgoing calls through a single gate with a minimum spacing,
// rather than relying on retry-after-the-fact alone.
// ---------------------------------------------------------------------------

const MIN_REQUEST_INTERVAL_MS = 400;
let lastRequestAt = 0;
let gate: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(async () => {
    const wait = Math.max(0, lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return fn();
  });
  // Keep the gate alive regardless of this call's outcome, so one failed
  // request doesn't break throttling for everything queued behind it.
  gate = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof RateLimitedError || err instanceof NetworkError;
      if (!retryable || attempt >= retries) throw err;
      await sleep(1000 * 2 ** attempt); // 1s, 2s, 4s
      attempt += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Low-level call + error classification
// ---------------------------------------------------------------------------

async function callApi<T>(method: string, params: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${CF_API_BASE}/${method}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch (err) {
    throw new NetworkError(`Failed to reach the Codeforces API (${method}).`, err);
  }

  let body: CFApiResponse<T>;
  try {
    body = (await response.json()) as CFApiResponse<T>;
  } catch (err) {
    throw new NetworkError(`Codeforces returned an unreadable response for ${method}.`, err);
  }

  if (body.status === "OK") {
    return body.result;
  }

  const comment = body.comment ?? "Unknown Codeforces API error.";
  if (/not found/i.test(comment)) {
    const handleMatch = /handle:\s*(\S+)/i.exec(comment);
    const handle = handleMatch?.[1] ?? String(params.handle ?? params.handles ?? "");
    throw new InvalidHandleError(handle, comment);
  }
  if (/limit|too many|frequently/i.test(comment)) {
    throw new RateLimitedError(comment);
  }
  throw new CodeforcesApiError(comment);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches a single user's profile. This also doubles as handle validation:
 * an unknown handle rejects with {@link InvalidHandleError}.
 */
export async function fetchUserInfo(handle: string): Promise<CFRawUser> {
  const users = await withRetry(() => throttled(() => callApi<CFRawUser[]>("user.info", { handles: handle })));
  const user = users[0];
  if (!user) {
    // Shouldn't happen when the API reports status "OK", but guards against
    // a malformed/empty result instead of returning `undefined` typed as `CFRawUser`.
    throw new InvalidHandleError(handle, `Codeforces returned no data for handle "${handle}".`);
  }
  return user;
}

export interface FetchPage {
  /** 1-based index of the first submission to return, per the CF API convention. */
  from: number;
  count: number;
}

export async function fetchUserStatusPage(handle: string, page: FetchPage): Promise<CFRawSubmission[]> {
  return withRetry(() =>
    throttled(() => callApi<CFRawSubmission[]>("user.status", { handle, from: page.from, count: page.count }))
  );
}

/** Codeforces returns `user.status` sorted newest-submission-first; we page through it in chunks this size. */
const PAGE_SIZE = 500;

export interface FetchAllOptions {
  /**
   * If provided, stop paginating as soon as a submission with this id (or
   * older — ids are monotonically increasing) is seen. Since `user.status`
   * is newest-first, everything after that point is already cached. Used
   * for incremental syncs.
   */
  stopAtSubmissionId?: number;
  onProgress?: (fetchedSoFar: number) => void;
}

/**
 * Fetches a user's entire submission history, paginating in chunks of
 * {@link PAGE_SIZE} rather than requesting everything in one call. This
 * keeps any single request small (avoiding server-side timeouts for users
 * with very large histories) and enables incremental sync via
 * `stopAtSubmissionId`.
 */
export async function fetchAllUserSubmissions(
  handle: string,
  options: FetchAllOptions = {}
): Promise<CFRawSubmission[]> {
  const all: CFRawSubmission[] = [];
  let from = 1;

  for (;;) {
    const page = await fetchUserStatusPage(handle, { from, count: PAGE_SIZE });
    if (page.length === 0) break;

    if (options.stopAtSubmissionId !== undefined) {
      const cutoffIndex = page.findIndex((s) => s.id <= options.stopAtSubmissionId!);
      if (cutoffIndex !== -1) {
        all.push(...page.slice(0, cutoffIndex));
        break;
      }
    }

    all.push(...page);
    options.onProgress?.(all.length);

    if (page.length < PAGE_SIZE) break; // that was the last page
    from += PAGE_SIZE;
  }

  return all;
}

/** Fetches the entire public problemset. Codeforces returns this as a single, unpaginated call. */
export async function fetchProblemset(): Promise<CFRawProblemsetProblemsResult> {
  return withRetry(() => throttled(() => callApi<CFRawProblemsetProblemsResult>("problemset.problems", {})));
}
