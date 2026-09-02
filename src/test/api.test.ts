import { test, assertEqual, assertTrue } from "./testKit";
import { fetchUserInfo, fetchProblemset, fetchAllUserSubmissions } from "../api/codeforcesClient";
import { InvalidHandleError, RateLimitedError } from "../api/errors";

function mockJsonResponse(body: unknown) {
  (globalThis as any).fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

function fakeSub(id: number) {
  return {
    id,
    creationTimeSeconds: id,
    problem: { contestId: 1, index: "A", name: "X", type: "PROGRAMMING", tags: [] },
    programmingLanguage: "GNU C++17",
    verdict: "OK",
  };
}

test("fetchUserInfo throws InvalidHandleError when Codeforces reports the handle doesn't exist", async () => {
  mockJsonResponse({ status: "FAILED", comment: "handle: User with handle doesNotExist123 not found" });
  let caught: unknown = null;
  try {
    await fetchUserInfo("doesNotExist123");
  } catch (err) {
    caught = err;
  }
  assertTrue(caught instanceof InvalidHandleError, "expected InvalidHandleError");
});

test("fetchProblemset returns the raw result on a successful response", async () => {
  mockJsonResponse({ status: "OK", result: { problems: [], problemStatistics: [] } });
  const result = await fetchProblemset();
  assertEqual(result, { problems: [], problemStatistics: [] });
});

test("a rate-limit response is retried with backoff, then throws RateLimitedError once retries are exhausted", async () => {
  let calls = 0;
  (globalThis as any).fetch = async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => ({ status: "FAILED", comment: "Limit exceeded, please decrease request frequency" }) };
  };
  let caught: unknown = null;
  try {
    await fetchUserInfo("someone");
  } catch (err) {
    caught = err;
  }
  assertTrue(caught instanceof RateLimitedError, "expected RateLimitedError after retries are exhausted");
  assertEqual(calls, 4); // 1 initial attempt + 3 retries (takes ~7s due to real backoff delays)
});

test("fetchAllUserSubmissions paginates until a short page signals the end", async () => {
  const seenFrom: number[] = [];
  (globalThis as any).fetch = async (url: string) => {
    const u = new URL(url);
    const from = Number(u.searchParams.get("from"));
    seenFrom.push(from);
    let items: unknown[] = [];
    if (from === 1) items = Array.from({ length: 500 }, (_, i) => fakeSub(1000 - i));
    else if (from === 501) items = Array.from({ length: 10 }, (_, i) => fakeSub(500 - i));
    return { ok: true, status: 200, json: async () => ({ status: "OK", result: items }) };
  };
  const all = await fetchAllUserSubmissions("someone");
  assertEqual(all.length, 510);
  assertEqual(seenFrom, [1, 501]);
});

test("fetchAllUserSubmissions stops early once it reaches a previously-seen submission id", async () => {
  mockJsonResponse({ status: "OK", result: [fakeSub(1005), fakeSub(1004), fakeSub(1003), fakeSub(1002)] });
  const all = await fetchAllUserSubmissions("someone", { stopAtSubmissionId: 1003 });
  assertEqual(
    all.map((s) => s.id),
    [1005, 1004]
  );
});
