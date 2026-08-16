import { TelegramClient } from "telegram";
import { useDriveStore } from "@/lib/stores/drive-store";
import { TelegramRangeReader } from "@/lib/telegram/streaming/telegram-range-reader";

const readerCache = new Map<string, TelegramRangeReader>();

export function initStreamBridge(getClient: () => TelegramClient | null) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("[StreamBridge] ServiceWorker registered with scope:", reg.scope);
      })
      .catch((err) => {
        console.warn("[StreamBridge] ServiceWorker registration deferred:", err);
      });

    navigator.serviceWorker.addEventListener("message", async (event) => {
      if (event.data?.type !== "VAULTGRAM_STREAM_REQUEST") return;

      const { fileId, range } = event.data;
      const port: MessagePort = event.ports[0];
      if (!port) return;

      try {
        const client = getClient();
        if (!client || !client.connected) {
          port.postMessage({ error: "Telegram MTProto client is not connected" });
          return;
        }

        const file = useDriveStore.getState().files.find((f) => f.id === fileId);
        if (!file) {
          port.postMessage({ error: `File with ID ${fileId} not found in catalog` });
          return;
        }

        let reader = readerCache.get(file.id);
        if (!reader) {
          reader = new TelegramRangeReader(client, file);
          readerCache.set(file.id, reader);
        }

        const fileSize = file.size;
        let start = 0;
        let end = fileSize - 1;

        if (range) {
          const matches = range.match(/bytes=(\d+)-(\d+)?/);
          if (matches) {
            start = parseInt(matches[1], 10);
            if (matches[2]) {
              end = Math.min(fileSize - 1, parseInt(matches[2], 10));
            } else {
              end = Math.min(fileSize - 1, start + 1.5 * 1024 * 1024 - 1);
            }
          }
        } else {
          end = Math.min(fileSize - 1, 1.5 * 1024 * 1024 - 1);
        }

        const requestLength = end - start + 1;
        const payload = await reader.readRange(start, requestLength);

        port.postMessage(
          {
            status: range ? 206 : 200,
            headers: {
              "Content-Range": `bytes ${start}-${start + payload.byteLength - 1}/${fileSize}`,
              "Content-Length": String(payload.byteLength),
              "Content-Type": file.mimeType || "video/mp4",
              "Accept-Ranges": "bytes",
              "Cache-Control": "no-cache",
            },
            body: payload.buffer,
          },
          [payload.buffer]
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[StreamBridge] Error streaming range:", msg);
        port.postMessage({ error: msg });
      }
    });
  } catch (bridgeErr) {
    console.error("[StreamBridge] Failed to initialize stream bridge safely:", bridgeErr);
  }
}
