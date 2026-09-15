// This is a deliberately bare-bones debug harness for Phase 1 — it exists
// so the data layer can be exercised by hand inside a real unpacked Chrome
// extension, not to be a preview of the eventual UI (that's Phase 3+).
declare const chrome: any;

import { Problem } from "../types/problem";
import { StatusMap } from "../types/status";
import {
  ExtensionRequest,
  ExtensionResponse,
  SyncProblemsetResponseData,
  SyncUserResponseData,
  PeekCachedStateResponseData,
  deserializeStatusMap,
} from "../messaging/protocol";
import { createExclusiveRunner, AlreadyRunningError } from "../util/exclusiveTask";
import { getProblems, getProblemStats, getSuccessRate, getRatingDistribution, RATING_BUCKET_LABELS } from "../query/getProblems";
import { getRandomProblemByFilter } from "../query/getRandomProblemByFilter";
import { statusFilterFromSelection, StatusSelectValue } from "./statusSelect";
import { parseTagsInput } from "./tagsInput";
import { formatRandomProblemDisplay } from "./randomProblemDisplay";
import { formatRelativeTime } from "./formatRelativeTime";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const output = $<HTMLPreElement>("output");
const actionButtons = ["sync", "refresh", "query", "random"].map((id) => $<HTMLButtonElement>(id));

function print(text: string) {
  output.textContent = text;
}

function setBusy(busy: boolean) {
  for (const btn of actionButtons) btn.disabled = busy;
}

/**
 * The only place that reads `getProblemStats()` and writes it to the DOM —
 * so the statistics numbers are never computed more than once. Called after
 * every successful sync, whether that sync came from a fresh fetch or from
 * cache (`syncAll` doesn't branch differently between the two, so this
 * naturally covers both).
 */
function renderStats(problems: Problem[], statusMap: StatusMap) {
  const statsEl = $<HTMLPreElement>("stats");
  const stats = getProblemStats(problems, statusMap);
  const successRate = getSuccessRate(stats);
  statsEl.textContent = [
    `Total: ${stats.total}`,
    `Solved: ${stats.solved}`,
    `Attempted: ${stats.attempted}`,
    `Unattempted: ${stats.unattempted}`,
    `Success rate: ${successRate === null ? "N/A" : `${Math.round(successRate * 1000) / 10}%`}`,
  ].join("\n");
}

/**
 * The only place that reads `getRatingDistribution()` and writes it to the
 * DOM, mirroring `renderStats` above. Does not use `statusMap` at all, since
 * `getRatingDistribution` is purely a function of each problem's rating.
 */
