import { getLocalStorage } from "./chromeStorageAdapter";
import { StorageKeys, CacheMeta, emptyMeta, CACHE_SCHEMA_VERSION } from "./storageKeys";
import { Problem } from "../types/problem";
import { Submission } from "../types/submission";
import { CFUserProfile } from "../types/user";

export async function readMeta(): Promise<CacheMeta> {
  const items = await getLocalStorage().get<CacheMeta>(StorageKeys.meta);
  const meta = items[StorageKeys.meta];
  if (!meta || meta.schemaVersion !== CACHE_SCHEMA_VERSION) {
    // Either first run, or a future session bumped the schema version and
    // we're an older/rolled-back build — starting clean is safer than
    // trying to interpret data in an unknown shape.
    return emptyMeta();
  }
  return meta;
}

export async function writeMeta(meta: CacheMeta): Promise<void> {
  await getLocalStorage().set({ [StorageKeys.meta]: meta });
}

export async function readProblemset(): Promise<Problem[] | null> {
  const items = await getLocalStorage().get<Problem[]>(StorageKeys.problemset);
  return items[StorageKeys.problemset] ?? null;
}

export async function writeProblemset(problems: Problem[]): Promise<void> {
  await getLocalStorage().set({ [StorageKeys.problemset]: problems });
}

export async function readSubmissions(handle: string): Promise<Submission[] | null> {
  const key = StorageKeys.submissions(handle);
  const items = await getLocalStorage().get<Submission[]>(key);
  return items[key] ?? null;
}

export async function writeSubmissions(handle: string, submissions: Submission[]): Promise<void> {
  await getLocalStorage().set({ [StorageKeys.submissions(handle)]: submissions });
}

export async function readUserProfile(handle: string): Promise<CFUserProfile | null> {
  const key = StorageKeys.userProfile(handle);
  const items = await getLocalStorage().get<CFUserProfile>(key);
  return items[key] ?? null;
}

export async function writeUserProfile(handle: string, profile: CFUserProfile): Promise<void> {
  await getLocalStorage().set({ [StorageKeys.userProfile(handle)]: profile });
}

/** Removes a handle's cached submissions and profile — used when the user changes their configured handle. */
export async function clearHandleCache(handle: string): Promise<void> {
  await getLocalStorage().remove([StorageKeys.submissions(handle), StorageKeys.userProfile(handle)]);
}
