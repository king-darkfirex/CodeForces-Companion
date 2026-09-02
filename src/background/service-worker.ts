// See src/storage/chromeStorageAdapter.ts for why this file declares
// `chrome` as `any` instead of depending on @types/chrome.
declare const chrome: any;

import { ensureProblemset, ensureUserData } from "../sync/syncService";

type Message =
  | { type: "SYNC_PROBLEMSET"; force?: boolean }
  | { type: "SYNC_USER"; handle: string; force?: boolean };

async function handleMessage(message: Message) {
  switch (message.type) {
    case "SYNC_PROBLEMSET":
      return ensureProblemset({ force: message.force });
    case "SYNC_USER":
      return ensureUserData(message.handle, { force: message.force });
    default: {
      const exhaustiveCheck: never = message;
      throw new Error(`Unknown message type: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}

chrome.runtime.onMessage.addListener(
  (message: Message, _sender: unknown, sendResponse: (response: unknown) => void) => {
    handleMessage(message)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err: unknown) => {
        const e = err as { name?: string; message?: string };
        sendResponse({ ok: false, error: { name: e?.name ?? "Error", message: e?.message ?? String(err) } });
      });
    return true; // keep the message channel open for the async sendResponse above
  }
);
