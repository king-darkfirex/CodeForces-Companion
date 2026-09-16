// The popup UI for Codeforces Companion: sync your Codeforces handle, see
// your solved/attempted stats and rating distribution, filter the
// problemset, and get a random problem suggestion.
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
import {
  getProblems,
  getProblemStats,
  getSuccessRate,
  getRatingDistribution,
  RATING_DISTRIBUTION_LABELS,
} from "../query/getProblems";
import { getRandomProblemByFilter } from "../query/getRandomProblemByFilter";
import { statusFilterFromSelection, StatusSelectValue } from "./statusSelect";
import { parseTagsInput } from "./tagsInput";
import { collectAllTags, toggleTagInInput, addRecentTags, isOutsideTagMenu } from "./tagMenu";
import { formatRandomProblemDisplay } from "./randomProblemDisplay";
import { formatRelativeTime } from "./formatRelativeTime";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const output = $<HTMLPreElement>("output");
const randomResultEl = $<HTMLDivElement>("randomResult");
const actionButtons = ["sync", "refresh", "query", "random"].map((id) => $<HTMLButtonElement>(id));

function print(text: string) {
  output.textContent = text;
}

const RANDOM_RESULT_PLACEHOLDER = "Run a random pick to see a suggested problem here.";

/**
 * Resets the Random Problem result to its placeholder. Called whenever the
 * filters that fed it (rating range, status, tags) or the underlying synced
 * data change, so a stale result — for a filter combination or dataset
 * that's no longer current — never lingers on screen looking like it still
 * applies.
 */
function invalidateRandomResult() {
  randomResultEl.textContent = RANDOM_RESULT_PLACEHOLDER;
}

function setBusy(busy: boolean) {
  for (const btn of actionButtons) btn.disabled = busy;
}

/**
 * The only place that reads `getProblemStats()` and writes it to the DOM —
 * so the statistics numbers are never computed more than once. Called after
 * every successful sync, whether that sync came from a fresh fetch or from
 * cache (`syncAll` doesn't branch differently between the two, so this
 * naturally covers both). Builds a small stat grid + success-rate bar;
 * `getProblemStats`/`getSuccessRate` themselves are untouched.
 */
function renderStats(problems: Problem[], statusMap: StatusMap) {
  const statsEl = $<HTMLDivElement>("stats");
  const stats = getProblemStats(problems, statusMap);
  const successRate = getSuccessRate(stats);
  const successRatePercent = successRate === null ? null : Math.round(successRate * 1000) / 10;

  statsEl.textContent = "";

  const grid = document.createElement("div");
  grid.className = "stat-grid";
  const cells: Array<[string, number, string]> = [
    ["Total", stats.total, ""],
    ["Solved", stats.solved, "stat-cell--solved"],
    ["Attempted", stats.attempted, "stat-cell--attempted"],
    ["Unattempted", stats.unattempted, "stat-cell--unattempted"],
  ];
  for (const [label, value, modifierClass] of cells) {
    const cell = document.createElement("div");
    cell.className = "stat-cell" + (modifierClass ? ` ${modifierClass}` : "");
    const valueEl = document.createElement("div");
    valueEl.className = "stat-value";
    valueEl.textContent = String(value);
    const labelEl = document.createElement("div");
    labelEl.className = "stat-label";
    labelEl.textContent = label;
    cell.append(valueEl, labelEl);
    grid.appendChild(cell);
  }
  statsEl.appendChild(grid);

  const successRateEl = document.createElement("div");
  successRateEl.className = "success-rate";
  const row = document.createElement("div");
  row.className = "success-rate-row";
  const rowLabel = document.createElement("span");
  rowLabel.textContent = "Success rate";
  const rowValue = document.createElement("strong");
  rowValue.textContent = successRatePercent === null ? "N/A" : `${successRatePercent}%`;
  row.append(rowLabel, rowValue);
  const track = document.createElement("div");
  track.className = "success-rate-track";
  const fill = document.createElement("div");
  fill.className = "success-rate-fill";
  fill.style.width = `${successRatePercent ?? 0}%`;
  track.appendChild(fill);
  successRateEl.append(row, track);
  statsEl.appendChild(successRateEl);
}

/**
 * The only place that reads `getRatingDistribution()` and writes it to the
 * DOM, mirroring `renderStats` above. Does not use `statusMap` at all, since
 * `getRatingDistribution` is purely a function of each problem's rating.
 * Renders one bar per label, its width scaled relative to whichever label
 * has the highest count; `getRatingDistribution`/`RATING_DISTRIBUTION_LABELS`
 * themselves are untouched.
 */
function renderRatingDistribution(problems: Problem[]) {
  const distributionEl = $<HTMLDivElement>("ratingDistribution");
  const distribution = getRatingDistribution(problems);
  const maxCount = Math.max(0, ...RATING_DISTRIBUTION_LABELS.map((label) => distribution[label]));

  distributionEl.textContent = "";
  const list = document.createElement("div");
  list.className = "rating-bars";
  for (const label of RATING_DISTRIBUTION_LABELS) {
    const count = distribution[label];
    const row = document.createElement("div");
    row.className = "rating-bar-row";

    const labelEl = document.createElement("span");
    labelEl.className = "rating-bar-label";
    labelEl.textContent = label;

    const track = document.createElement("div");
    track.className = "rating-bar-track";
    const fill = document.createElement("div");
    fill.className = "rating-bar-fill" + (label === "Unrated" ? " is-unrated" : "");
    fill.style.width = maxCount === 0 ? "0%" : `${(count / maxCount) * 100}%`;
    track.appendChild(fill);

    const countEl = document.createElement("span");
    countEl.className = "rating-bar-count";
    countEl.textContent = String(count);

    row.append(labelEl, track, countEl);
    list.appendChild(row);
  }
  distributionEl.appendChild(list);
}

