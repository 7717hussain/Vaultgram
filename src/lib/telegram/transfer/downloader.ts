import { TelegramClient, Api } from "telegram";
import bigInt from "big-integer";
import { tgStreamClient } from "../client";
import { useTransferStore, TransferTask } from "../../stores/transfer-store";
import { formatBytes } from "../../utils";
import { toast } from "sonner";

// Strictly 4KB-aligned chunk size required by Telegram MTProto GetFile RPC
const CHUNK_SIZE = 512 * 1024; // 524,288 bytes (512 KB, divisible by 4096)
const WORKERS_PER_DOWNLOAD = 2; // Bounded to 2 workers per active file to prevent WebSocket saturation
const CHUNK_TIMEOUT_MS = 35_000; // 35s per-chunk timeout tolerance
const MAX_RETRIES = 4;

export interface DownloadOptions {
  client: TelegramClient;
  taskId: string;
  location: Api.TypeInputFileLocation;
  dcId?: number;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  signal?: AbortSignal;
}

/**
 * In-memory active download session cache to support genuine pause & resume
 * without discarding already downloaded chunks.
 */
interface ActiveDownloadSession {
  chunks: (Uint8Array | null)[];
  downloadedBytes: number;
  totalChunks: number;
  activeDcId?: number;
}

const activeDownloadSessions = new Map<string, ActiveDownloadSession>();

/**
 * Downloads a single file from Telegram MTProto with strict 4KB-aligned requests,
 * in-memory chunk buffer retention for pause/resume, local tail truncation, and adaptive retries.
 */
