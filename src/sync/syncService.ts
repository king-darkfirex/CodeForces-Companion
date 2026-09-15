import { fetchAllUserSubmissions, fetchProblemset, fetchUserInfo } from "../api/codeforcesClient";
import { normalizeProblemset, normalizeSubmissions, normalizeUser } from "../data/normalize";
import { classifySubmissions } from "../data/classify";
import { Problem } from "../types/problem";
import { Submission } from "../types/submission";
import { CFUserProfile } from "../types/user";
import { StatusMap } from "../types/status";
import {
  readMeta,
  writeMeta,
  readProblemset,
  writeProblemset,
  readSubmissions,
  writeSubmissions,
  readUserProfile,
  writeUserProfile,
} from "../storage/cache";

/** Problems change relatively rarely (new contests add a handful at a time), so a daily refresh is plenty. */
const PROBLEMSET_TTL_MS = 24 * 60 * 60 * 1000;
/** Submissions can change at any moment while someone is actively solving, so this is much shorter. */
const USER_TTL_MS = 10 * 60 * 1000;

function normalizedHandle(handle: string): string {
  return handle.trim().toLowerCase();
}

export interface ProblemsetResult {
  problems: Problem[];
  fromCache: boolean;
  syncedAt: number;
}

/** Ensures a fresh-enough copy of the full problemset is cached, fetching only when the cache is missing, stale, or `force` is set. */
export async function ensureProblemset(opts: { force?: boolean } = {}): Promise<ProblemsetResult> {
  const meta = await readMeta();
  const cached = await readProblemset();
  const age = meta.lastProblemsetSyncAt ? Date.now() - meta.lastProblemsetSyncAt : Infinity;

  if (!opts.force && cached && age < PROBLEMSET_TTL_MS) {
    return { problems: cached, fromCache: true, syncedAt: meta.lastProblemsetSyncAt! };
  }

  const raw = await fetchProblemset();
  const problems = normalizeProblemset(raw);
  await writeProblemset(problems);
  const syncedAt = Date.now();
  await writeMeta({ ...meta, lastProblemsetSyncAt: syncedAt });
  return { problems, fromCache: false, syncedAt };
}

export interface UserDataResult {
  profile: CFUserProfile;
  submissions: Submission[];
  statusMap: StatusMap;
  fromCache: boolean;
  syncedAt: number;
}

/**
 * Ensures a fresh-enough copy of a user's profile + submissions is cached,
 * validating the handle in the process. On a cache miss/expiry it fetches
 * `user.info` first (cheap, and doubles as handle validation) before paying
 * for the potentially-large `user.status` pagination.
 *
 * When we already have a cached submission list for this handle, the sync
 * is incremental: we only page through submissions newer than the
 * previously-seen newest submission id, then merge. This is the difference
 * between a full re-download and a handful of requests on every popup open
 * for an active user.
 */
export async function ensureUserData(rawHandle: string, opts: { force?: boolean } = {}): Promise<UserDataResult> {
  const handle = normalizedHandle(rawHandle);
  const meta = await readMeta();
  const cachedSubs = await readSubmissions(handle);
  const cachedProfile = await readUserProfile(handle);
  const lastSync = meta.lastUserSyncAt[handle];
  const age = lastSync ? Date.now() - lastSync : Infinity;

  if (!opts.force && cachedSubs && cachedProfile && lastSync !== undefined && age < USER_TTL_MS) {
    if (meta.lastUsedHandle !== handle) {
      await writeMeta({ ...meta, lastUsedHandle: handle });
    }
    return {
      profile: cachedProfile,
      submissions: cachedSubs,
      statusMap: classifySubmissions(cachedSubs),
      fromCache: true,
      syncedAt: lastSync,
    };
  }

  const rawUser = await fetchUserInfo(handle); // throws InvalidHandleError for a bad handle
  const profile = normalizeUser(rawUser);

  const knownLatestId = meta.latestSubmissionId[handle];
  const canIncrement = !opts.force && !!cachedSubs && cachedSubs.length > 0 && knownLatestId !== undefined;

  const rawNew = await fetchAllUserSubmissions(handle, {
    stopAtSubmissionId: canIncrement ? knownLatestId : undefined,
  });
  const newSubs = normalizeSubmissions(rawNew);
  const merged = canIncrement ? mergeSubmissions(cachedSubs!, newSubs) : newSubs;

  await writeSubmissions(handle, merged);
  await writeUserProfile(handle, profile);

  const syncedAt = Date.now();
  await writeMeta({
    ...meta,
    lastUserSyncAt: { ...meta.lastUserSyncAt, [handle]: syncedAt },
    latestSubmissionId: { ...meta.latestSubmissionId, [handle]: latestSubmissionId(merged) },
    lastUsedHandle: handle,
  });

  return { profile, submissions: merged, statusMap: classifySubmissions(merged), fromCache: false, syncedAt };
}

/** Combines a fresh page of (newer) submissions with the previously cached list, de-duplicating by id and keeping newest-first order. */
export function mergeSubmissions(cached: Submission[], fresh: Submission[]): Submission[] {
  const byId = new Map<number, Submission>();
  for (const s of cached) byId.set(s.id, s);
  for (const s of fresh) byId.set(s.id, s);
  return [...byId.values()].sort((a, b) => b.creationTimeSeconds - a.creationTimeSeconds);
}

/** Max submission id in the list. Written as a loop (not `Math.max(...ids)`) so it doesn't blow the call stack on very large histories. */
function latestSubmissionId(submissions: Submission[]): number {
  let max = 0;
  for (const s of submissions) if (s.id > max) max = s.id;
  return max;
}

export interface CachedRestoreState {
  problems: Problem[];
  profile: CFUserProfile;
  statusMap: StatusMap;
  problemsetSyncedAt: number;
  userSyncedAt: number;
}

/**
 * Reads whatever is already cached for the most-recently-used handle, with
 * NO network calls and NO TTL checks — this is intentionally not
 * `ensureProblemset`/`ensureUserData` with a short-circuit; it's a pure
 * "what do we already have" peek, used only to rehydrate the popup UI on
 * open. Returns `null` if there's no recorded handle yet, or if any of the
 * required pieces (problemset, submissions, profile, their sync
 * timestamps) aren't fully present — in which case the popup simply shows
 * its normal empty state and waits for an explicit Sync, exactly as before
 * this existed.
 */
export async function peekCachedState(): Promise<CachedRestoreState | null> {
  const meta = await readMeta();
  const handle = meta.lastUsedHandle ?? null;
  if (!handle) return null;

  const problems = await readProblemset();
  const submissions = await readSubmissions(handle);
  const profile = await readUserProfile(handle);
  if (!problems || !submissions || !profile) return null;

  const problemsetSyncedAt = meta.lastProblemsetSyncAt;
  const userSyncedAt = meta.lastUserSyncAt[handle];
  if (problemsetSyncedAt === null || userSyncedAt === undefined) return null;

  return {
    problems,
    profile,
    statusMap: classifySubmissions(submissions),
    problemsetSyncedAt,
    userSyncedAt,
  };
}
