/** Base class for anything that goes wrong talking to the Codeforces API. */
export class CodeforcesApiError extends Error {
  constructor(message: string, public readonly raw?: unknown) {
    super(message);
    this.name = "CodeforcesApiError";
  }
}

/** The handle does not exist on Codeforces (or was typo'd). Not retryable. */
export class InvalidHandleError extends CodeforcesApiError {
  constructor(public readonly handle: string, message: string) {
    super(message);
    this.name = "InvalidHandleError";
  }
}

/** Codeforces is throttling us. Retryable with backoff. */
export class RateLimitedError extends CodeforcesApiError {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitedError";
  }
}

/** `fetch` itself failed (offline, DNS, CORS, etc.) or returned unparseable JSON. Retryable. */
export class NetworkError extends CodeforcesApiError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "NetworkError";
  }
}
