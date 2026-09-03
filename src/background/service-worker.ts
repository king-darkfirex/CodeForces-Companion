// See src/storage/chromeStorageAdapter.ts for why this file declares
// `chrome` as `any` instead of depending on @types/chrome.
declare const chrome: any;

import { ensureProblemset, ensureUserData } from "../sync/syncService";
import {
  ExtensionRequest,
  ExtensionResponse,
  SyncProblemsetResponseData,
  SyncUserResponseData,
  serializeStatusMap,
} from "../messaging/protocol";

async function handleMessage(
  message: ExtensionRequest
): Promise<SyncProblemsetResponseData | SyncUserResponseData> {
  switch (message.type) {
    case "SYNC_PROBLEMSET": {
      // {problems, fromCache, syncedAt} is already JSON-safe as-is.
      return ensureProblemset({ force: message.force });
    }
    case "SYNC_USER": {
      const result = await ensureUserData(message.handle, { force: message.force });
      // `result.statusMap` is a real `Map` — see src/messaging/protocol.ts for
      // why it must be converted before it can safely cross sendResponse().
      return {
        profile: result.profile,
        submissions: result.submissions,
        statusMap: serializeStatusMap(result.statusMap),
        fromCache: result.fromCache,
        syncedAt: result.syncedAt,
      };
    }
    default: {
      const exhaustiveCheck: never = message;
      throw new Error(`Unknown message type: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionRequest,
    _sender: unknown,
    sendResponse: (response: ExtensionResponse<SyncProblemsetResponseData | SyncUserResponseData>) => void
  ) => {
    handleMessage(message)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err: unknown) => {
        const e = err as { name?: string; message?: string };
        sendResponse({ ok: false, error: { name: e?.name ?? "Error", message: e?.message ?? String(err) } });
      });
    return true; // keep the message channel open for the async sendResponse above
  }
);
