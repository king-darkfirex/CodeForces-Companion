// Minimal ambient declaration so this file (and anything that imports it)
// type-checks without needing the @types/chrome package. This keeps the
// project's dependency footprint small for now. If you later add
// `@types/chrome`, delete this `declare const` line — the real types will
// take over automatically.
declare const chrome: any;

export interface StorageArea {
  get<T = unknown>(keys: string | string[] | null): Promise<Record<string, T>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

function wrapArea(area: any): StorageArea {
  return {
    get: <T = unknown>(keys: string | string[] | null) =>
      new Promise<Record<string, T>>((resolve, reject) => {
        area.get(keys, (items: Record<string, T>) => {
          const err = chrome.runtime?.lastError;
          if (err) reject(new Error(err.message));
          else resolve(items);
        });
      }),
    set: (items) =>
      new Promise((resolve, reject) => {
        area.set(items, () => {
          const err = chrome.runtime?.lastError;
          if (err) reject(new Error(err.message));
          else resolve();
        });
      }),
    remove: (keys) =>
      new Promise((resolve, reject) => {
        area.remove(keys, () => {
          const err = chrome.runtime?.lastError;
          if (err) reject(new Error(err.message));
          else resolve();
        });
      }),
  };
}

let cached: StorageArea | null = null;

/**
 * Lazily wraps `chrome.storage.local`. The `chrome` global is only touched
 * the first time this is actually *called*, not at module import time — so
 * this module (and anything built on top of it) can be safely imported from
 * a plain Node test runner as long as the function itself isn't invoked
 * there.
 *
 * We use `chrome.storage.local` (not `.sync`) everywhere: `.sync` caps total
 * storage at 100KB and 8KB per item, which a full problemset or a large
 * submission history would blow through immediately. `.local` defaults to
 * ~10MB, which comfortably fits both for the vast majority of users; see
 * README "Known limitations" for the very largest accounts.
 */
export function getLocalStorage(): StorageArea {
  if (!cached) {
    if (typeof chrome === "undefined" || !chrome.storage) {
      throw new Error("chrome.storage is not available in this environment.");
    }
    cached = wrapArea(chrome.storage.local);
  }
  return cached;
}