function renderRatingDistribution(problems: Problem[]) {
  const distributionEl = $<HTMLPreElement>("ratingDistribution");
  const distribution = getRatingDistribution(problems);
  distributionEl.textContent = RATING_BUCKET_LABELS.map((label) => `${label}: ${distribution[label]}`).join("\n");
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

  const { problems, fromCache: problemsFromCache, syncedAt } = problemsetRes.data;
  const { profile, statusMap: serializedStatusMap, fromCache: userFromCache } = userRes.data;

  // The background worker sent statusMap as an array of [key, summary]
  // tuples (see src/messaging/protocol.ts) precisely because a real `Map`
  // does not survive chrome.runtime.sendMessage's default JSON-based
  // serialization. Reconstruct it here so the rest of this file can keep
  // using `.get()` as normal.
  const statusMap = deserializeStatusMap(serializedStatusMap);

  lastState = { problems, statusMap };
  renderStats(problems, statusMap);
  renderRatingDistribution(problems);

  print(
    [
      `Handle: ${profile.handle} (rating: ${profile.rating ?? "unrated"})`,
      `Problemset: ${problems.length} problems ${problemsFromCache ? "(cache)" : "(fetched)"}`,
      `Submissions: ${userFromCache ? "(cache)" : "(fetched)"}`,
      `Last synced: ${formatRelativeTime(Date.now() - syncedAt)}`,
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
 *
 * `setBusy(true)`/`setBusy(false)` are deliberately called *inside* the
 * task passed to `runExclusive`, not wrapped around the `runExclusive` call
 * itself. If they wrapped the whole call, a second click that arrives while
 * a sync is already running would hit `AlreadyRunningError` and its own
 * `finally` would immediately call `setBusy(false)` — re-enabling the
 * buttons while the *first* sync is still genuinely in progress. Scoping
 * `setBusy` to only the call that actually acquires the lock means a
 * rejected/overlapping attempt never touches the busy state that the
 * in-flight sync owns.
 */
async function handleSyncClick(force: boolean): Promise<void> {
  try {
    await runExclusive(async () => {
      setBusy(true);
      try {
        await syncAll(force);
      } finally {
        setBusy(false);
      }
    });
  } catch (err) {
    if (err instanceof AlreadyRunningError) {
      print("A sync is already in progress — please wait for it to finish.");
    } else {
      const e = err as { name?: string; message?: string };
      print(`Unexpected error during sync: [${e?.name ?? "Error"}] ${e?.message ?? String(err)}`);
    }
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
    const statusValue = $<HTMLSelectElement>("status").value as StatusSelectValue;
    const status = statusFilterFromSelection(statusValue);
    const tags = parseTagsInput($<HTMLInputElement>("tags").value);

    const matches = getProblems(lastState.problems, lastState.statusMap, {
      minRating: min,
      maxRating: max,
      status,
      tags,
    });

    const statusLabel = status ?? "any status";
    print(
      `${matches.length} problem(s) rated ${min}–${max} (${statusLabel}).\n\n` +
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

/**
 * Picks a random problem matching the currently selected rating range and
 * status (the same controls `runRangeQuery` reads), via the existing
 * `getRandomProblemByFilter()` — which itself is just `getProblems()` then
 * `getRandomProblem()`, so no filtering or selection logic is duplicated
 * here. Renders the result as a clickable link to its Codeforces problem
 * page via `formatRandomProblemDisplay()`; this function only reads the
 * result and updates the DOM.
 */
function showRandomProblem() {
  const resultEl = $<HTMLDivElement>("randomResult");
  try {
    if (!lastState) {
      resultEl.textContent = "Sync first, then pick a random problem.";
      return;
    }

    const min = Number($<HTMLInputElement>("minRating").value);
    const max = Number($<HTMLInputElement>("maxRating").value);
    const statusValue = $<HTMLSelectElement>("status").value as StatusSelectValue;
    const status = statusFilterFromSelection(statusValue); // "Any status" -> undefined -> no restriction
    const tags = parseTagsInput($<HTMLInputElement>("tags").value);

    const problem = getRandomProblemByFilter(lastState.problems, lastState.statusMap, {
      minRating: min,
      maxRating: max,
      status,
      tags,
    });
    if (!problem) {
      resultEl.textContent = "No problems match the selected filters.";
      return;
    }

    const { label, url } = formatRandomProblemDisplay(problem);
    resultEl.textContent = "";
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    resultEl.appendChild(link);
  } catch (err) {
    const e = err as { name?: string; message?: string };
    resultEl.textContent = `Unexpected error picking a random problem: [${e?.name ?? "Error"}] ${e?.message ?? String(err)}`;
  }
}

$("sync").addEventListener("click", () => void handleSyncClick(false));
$("refresh").addEventListener("click", () => void handleSyncClick(true));
$("query").addEventListener("click", runRangeQuery);
$("random").addEventListener("click", showRandomProblem);

/**
 * Runs once when the popup opens. Reuses the exact same cache the
 * Sync/Force-refresh flow already populates — no new persistence layer,
 * no network call, no TTL check (see `peekCachedState()` in
 * `sync/syncService.ts`). If nothing's cached yet, this is a no-op and the
 * popup just shows its normal empty-state placeholders, exactly as before
 * this existed.
 */
async function restoreFromCache(): Promise<void> {
  try {
    const res = await sendMessage<PeekCachedStateResponseData | null>({ type: "PEEK_CACHED_STATE" });
    if (!res.ok || !res.data) return;

    const { problems, profile, statusMap: serializedStatusMap, problemsetSyncedAt, userSyncedAt } = res.data;
    const statusMap = deserializeStatusMap(serializedStatusMap);

    $<HTMLInputElement>("handle").value = profile.handle;
    lastState = { problems, statusMap };
    renderStats(problems, statusMap);
    renderRatingDistribution(problems);

    const mostRecentSync = Math.max(problemsetSyncedAt, userSyncedAt);
    print(
      [
        `Handle: ${profile.handle} (rating: ${profile.rating ?? "unrated"})`,
        `Problemset: ${problems.length} problems (restored from cache)`,
        `Submissions: (restored from cache)`,
        `Last synced: ${formatRelativeTime(Date.now() - mostRecentSync)}`,
      ].join("\n")
    );
  } catch {
    // Restoration is a convenience, not a requirement — if anything goes
    // wrong here, silently fall back to the normal empty state rather than
    // surfacing an error for something the user didn't explicitly ask for.
  }
}

void restoreFromCache();
