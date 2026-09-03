import { test, assertEqual, assertTrue } from "./testKit";
import { classifySubmissions } from "../data/classify";
import { normalizeSubmission } from "../data/normalize";
import { serializeStatusMap, deserializeStatusMap } from "../messaging/protocol";
import { ProblemStatus } from "../types/status";
import { CFRawSubmission } from "../api/endpoints";

// These tests exist specifically because of a real bug: a `StatusMap` (a
// `Map`) was previously sent directly as part of a chrome.runtime.sendMessage
// response. Chrome's extension messaging API serializes messages as JSON by
// default (structured-clone messaging is opt-in and only available on
// Chrome 148+) — and `JSON.stringify(new Map(...))` produces `"{}"`, so the
// popup received an object with no `.get()`, crashing with
// "f.get is not a function". The fix converts the Map to a plain array of
// entries before sending, and rebuilds a Map after receiving.
//
// To make sure this is actually verified (not just "our own functions are
// inverses of each other"), the key test below round-trips through real
// `JSON.stringify`/`JSON.parse` — the same transformation Chrome's default
// messaging applies — rather than only calling serialize/deserialize
// directly against each other.

function buildSampleStatusMap() {
  const raw: CFRawSubmission = {
    id: 1,
    contestId: 1,
    creationTimeSeconds: 100,
    problem: { contestId: 1, index: "A", name: "X", type: "PROGRAMMING", tags: [] },
    programmingLanguage: "GNU C++17",
    verdict: "OK",
  };
  return classifySubmissions([normalizeSubmission(raw)]);
}

test("serializeStatusMap produces a plain JSON-safe array, not a Map", () => {
  const statusMap = buildSampleStatusMap();
  const serialized = serializeStatusMap(statusMap);
  assertTrue(Array.isArray(serialized), "expected serializeStatusMap to return an array");
  assertTrue(!(serialized instanceof Map), "the serialized form must not itself be a Map");
});

test("a StatusMap survives a real JSON.stringify/JSON.parse round-trip (simulating Chrome's default message serialization) and .get() still works afterward", () => {
  const statusMap = buildSampleStatusMap();
  const serialized = serializeStatusMap(statusMap);

  // This is the important part: actually go through JSON, the same way
  // Chrome's default (non-structured-clone) extension messaging does.
  const wireForm = JSON.parse(JSON.stringify(serialized));

  const reconstructed = deserializeStatusMap(wireForm);
  assertTrue(reconstructed instanceof Map, "expected a real Map after deserialization");
  assertEqual(reconstructed.get("C1-A")?.status, ProblemStatus.Solved);
  assertEqual(reconstructed.get("C1-B"), undefined); // never submitted -> no entry, same as before serialization
});

test("sending a bare StatusMap through JSON (the bug, reproduced) loses all lookup ability — this is what the fix avoids doing", () => {
  const statusMap = buildSampleStatusMap();
  // Reproduce the original bug directly: what happens if you don't convert
  // the Map before JSON-round-tripping it, the way sendResponse used to.
  const wireForm = JSON.parse(JSON.stringify(statusMap)) as unknown;
  assertEqual(wireForm, {}); // exactly the "arrives as {}" failure mode
  assertTrue(!(wireForm as { get?: unknown }).get, "a bare Map really does lose .get() over JSON — confirms the root cause");
});
