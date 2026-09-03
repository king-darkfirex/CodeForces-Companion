/**
 * The message contract between the popup (and any future UI surface) and
 * the background service worker.
 *
 * IMPORTANT — why this file exists:
 * `chrome.runtime.sendMessage` / `onMessage` do not reliably preserve
 * JavaScript built-in types like `Map`, `Set`, or `Date` across the
 * boundary. By default, Chrome's extension messaging API serializes
 * messages as JSON, not via the structured clone algorithm (structured-
 * clone messaging is opt-in via the manifest key
 * `"message_serialization": "structured_clone"`, and only available on
 * Chrome 148+). `JSON.stringify(new Map(...))` produces `"{}"`, so a `Map`
 * sent this way arrives on the other side as an object with no `.get`,
 * `.set`, `.has`, etc. — exactly the `f.get is not a function` failure this
 * fix addresses.
 *
 * Rather than relying on every future message handler to remember that
 * rule, every type that is actually allowed to cross this boundary is
 * defined here, and it's always a plain, JSON-safe shape: arrays, plain
 * objects, strings, numbers, booleans, null. `StatusMap` (a `Map`) is
 * converted to `SerializedStatusMap` (an array of `[key, value]` tuples) by
 * `serializeStatusMap` before it's ever handed to `sendResponse`, and
 * turned back into a real `Map` by `deserializeStatusMap` after it's
 * received — so code on both sides keeps using `.get()` the same way it
 * always did, it just crosses the wire as something JSON can actually carry.
 */

import { Problem } from "../types/problem";
import { Submission } from "../types/submission";
import { CFUserProfile } from "../types/user";
import { ProblemAttemptSummary, StatusMap } from "../types/status";

// ---------------------------------------------------------------------------
// StatusMap <-> wire format
// ---------------------------------------------------------------------------

/** JSON-safe wire representation of a {@link StatusMap}: an array of `[key, summary]` tuples. */
export type SerializedStatusMap = Array<[string, ProblemAttemptSummary]>;

export function serializeStatusMap(map: StatusMap): SerializedStatusMap {
  return [...map.entries()];
}

export function deserializeStatusMap(entries: SerializedStatusMap): StatusMap {
  return new Map(entries);
}

// ---------------------------------------------------------------------------
// Requests: popup -> background
// ---------------------------------------------------------------------------

export type ExtensionRequest =
  | { type: "SYNC_PROBLEMSET"; force?: boolean }
  | { type: "SYNC_USER"; handle: string; force?: boolean };

// ---------------------------------------------------------------------------
// Response payloads: background -> popup
//
// Every field here must be JSON-safe. If you add a field, ask: "does this
// survive JSON.stringify/JSON.parse with no loss?" Problem[]/Submission[]/
// CFUserProfile are all plain-object shapes, so they're fine as-is; a `Map`
// or `Set` is not, and must be serialized first (see StatusMap above).
// ---------------------------------------------------------------------------

export interface SyncProblemsetResponseData {
  problems: Problem[];
  fromCache: boolean;
  syncedAt: number;
}

export interface SyncUserResponseData {
  profile: CFUserProfile;
  submissions: Submission[];
  statusMap: SerializedStatusMap;
  fromCache: boolean;
  syncedAt: number;
}

export interface ExtensionErrorPayload {
  name: string;
  message: string;
}

export type ExtensionResponse<T> = { ok: true; data: T } | { ok: false; error: ExtensionErrorPayload };
