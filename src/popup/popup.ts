// This is a deliberately bare-bones debug harness for Phase 1 — it exists
// so the data layer can be exercised by hand inside a real unpacked Chrome
// extension, not to be a preview of the eventual UI (that's Phase 3+).
declare const chrome: any;

import { Problem } from "../types/problem";
import { ProblemStatus, StatusMap } from "../types/status";
import {
  ExtensionRequest,
  ExtensionResponse,
  SyncProblemsetResponseData,
  SyncUserResponseData,
  deserializeStatusMap,
} from "../messaging/protocol";
import { createExclusiveRunner, AlreadyRunningError } from "../util/exclusiveTask";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const output = $<HTMLPreElement>("output");
const actionButtons = ["sync", "refresh", "query"].map((id) => $<HTMLButtonElement>(id));

function print(text: string) {
  output.textContent = text;
}

function setBusy(busy: boolean) {
  for (const btn of actionButtons) btn.disabled = busy;
}

function sendMessage<T>(message: ExtensionRequest): Promise<ExtensionResponse<T>> {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

interface SyncedState {
  problems: Problem[];
  statusMap: StatusMap; // reconstructed from the wire format — see deserializeStatusMap below
}

let lastState: SyncedState | null = null;

// Ensures only one sync can be in flight at a time, and — critically — that
// the "busy" state is always cleared afterward (success, handled failure,
// or an unexpected exception), so the popup can never get permanently
// stuck on "Syncing…". See src/util/exclusiveTask.ts.
const runExclusive = createExclusiveRunner();

async function syncAll(force: boolean): Promise<void> {
  const handle = $<HTMLInputElement>("handle").value.trim();
  if (!handle) {
    print("Enter your Codeforces handle to start analyzing your solving history.");
    return;
  }

  print("Syncing…");

  const problemsetRes = await sendMessage<SyncProblemsetResponseData>({ type: "SYNC_PROBLEMSET", force });
  if (!problemsetRes.ok) {
    print(`Problemset sync failed: [${problemsetRes.error.name}] ${problemsetRes.error.message}`);
    return;
  }

  const userRes = await sendMessage<SyncUserResponseData>({ type: "SYNC_USER", handle, force });
  if (!userRes.ok) {
    print(`User sync failed: [${userRes.error.name}] ${userRes.error.message}`);
    return;
  }

  const { problems, fromCache: problemsFromCache } = problemsetRes.data;
  const { profile, statusMap: serializedStatusMap, fromCache: userFromCache } = userRes.data;

  // The background worker sent statusMap as an array of [key, summary]
  // tuples (see src/messaging/protocol.ts) precisely because a real `Map`
  // does not survive chrome.runtime.sendMessage's default JSON-based
  // serialization. Reconstruct it here so the rest of this file can keep
  // using `.get()` as normal.
  const statusMap = deserializeStatusMap(serializedStatusMap);

  lastState = { problems, statusMap };

  let solved = 0;
  let attempted = 0;
  for (const p of problems) {
    const status = statusMap.get(p.key)?.status ?? ProblemStatus.Unattempted;
    if (status === ProblemStatus.Solved) solved += 1;
    else if (status === ProblemStatus.Attempted) attempted += 1;
  }
  const unattempted = problems.length - solved - attempted;

  print(
    [
      `Handle: ${profile.handle} (rating: ${profile.rating ?? "unrated"})`,
      `Problemset: ${problems.length} problems ${problemsFromCache ? "(cache)" : "(fetched)"}`,
      `Submissions: ${userFromCache ? "(cache)" : "(fetched)"}`,
      "",
      `Solved:      ${solved}`,
      `Attempted:   ${attempted}`,
      `Unattempted: ${unattempted}`,
    ].join("\n")
  );
}

/**
 * Entry point wired to the Sync/Force-refresh buttons. This is the fix for
 * two related problems:
 *  1. `syncAll` can throw for reasons other than a handled API failure
 *     (e.g. a bug in response processing) — previously that became an
 *     "Uncaught (in promise)" console error the user never saw, and the
 *     popup stayed on "Syncing…" forever because nothing ran afterward to
 *     change it. The try/catch here guarantees *some* readable message
 *     always replaces "Syncing…".
 *  2. `runExclusive` guarantees only one sync runs at a time and — because
 *     it releases its lock in a `finally` regardless of success or
 *     failure — guarantees a later sync attempt is never permanently
 *     blocked by an earlier one crashing.
 */
async function handleSyncClick(force: boolean): Promise<void> {
  setBusy(true);
  try {
    await runExclusive(() => syncAll(force));
  } catch (err) {
    if (err instanceof AlreadyRunningError) {
      print("A sync is already in progress — please wait for it to finish.");
    } else {
      const e = err as { name?: string; message?: string };
      print(`Unexpected error during sync: [${e?.name ?? "Error"}] ${e?.message ?? String(err)}`);
    }
  } finally {
    setBusy(false);
  }
}

function runRangeQuery() {
  try {
    if (!lastState) {
      print("Sync first, then run a query.");
      return;
    }
    const min = Number($<HTMLInputElement>("minRating").value);
    const max = Number($<HTMLInputElement>("maxRating").value);

    const matches = lastState.problems.filter((p) => {
      if (p.rating === null || p.rating < min || p.rating > max) return false;
      const status = lastState!.statusMap.get(p.key)?.status ?? ProblemStatus.Unattempted;
      return status === ProblemStatus.Unattempted;
    });

    print(
      `${matches.length} unattempted problem(s) rated ${min}–${max}.\n\n` +
        matches
          .slice(0, 15)
          .map((p) => `${p.key}  ${p.name}  (${p.rating})`)
          .join("\n") +
        (matches.length > 15 ? `\n… and ${matches.length - 15} more` : "")
    );
  } catch (err) {
    const e = err as { name?: string; message?: string };
    print(`Unexpected error running query: [${e?.name ?? "Error"}] ${e?.message ?? String(err)}`);
  }
}

$("sync").addEventListener("click", () => void handleSyncClick(false));
$("refresh").addEventListener("click", () => void handleSyncClick(true));
$("query").addEventListener("click", runRangeQuery);
