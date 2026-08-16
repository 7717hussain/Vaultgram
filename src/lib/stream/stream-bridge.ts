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
        if (!client) {
          port.postMessage({ error: "Telegram MTProto client is not available" });
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
              end = Math.min(fileSize - 1, start + 2 * 1024 * 1024 - 1);
            }
          }
        } else {
          end = Math.min(fileSize - 1, 2 * 1024 * 1024 - 1);
        }

        const requestLength = end - start + 1;

        // Perform fetch with transparent retry on network jitter
        let payload: Uint8Array | null = null;
        let lastErr: any = null;

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            payload = await reader.readRange(start, requestLength);
            break;
          } catch (err: any) {
            lastErr = err;
            console.warn(`[StreamBridge] Range fetch attempt ${attempt + 1}/3 failed for ${file.name}:`, err?.message || err);
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        }

        if (!payload) {
          throw lastErr || new Error("Failed to fetch range after 3 attempts");
        }

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
