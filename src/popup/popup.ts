// The popup UI for Codeforces Companion: sync your Codeforces handle, see
// your solved/attempted stats and rating distribution, filter the
// problemset, and get a random problem suggestion.
declare const chrome: any;

import { Problem } from "../types/problem";
import { ProblemStatus, StatusMap } from "../types/status";
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
  RATING_LEVELS,
  RatingDistributionLabel,
} from "../query/getProblems";
import { getRandomProblemByFilter } from "../query/getRandomProblemByFilter";
import { STATUS_OPTIONS, statusSummaryLabel } from "./statusSelect";
import { parseTagsInput } from "./tagsInput";
import { collectAllTags, toggleTagInInput, addRecentTags, isOutsideTagMenu } from "./tagMenu";
import { formatRandomProblemDisplay } from "./randomProblemDisplay";
import { formatRelativeTime } from "./formatRelativeTime";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const output = $<HTMLPreElement>("output");
const randomResultEl = $<HTMLDivElement>("randomResult");
const actionButtons = ["sync", "refresh", "query", "random"].map((id) => $<HTMLButtonElement>(id));

function print(text: string) {
  output.classList.remove("status-readout--error");
  output.textContent = text;
}

/**
 * Like `print()`, but styles #output as an error state and preserves the
 * full technical error (name + message) in the console — so replacing the
 * raw message shown to the user doesn't lose it for anyone debugging.
 */
function printSyncError(error: { name: string; message: string }) {
  console.error("Codeforces sync failed:", error.name, error.message);
  output.classList.add("status-readout--error");
  output.textContent = friendlySyncErrorMessage(error);
}