export async function downloadDriveFile({
  client,
  taskId,
  location,
  dcId,
  fileName,
  fileSize,
  mimeType = "application/octet-stream",
  signal,
}: DownloadOptions): Promise<void> {
  const transferStore = useTransferStore.getState();
  const totalChunks = Math.max(1, Math.ceil(fileSize / CHUNK_SIZE));

  // Retrieve existing session or initialize a fresh chunk buffer
  let session = activeDownloadSessions.get(taskId);
  if (!session || session.totalChunks !== totalChunks) {
    session = {
      chunks: new Array(totalChunks).fill(null),
      downloadedBytes: 0,
      totalChunks,
      activeDcId: dcId,
    };
    activeDownloadSessions.set(taskId, session);
  }

  // Calculate starting downloaded bytes from already populated chunks
  let downloadedBytes = 0;
  for (let i = 0; i < totalChunks; i++) {
    if (session.chunks[i]) {
      downloadedBytes += session.chunks[i]!.byteLength;
    }
  }
  session.downloadedBytes = downloadedBytes;

  let activeDcId = session.activeDcId || dcId;

  // Sliding telemetry tracking
  let lastTime = performance.now();
  let lastBytes = downloadedBytes;

  const fetchChunkWithRetry = async (chunkIndex: number): Promise<Uint8Array> => {
    // If chunk was already downloaded in previous run before pause, return it instantly
    if (session!.chunks[chunkIndex]) {
      return session!.chunks[chunkIndex]!;
    }

    const offset = bigInt(chunkIndex).multiply(CHUNK_SIZE);
    const requestLimit = CHUNK_SIZE; // Always 4KB aligned for MTProto RPC
    const expectedLength = Math.min(CHUNK_SIZE, fileSize - chunkIndex * CHUNK_SIZE);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) {
        throw new Error(signal.reason === "PAUSED" ? "TRANSFER_PAUSED" : "TRANSFER_ABORTED");
      }

      let timeoutTimer: any = null;

      try {
        const fetchPromise = client.invoke(
          new Api.upload.GetFile({
            location,
            offset,
            limit: requestLimit,
            precise: true,
          }),
          activeDcId
        );

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutTimer = setTimeout(() => {
            reject(new Error(`CHUNK_TIMEOUT (Index: ${chunkIndex}, Attempt: ${attempt})`));
          }, CHUNK_TIMEOUT_MS);
        });

        const result: any = await Promise.race([fetchPromise, timeoutPromise]);
        if (timeoutTimer) clearTimeout(timeoutTimer);

        if (signal?.aborted) {
          throw new Error(signal.reason === "PAUSED" ? "TRANSFER_PAUSED" : "TRANSFER_ABORTED");
        }

        if (result && "bytes" in result && result.bytes) {
          const responseBytes = new Uint8Array(result.bytes);
          return responseBytes.byteLength > expectedLength
            ? responseBytes.subarray(0, expectedLength)
            : responseBytes;
        }

        throw new Error(`Unexpected MTProto response type: ${result?.className || typeof result}`);
      } catch (err: unknown) {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (signal?.aborted) {
          throw new Error(signal.reason === "PAUSED" ? "TRANSFER_PAUSED" : "TRANSFER_ABORTED");
        }

        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg === "TRANSFER_PAUSED" || errMsg === "TRANSFER_ABORTED") {
          throw err;
        }

        // Handle FLOOD_WAIT_X
        const floodMatch = errMsg.match(/FLOOD_WAIT_(\d+)/);
        if (floodMatch) {
          const waitSecs = parseInt(floodMatch[1], 10) + 1;
          transferStore.updateTask(taskId, { status: "PAUSED" });
          await new Promise((r) => setTimeout(r, waitSecs * 1000));
          transferStore.updateTask(taskId, { status: "ACTIVE" });
          continue;
        }

        // Handle Cross-DC Migration
        const dcMatch = errMsg.match(/FILE_MIGRATE_(\d+)/);
        if (dcMatch) {
          activeDcId = parseInt(dcMatch[1], 10);
          session!.activeDcId = activeDcId;
          console.log(`[Downloader] File migrated to DC ${activeDcId}. Re-routing requests...`);
          continue;
        }

        // Exponential backoff with random jitter before next attempt
        if (attempt < MAX_RETRIES) {
          const backoff = Math.min(8000, 1000 * Math.pow(2, attempt - 1)) + Math.random() * 500;
          console.warn(
            `[Downloader] Chunk ${chunkIndex} (Attempt ${attempt}/${MAX_RETRIES}) failed: ${errMsg}. Retrying in ${Math.round(backoff)}ms...`
          );
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        throw new Error(`Chunk ${chunkIndex} failed after ${MAX_RETRIES} attempts: ${errMsg}`);
      }
    }

    throw new Error(`Chunk ${chunkIndex} exhausted retries`);
  };

  // Find next unfulfilled chunk cursor
  let cursor = 0;

  const worker = async () => {
    while (cursor < totalChunks) {
      if (signal?.aborted) {
        throw new Error(signal.reason === "PAUSED" ? "TRANSFER_PAUSED" : "TRANSFER_ABORTED");
      }

      // Atomically find next unfulfilled chunk index
      let targetIndex = -1;
      while (cursor < totalChunks) {
        const candidate = cursor++;
        if (session!.chunks[candidate] === null) {
          targetIndex = candidate;
          break;
        }
      }

      if (targetIndex === -1) {
        break; // All chunks fulfilled
      }

      const chunkData = await fetchChunkWithRetry(targetIndex);
      session!.chunks[targetIndex] = chunkData;
      downloadedBytes += chunkData.byteLength;
      session!.downloadedBytes = downloadedBytes;

      // Throttle telemetry updates to UI
      const now = performance.now();
      if (now - lastTime >= 200 || downloadedBytes === fileSize) {
        const deltaSec = (now - lastTime) / 1000;
        const deltaBytes = downloadedBytes - lastBytes;
        const bytesPerSec = deltaSec > 0 ? deltaBytes / deltaSec : 0;
        const speedStr = `${formatBytes(bytesPerSec)}/s`;
        const remaining = Math.max(0, fileSize - downloadedBytes);
        const remainingSec = bytesPerSec > 0 ? Math.round(remaining / bytesPerSec) : 0;
        const etaStr =
          remainingSec < 60
            ? `${remainingSec}s`
            : `${Math.floor(remainingSec / 60)}m ${remainingSec % 60}s`;
        const progress = Math.min(100, (downloadedBytes / fileSize) * 100);

        transferStore.updateTaskProgress(
          taskId,
          progress,
          downloadedBytes,
          speedStr,
          etaStr
        );

        lastTime = now;
        lastBytes = downloadedBytes;
      }
    }
  };

  try {
    const initialProgress = Math.min(100, (downloadedBytes / fileSize) * 100);
    transferStore.updateTask(taskId, {
      status: "ACTIVE",
      progress: initialProgress,
      bytesTransferred: downloadedBytes,
      speed: "0 B/s",
      eta: "--",
    });

    const activeWorkers = Math.min(WORKERS_PER_DOWNLOAD, totalChunks);
    await Promise.all(Array.from({ length: activeWorkers }, () => worker()));

    if (signal?.aborted) {
      throw new Error(signal.reason === "PAUSED" ? "TRANSFER_PAUSED" : "TRANSFER_ABORTED");
    }

    // Validate chunk completeness
    const validParts: ArrayBuffer[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const part = session.chunks[i];
      if (!part) {
        throw new Error(`Missing chunk at index ${i}`);
      }
      validParts.push(part.buffer as ArrayBuffer);
    }

    // Assemble Typed Blob
    const blob = new Blob(validParts, { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);

    // Trigger browser file download
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);

    try {
      anchor.click();
    } finally {
      document.body.removeChild(anchor);
    }

    // Download succeeded - clear in-memory chunk cache
    activeDownloadSessions.delete(taskId);

    transferStore.updateTask(taskId, {
      status: "COMPLETED",
      progress: 100,
      bytesTransferred: fileSize,
      speed: "0 B/s",
      eta: "0s",
    });

    toast.success(`Download complete: ${fileName}`);

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 15_000);
  } catch (error: unknown) {
    const isPaused =
      signal?.reason === "PAUSED" ||
      (error instanceof Error && error.message === "TRANSFER_PAUSED");

    if (isPaused) {
      // Retain session in activeDownloadSessions for instant resumption
      transferStore.updateTask(taskId, {
        status: "PAUSED",
        speed: "0 B/s",
        eta: "--",
      });
      return;
    }

    const isCanceled =
      signal?.aborted ||
      (error instanceof Error && error.message === "TRANSFER_ABORTED");

    if (isCanceled) {
      activeDownloadSessions.delete(taskId);
      transferStore.updateTask(taskId, {
        status: "FAILED",
        error: "Canceled by user",
        speed: "0 B/s",
        eta: "--",
      });
      return;
    }

    const errText = error instanceof Error ? error.message : "Download failed";
    transferStore.updateTask(taskId, {
      status: "FAILED",
      error: errText,
      speed: "0 B/s",
      eta: "--",
    });
    toast.error(`Download failed: ${fileName}`);
    throw error;
  }
}