function sendMessage<T>(message: ExtensionRequest): Promise<ExtensionResponse<T>> {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

interface SyncedState {
  problems: Problem[];
  statusMap: StatusMap; // reconstructed from the wire format — see deserializeStatusMap below
}

let lastState: SyncedState | null = null;

// --- Tag menu (clickable tag selector) ------------------------------------
//
// The menu is purely a convenience on top of the existing manual tags
// input: clicking a chip just toggles that tag inside `#tags`' text value
// (via `toggleTagInInput`), so the manual input and the menu always agree —
// there's no separate "selected tags" state to keep in sync, and the
// existing `parseTagsInput`/`getProblems` pipeline is untouched.
const RECENT_TAGS_STORAGE_KEY = "cf-companion:recentTags";
const RECENT_TAGS_MAX = 8;

const tagsInput = $<HTMLInputElement>("tags");
const tagMenu = $<HTMLDivElement>("tagMenu");
const tagMenuToggle = $<HTMLButtonElement>("tagMenuToggle");
const recentTagsList = $<HTMLDivElement>("recentTagsList");
const allTagsList = $<HTMLDivElement>("allTagsList");

function loadRecentTags(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_TAGS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function saveRecentTags(tags: string[]): void {
  try {
    localStorage.setItem(RECENT_TAGS_STORAGE_KEY, JSON.stringify(tags));
  } catch {
    // Recent tags are a convenience; failing to persist them (e.g. storage
    // disabled) shouldn't break tag selection itself.
  }
}

let recentTags: string[] = loadRecentTags();

function renderTagChips(container: HTMLDivElement, tags: string[], selected: Set<string>, emptyMessage: string): void {
  container.textContent = "";
  if (tags.length === 0) {
    const empty = document.createElement("span");
    empty.className = "tag-chip-empty";
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }
  for (const tag of tags) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tag-chip" + (selected.has(tag) ? " selected" : "");
    chip.textContent = tag;
    chip.addEventListener("click", () => {
      tagsInput.value = toggleTagInInput(tagsInput.value, tag);
      recentTags = addRecentTags(recentTags, [tag], RECENT_TAGS_MAX);
      saveRecentTags(recentTags);
      renderTagMenu();
      invalidateRandomResult();
    });
    container.appendChild(chip);
  }
}

/** Re-renders both "Recent tags" and "All tags" against the current input value and loaded problems. */
function renderTagMenu(): void {
  const selected = new Set(parseTagsInput(tagsInput.value));
  const allTags = collectAllTags(lastState?.problems ?? []);
  renderTagChips(recentTagsList, recentTags, selected, "No recent tags yet.");
  renderTagChips(allTagsList, allTags, selected, "Sync to see available tags.");
}

function setTagMenuOpen(open: boolean): void {
  tagMenu.hidden = !open;
  if (open) renderTagMenu();
}

tagMenuToggle.addEventListener("click", () => setTagMenuOpen(!!tagMenu.hidden));
tagsInput.addEventListener("input", () => {
  if (!tagMenu.hidden) renderTagMenu();
  invalidateRandomResult();
});
document.addEventListener("click", (e) => {
  if (!tagMenu.hidden && isOutsideTagMenu(e.target, tagMenu, tagMenuToggle, tagsInput)) {
    setTagMenuOpen(false);
  }
});

// The rating range and status controls are the other inputs that feed
// `showRandomProblem` (alongside tags, handled above) — changing any of
// them makes a previously-shown random result stale in the same way.
$<HTMLInputElement>("minRating").addEventListener("input", invalidateRandomResult);
$<HTMLInputElement>("maxRating").addEventListener("input", invalidateRandomResult);
$<HTMLSelectElement>("status").addEventListener("change", invalidateRandomResult);

// Ensures only one sync can be in flight at a time, and — critically — that
// the "busy" state is always cleared afterward (success, handled failure,
// or an unexpected exception), so the popup can never get permanently
// stuck on "Syncing…". See src/util/exclusiveTask.ts.
const runExclusive = createExclusiveRunner();

async function syncAll(force: boolean): Promise<void> {
  const handle = $<HTMLInputElement>("handle").value.trim();
  if (!handle) {
    print("Enter your Codeforces handle and sync to get started.");
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
  if (!tagMenu.hidden) renderTagMenu();
  invalidateRandomResult();

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
    if (tags.length > 0) {
      recentTags = addRecentTags(recentTags, tags, RECENT_TAGS_MAX);
      saveRecentTags(recentTags);
    }

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
  const resultEl = randomResultEl;
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
    if (tags.length > 0) {
      recentTags = addRecentTags(recentTags, tags, RECENT_TAGS_MAX);
      saveRecentTags(recentTags);
    }

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
    if (!tagMenu.hidden) renderTagMenu();
    invalidateRandomResult();

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