/** Maps a raw sync error to a short, friendly message. Error *handling* is unchanged — this only changes what's displayed. */
function friendlySyncErrorMessage(error: { name: string; message: string }): string {
  switch (error.name) {
    case "InvalidHandleError":
      return "Couldn't find that Codeforces user.\nPlease check the handle and try again.";
    case "RateLimitedError":
      return "Codeforces is rate-limiting requests right now.\nPlease wait a moment and try again.";
    case "NetworkError":
      return "Couldn't reach Codeforces.\nPlease check your connection and try again.";
    default:
      return "Something went wrong while syncing with Codeforces.\nPlease try again.";
  }
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
 * so the statistics numbers are never computed more than once. Builds a
 * small stat grid + success-rate bar into whichever container it's given;
 * `getProblemStats`/`getSuccessRate` themselves are untouched. Used for both
 * the "Overall" stats (`#stats`, unfiltered) and the "Filtered" stats
 * (`#filteredStats`, over `getProblems()`'s output) — same rendering code,
 * just a different `problems` array and target container.
 */
function renderStatsInto(container: HTMLDivElement, problems: Problem[], statusMap: StatusMap) {
  const stats = getProblemStats(problems, statusMap);
  const successRate = getSuccessRate(stats);
  const successRatePercent = successRate === null ? null : Math.round(successRate * 1000) / 10;

  container.textContent = "";

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
  container.appendChild(grid);

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
  container.appendChild(successRateEl);
}

/** Renders the "Overall" stats (unfiltered — the complete synced dataset) into `#stats`. */
function renderStats(problems: Problem[], statusMap: StatusMap) {
  renderStatsInto($<HTMLDivElement>("stats"), problems, statusMap);
}

/**
 * The only place that reads `getRatingDistribution()` and writes it to the
 * DOM, mirroring `renderStatsInto` above. Does not use `statusMap` at all,
 * since `getRatingDistribution` is purely a function of each problem's
 * rating; `getRatingDistribution` itself is untouched — this only changes
 * which of its labels get displayed. Only the 100-point levels within
 * [minRating, maxRating] are shown, and "Unrated" is never shown: `problems`
 * is expected to already be the *filtered* set (via `getProblems()`), and
 * this popup always supplies a numeric rating range (see
 * `readCurrentFilters()`), so a filtered set can never contain an unrated
 * problem in the first place.
 */
function renderRatingDistribution(problems: Problem[], minRating: number, maxRating: number) {
  const distributionEl = $<HTMLDivElement>("ratingDistribution");
  const distribution = getRatingDistribution(problems);
  const labels: RatingDistributionLabel[] = RATING_LEVELS.filter(
    (level) => level >= minRating && level <= maxRating
  ).map((level): RatingDistributionLabel => `${level}`);
  const maxCount = Math.max(0, ...labels.map((label) => distribution[label]));

  distributionEl.textContent = "";

  if (labels.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No rating levels in the selected range.";
    distributionEl.appendChild(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "rating-bars";
  for (const label of labels) {
    const count = distribution[label];
    const row = document.createElement("div");
    row.className = "rating-bar-row";

    const labelEl = document.createElement("span");
    labelEl.className = "rating-bar-label";
    labelEl.textContent = label;

    const track = document.createElement("div");
    track.className = "rating-bar-track";
    const fill = document.createElement("div");
    fill.className = "rating-bar-fill";
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

const STATS_EMPTY_MESSAGE = "Sync your handle to see problem counts.";
const FILTERED_STATS_EMPTY_MESSAGE = "Sync your handle to see problem counts.";
const RATING_DISTRIBUTION_EMPTY_MESSAGE = "Sync to see how your problems break down by rating.";

function resetEmptyState(container: HTMLDivElement, message: string): void {
  container.textContent = "";
  const empty = document.createElement("p");
  empty.className = "empty-state";
  empty.textContent = message;
  container.appendChild(empty);
}

/**
 * Resets every sync-dependent display back to its pre-sync appearance —
 * overall stats, filtered stats, rating distribution, the random result,
 * and the in-memory problem/status data itself. Called right when a new
 * Sync/Force-refresh starts, so a previous user's results never remain
 * visible (or queryable via Count/Random) through a sync that then fails,
 * e.g. on an invalid handle.
 */
function clearSyncedDisplays(): void {
  lastState = null;

  resetEmptyState($<HTMLDivElement>("stats"), STATS_EMPTY_MESSAGE);
  resetEmptyState($<HTMLDivElement>("filteredStats"), FILTERED_STATS_EMPTY_MESSAGE);
  resetEmptyState($<HTMLDivElement>("ratingDistribution"), RATING_DISTRIBUTION_EMPTY_MESSAGE);

  invalidateRandomResult();
  if (!tagMenu.hidden) renderTagMenu();
}

function sendMessage<T>(message: ExtensionRequest): Promise<ExtensionResponse<T>> {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

interface SyncedState {
  problems: Problem[];
  statusMap: StatusMap; // reconstructed from the wire format — see deserializeStatusMap below
}

let lastState: SyncedState | null = null;

interface CurrentFilters {
  minRating: number;
  maxRating: number;
  status: ProblemStatus[];
  tags: string[];
}

/**
 * Reads the rating range, status, and tags controls into a `getProblems()`-
 * compatible filter object. The single source of truth for how the popup
 * turns its filter controls into a `ProblemFilters` value — `runRangeQuery`,
 * `showRandomProblem`, and `renderFilteredResults` all call this instead of
 * each re-reading/re-parsing the same three inputs. `status` is always the
 * exact array of currently-checked statuses (never `undefined`): zero
 * checked correctly matches nothing and all three checked correctly matches
 * everything, both purely as a consequence of `getProblems()`'s existing
 * "problem's status must be included in this list" semantics — no special
 * casing needed here for either end of that range.
 */
function readCurrentFilters(): CurrentFilters {
  const minRating = Number($<HTMLInputElement>("minRating").value);
  const maxRating = Number($<HTMLInputElement>("maxRating").value);
  const tags = parseTagsInput($<HTMLInputElement>("tags").value);
  return { minRating, maxRating, status: Array.from(selectedStatuses), tags };
}

/**
 * Renders the "Filtered" stats block and the rating-distribution panel from
 * whatever currently matches the rating/status/tags controls — the same
 * pipeline `runRangeQuery`/`showRandomProblem` use, reusing the existing
 * `getProblems()` engine rather than duplicating its filtering logic:
 *
 *   selected filters -> getProblems() -> filtered problems
 *     -> renderStatsInto()          (getProblemStats()/getSuccessRate())
 *     -> renderRatingDistribution() (getRatingDistribution())
 *
 * No-op when nothing's synced yet — the pre-sync empty states set by
 * `clearSyncedDisplays()` are left alone. Called after every successful
 * sync/cache-restore, and again whenever any filter control changes, so
 * these two displays always reflect the currently selected filters.
 */
function renderFilteredResults(): void {
  if (!lastState) return;
  const { minRating, maxRating, status, tags } = readCurrentFilters();
  const filtered = getProblems(lastState.problems, lastState.statusMap, { minRating, maxRating, status, tags });
  renderStatsInto($<HTMLDivElement>("filteredStats"), filtered, lastState.statusMap);
  renderRatingDistribution(filtered, minRating, maxRating);
}

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
      renderFilteredResults();
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
  renderFilteredResults();
});
document.addEventListener("click", (e) => {
  if (!tagMenu.hidden && isOutsideTagMenu(e.target, tagMenu, tagMenuToggle, tagsInput)) {
    setTagMenuOpen(false);
  }
});

// --- Status selector (multi-select) ---------------------------------------
//
// Mirrors the tag selector's interaction style: a toggle button opens a
// dropdown of clickable chips (one per ProblemStatus), each toggled
// independently. Unlike tags there's no free-text input to keep in sync
// with — `selectedStatuses` is the only source of truth. getProblems()
// already handles both ends of the range correctly with no special-casing
// needed here: zero selected -> status: [] -> matches nothing; all three
// selected -> status: [Solved, Attempted, Unattempted] -> matches everything
// (every problem's status is one of exactly these three).
const statusMenuToggle = $<HTMLButtonElement>("statusMenuToggle");
const statusMenu = $<HTMLDivElement>("statusMenu");
const statusChipList = $<HTMLDivElement>("statusChipList");

// Default: all three checked, i.e. "All statuses" — no status filter in effect.
let selectedStatuses = new Set<ProblemStatus>(STATUS_OPTIONS.map((option) => option.value));

function updateStatusToggleLabel(): void {
  statusMenuToggle.textContent = `${statusSummaryLabel(selectedStatuses)} ▾`;
}

function renderStatusMenu(): void {
  statusChipList.textContent = "";
  for (const option of STATUS_OPTIONS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tag-chip" + (selectedStatuses.has(option.value) ? " selected" : "");
    chip.textContent = option.label;
    chip.addEventListener("click", () => {
      if (selectedStatuses.has(option.value)) {
        selectedStatuses.delete(option.value);
      } else {
        selectedStatuses.add(option.value);
      }
      renderStatusMenu();
      updateStatusToggleLabel();
      handleFilterControlChange();
    });
    statusChipList.appendChild(chip);
  }
}

function setStatusMenuOpen(open: boolean): void {
  statusMenu.hidden = !open;
  if (open) renderStatusMenu();
}

updateStatusToggleLabel();
renderStatusMenu();

statusMenuToggle.addEventListener("click", () => setStatusMenuOpen(!!statusMenu.hidden));
document.addEventListener("click", (e) => {
  if (!statusMenu.hidden && isOutsideTagMenu(e.target, statusMenu, statusMenuToggle, statusMenuToggle)) {
    setStatusMenuOpen(false);
  }
});

// The rating range control also feeds `renderFilteredResults()` (the
// "Filtered" stats block + the rating-distribution panel) and
// `showRandomProblem` (via invalidateRandomResult) — changing it makes both
// the filtered displays and a previously-shown random result stale in the
// same way. (The status menu's chip clicks call this directly, above.)
function handleFilterControlChange(): void {
  invalidateRandomResult();
  renderFilteredResults();
}
$<HTMLInputElement>("minRating").addEventListener("input", handleFilterControlChange);
$<HTMLInputElement>("maxRating").addEventListener("input", handleFilterControlChange);

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

  clearSyncedDisplays();
  print("Syncing…");

  const problemsetRes = await sendMessage<SyncProblemsetResponseData>({ type: "SYNC_PROBLEMSET", force });
  if (!problemsetRes.ok) {
    printSyncError(problemsetRes.error);
    return;
  }

  const userRes = await sendMessage<SyncUserResponseData>({ type: "SYNC_USER", handle, force });
  if (!userRes.ok) {
    printSyncError(userRes.error);
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
  renderFilteredResults();
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
      printSyncError({ name: e?.name ?? "Error", message: e?.message ?? String(err) });
    }
  }
}

function runRangeQuery() {
  try {
    if (!lastState) {
      print("Sync first, then run a query.");
      return;
    }
    const { minRating: min, maxRating: max, status, tags } = readCurrentFilters();
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

    const statusLabel = statusSummaryLabel(new Set(status));
    print(
      `${matches.length} problem(s) rated ${min}–${max} (${statusLabel}).\n\n` +
        matches
          .slice(0, 15)
          .map((p) => `${p.key}  ${p.name}  (${p.rating})`)
          .join("\n") +
        (matches.length > 15 ? `\n… and ${matches.length - 15} more` : "")
    );
    // The result prints into #output, which sits above the "Count problems
    // in range" button that triggers it — scroll it into view so the user
    // sees the result immediately instead of having to scroll up for it.
    output.scrollIntoView({ behavior: "smooth", block: "start" });
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

    const { minRating: min, maxRating: max, status, tags } = readCurrentFilters();
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
    renderFilteredResults();
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
