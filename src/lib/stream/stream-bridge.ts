import { Api, TelegramClient } from "telegram";
import bigInt from "big-integer";
import { useDriveStore } from "@/lib/stores/drive-store";
import { DriveFile } from "@/lib/telegram/indexer";

const CHUNK_SIZE = 512 * 1024; // 524,288 bytes (strictly 4KB aligned for MTProto)

// Cache resolved media locations and DC IDs per fileId to avoid repeated getMessages RPCs
interface ResolvedMediaMeta {
  location: Api.TypeInputFileLocation;
  dcId?: number;
  fileSize: number;
  mimeType: string;
}

const mediaMetaCache = new Map<string, Promise<ResolvedMediaMeta | null>>();

async function resolveMediaMeta(
  client: TelegramClient,
  file: DriveFile
): Promise<ResolvedMediaMeta | null> {
  const cachedPromise = mediaMetaCache.get(file.id);
  if (cachedPromise) return cachedPromise;

  const promise = (async () => {
    try {
      // 1. Resolve channel entity
      let channelEntity: any = null;
      try {
        channelEntity = await client.getEntity(parseInt(file.channelId, 10));
      } catch {
        const dialogs = await client.getDialogs();
        for (const d of dialogs) {
          if (d.entity && String(d.entity.id) === file.channelId) {
            channelEntity = d.entity;
            break;
          }
        }
      }

      if (!channelEntity) {
        console.error(`[StreamBridge] Channel ${file.channelId} not found`);
        return null;
      }

      // 2. Fetch Telegram message object
      const messages = await client.getMessages(channelEntity, {
        ids: [file.messageId],
      });

      if (!messages || !messages[0] || !messages[0].media) {
        console.error(`[StreamBridge] Message/media ${file.messageId} not found`);
        return null;
      }

      const media = messages[0].media;
      let location: Api.TypeInputFileLocation | null = null;
      let dcId: number | undefined = undefined;
      let size = file.size;
      let mimeType = file.mimeType || "video/mp4";

      if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
        const doc = media.document;
        location = new Api.InputDocumentFileLocation({
          id: doc.id,
          accessHash: doc.accessHash,
          fileReference: doc.fileReference,
          thumbSize: "",
        });
        dcId = doc.dcId;
        size = Number(doc.size || size);
        mimeType = doc.mimeType || mimeType;
      } else if (media instanceof Api.MessageMediaPhoto && media.photo instanceof Api.Photo) {
        const photo = media.photo;
        const sizes = photo.sizes || [];
        const largestSize = sizes[sizes.length - 1];
        location = new Api.InputPhotoFileLocation({
          id: photo.id,
          accessHash: photo.accessHash,
          fileReference: photo.fileReference,
          thumbSize: (largestSize && "type" in largestSize ? largestSize.type : "w") || "w",
        });
        dcId = photo.dcId;
      }

      if (!location) return null;

      return {
        location,
        dcId,
        fileSize: size,
        mimeType,
      };
    } catch (err) {
      console.error("[StreamBridge] Error resolving media metadata:", err);
      return null;
    }
  })();

  mediaMetaCache.set(file.id, promise);
  return promise;
}

export function initStreamBridge(getClient: () => TelegramClient | null) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    // Register Service Worker
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

    const meta = await resolveMediaMeta(client, file);
    if (!meta) {
      port.postMessage({ error: `Failed to resolve MTProto location for file ${fileId}` });
      return;
    }

    const fileSize = meta.fileSize;
    let start = 0;
    let end = fileSize - 1;

    if (range) {
      const matches = range.match(/bytes=(\d+)-(\d+)?/);
      if (matches) {
        start = parseInt(matches[1], 10);
        if (matches[2]) {
          end = Math.min(fileSize - 1, parseInt(matches[2], 10));
        } else {
          // Default range slice: 1.5 MB per buffer request
          end = Math.min(fileSize - 1, start + 1.5 * 1024 * 1024 - 1);
        }
      }
    } else {
      // If browser did not send Range header, buffer initial 1.5 MB
      end = Math.min(fileSize - 1, 1.5 * 1024 * 1024 - 1);
    }

      const startChunk = Math.floor(start / CHUNK_SIZE);
      const endChunk = Math.floor(end / CHUNK_SIZE);
      const chunksToFetch: Uint8Array[] = [];

      for (let c = startChunk; c <= endChunk; c++) {
        const offset = bigInt(c).multiply(CHUNK_SIZE);
        const res = await client.invoke(
          new Api.upload.GetFile({
            location: meta.location,
            offset,
            limit: CHUNK_SIZE,
            precise: true,
          }),
          meta.dcId
        );

        if (res && "bytes" in res && res.bytes) {
          chunksToFetch.push(new Uint8Array(res.bytes));
        }
      }

      // Combine fetched chunks
      const totalCombinedLength = chunksToFetch.reduce((acc, curr) => acc + curr.byteLength, 0);
      const combined = new Uint8Array(totalCombinedLength);
      let offsetTracker = 0;
      for (const ch of chunksToFetch) {
        combined.set(ch, offsetTracker);
        offsetTracker += ch.byteLength;
      }

      // Slice the exact requested byte window
      const baseOffset = startChunk * CHUNK_SIZE;
      const sliceStart = Math.max(0, start - baseOffset);
      const sliceEnd = Math.min(sliceStart + (end - start + 1), combined.byteLength);
      const payload = combined.slice(sliceStart, sliceEnd);

      port.postMessage(
        {
          status: 206,
          headers: {
            "Content-Range": `bytes ${start}-${start + payload.byteLength - 1}/${fileSize}`,
            "Content-Length": String(payload.byteLength),
            "Content-Type": meta.mimeType || "video/mp4",
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