/**
 * Adapter called by TransferStore to execute a download task
 */
export async function executeDownloadTask(task: TransferTask): Promise<void> {
  const store = useTransferStore.getState();
  const file = task.rawDriveFile;

  if (!file || !file.channelId || !file.messageId) {
    store.setTaskStatus(task.id, "FAILED", "Missing file message reference");
    return;
  }

  if (task.abortController?.signal.aborted) {
    store.setTaskStatus(task.id, "FAILED", "Canceled by user");
    return;
  }

  if (!tgStreamClient.client || !tgStreamClient.isConnected) {
    await tgStreamClient.init();
  }

  const client = tgStreamClient.client;
  if (!client) {
    store.setTaskStatus(task.id, "FAILED", "Telegram client unavailable");
    return;
  }

  // Resolve channel entity
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
    store.setTaskStatus(task.id, "FAILED", `Channel entity ${file.channelTitle || file.channelId} not found.`);
    return;
  }

  // Retrieve message object
  const messages = await client.getMessages(channelEntity, {
    ids: [file.messageId],
  });

  if (!messages || !messages[0] || !messages[0].media) {
    store.setTaskStatus(task.id, "FAILED", "Message or media location not found on Telegram.");
    return;
  }

  const messageObj = messages[0];
  const media = messageObj.media;

  let fileLocation: Api.TypeInputFileLocation | null = null;
  let dcId: number | undefined = undefined;

  if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
    const doc = media.document;
    fileLocation = new Api.InputDocumentFileLocation({
      id: doc.id,
      accessHash: doc.accessHash,
      fileReference: doc.fileReference,
      thumbSize: "",
    });
    dcId = doc.dcId;
  } else if (media instanceof Api.MessageMediaPhoto && media.photo instanceof Api.Photo) {
    const photo = media.photo;
    const sizes = photo.sizes || [];
    const largestSize = sizes[sizes.length - 1];
    fileLocation = new Api.InputPhotoFileLocation({
      id: photo.id,
      accessHash: photo.accessHash,
      fileReference: photo.fileReference,
      thumbSize: (largestSize && "type" in largestSize ? largestSize.type : "w") || "w",
    });
    dcId = photo.dcId;
  }

  if (!fileLocation) {
    store.setTaskStatus(task.id, "FAILED", "Unsupported media type for download.");
    return;
  }

  await downloadDriveFile({
    client,
    taskId: task.id,
    location: fileLocation,
    dcId,
    fileName: file.name,
    fileSize: file.size || task.fileSize,
    mimeType: file.mimeType,
    signal: task.abortController?.signal,
  });
}
