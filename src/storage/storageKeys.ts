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
}

export function emptyMeta(): CacheMeta {
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    lastProblemsetSyncAt: null,
    lastUserSyncAt: {},
    latestSubmissionId: {},
  };
}
