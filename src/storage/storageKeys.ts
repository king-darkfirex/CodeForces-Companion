export const CACHE_SCHEMA_VERSION = 1;

export const StorageKeys = {
  meta: "cf:meta",
  problemset: "cf:problemset",
  submissions: (handle: string) => `cf:submissions:${handle.toLowerCase()}`,
  userProfile: (handle: string) => `cf:userProfile:${handle.toLowerCase()}`,
} as const;

export interface CacheMeta {
  schemaVersion: number;
  lastProblemsetSyncAt: number | null;
  /** unix ms, keyed by lowercased handle */
  lastUserSyncAt: Record<string, number>;
  /** newest submission id seen per handle, used to drive incremental sync */
  latestSubmissionId: Record<string, number>;
  /**
   * The most recently successfully-synced handle (lowercased), if any.
   * Purely for restoring the popup's last-shown data on reopen — never
   * consulted by the sync/fetch logic itself. `undefined` is treated the
   * same as `null` when reading older cached meta objects that predate
   * this field (no schema bump needed for a purely additive optional field).
   */
  lastUsedHandle: string | null;
}

export function emptyMeta(): CacheMeta {
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    lastProblemsetSyncAt: null,
    lastUserSyncAt: {},
    latestSubmissionId: {},
    lastUsedHandle: null,
  };
}
