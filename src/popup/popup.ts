// This is a deliberately bare-bones debug harness for Phase 1 — it exists
// so the data layer can be exercised by hand inside a real unpacked Chrome
// extension, not to be a preview of the eventual UI (that's Phase 3+).
declare const chrome: any;

import { Problem } from "../types/problem";
import { ProblemStatus } from "../types/status";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const output = $<HTMLPreElement>("output");

function print(text: string) {
  output.textContent = text;
}

function sendMessage<T = unknown>(message: unknown): Promise<{ ok: true; data: T } | { ok: false; error: { name: string; message: string } }> {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

interface SyncedState {
  problems: Problem[];
  // Sent over structured-clone messaging as a real Map — Chrome's extension
  // messaging supports Map/Set natively, same as postMessage.
  statusMap: Map<string, { status: ProblemStatus }>;
}

let lastState: SyncedState | null = null;

async function syncAll(force: boolean) {
  print("Syncing…");

  const handle = $<HTMLInputElement>("handle").value.trim();
  if (!handle) {
    print("Enter your Codeforces handle to start analyzing your solving history.");
    return;
  }

  const problemsetRes = await sendMessage<{ problems: Problem[]; fromCache: boolean }>({
    type: "SYNC_PROBLEMSET",
    force,
  });
  if (!problemsetRes.ok) {
    print(`Problemset sync failed: [${problemsetRes.error.name}] ${problemsetRes.error.message}`);
    return;
  }

  const userRes = await sendMessage<{
    profile: { handle: string; rating: number | null };
    statusMap: Map<string, { status: ProblemStatus }>;
    fromCache: boolean;
  }>({ type: "SYNC_USER", handle, force });

  if (!userRes.ok) {
    print(`User sync failed: [${userRes.error.name}] ${userRes.error.message}`);
    return;
  }

  const { problems, fromCache: problemsFromCache } = problemsetRes.data;
  const { profile, statusMap, fromCache: userFromCache } = userRes.data;

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

function runRangeQuery() {
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
}

$("sync").addEventListener("click", () => syncAll(false));
$("refresh").addEventListener("click", () => syncAll(true));
$("query").addEventListener("click", runRangeQuery);
