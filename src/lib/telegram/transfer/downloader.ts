import { TelegramClient, Api } from "telegram";
import { tgStreamClient } from "../client";
import { useTransferStore, TransferTask } from "../../stores/transfer-store";
import { DriveFile } from "../indexer";
import { refreshFileLocation } from "../media-refresher";
import { rehydrateFileLocation } from "../utils/rehydrate-media";
import { formatSpeed } from "../../utils";
import { toast } from "sonner";

import bigInt from "big-integer";

/**
 * Downloads a complete file from Telegram MTProto using GramJS's native multi-DC
 * downloadFile engine with auth export/import, cross-DC pooling, and buffer rehydration.
 */
export async function runHardenedDownloader(
  client: TelegramClient,
  file: DriveFile,
  onProgress: (receivedBytes: number, speed: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  if (!client || !client.connected) {
    throw new Error("Telegram MTProto client is not connected");
  }

  let location: Api.TypeInputFileLocation;
  try {
    location = rehydrateFileLocation(file);
  } catch (err) {
    // If location is missing or empty, refresh from Telegram message first
    const refreshed = await refreshFileLocation(client, file);
    location = refreshed.location;
  }

  let lastTime = Date.now();
  let lastLoaded = 0;

  const executeDownload = async (loc: Api.TypeInputFileLocation): Promise<Buffer> => {
    return (await (client.downloadFile as any)(loc, {
      dcId: file.dcId,
      fileSize: bigInt(file.size),
      workers: 4, // Concurrent workers for high-speed download
      progressCallback: (downloaded: any, total: any) => {
        if (signal?.aborted) {
          throw new Error(signal.reason === "PAUSED" ? "TRANSFER_PAUSED" : "TRANSFER_ABORTED");
        }

        const currentLoaded = Number(downloaded);
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000;

        if (timeDiff >= 0.5 || currentLoaded === Number(total)) {
          const speed = timeDiff > 0 ? Math.round((currentLoaded - lastLoaded) / timeDiff) : 0;
          lastLoaded = currentLoaded;
          lastTime = now;
          onProgress(currentLoaded, speed);
        }
      },
    })) as Buffer;
  };

  try {
    const buffer = await executeDownload(location);
    if (!buffer || buffer.length === 0) {
      throw new Error("Received empty payload from Telegram servers");
    }
    const uint8 = new Uint8Array(buffer);
    return new Blob([uint8.buffer as ArrayBuffer], { type: file.mimeType || "application/octet-stream" });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // Auto-refresh expired file reference and retry
    if (
      errMsg.includes("FILE_REFERENCE_EXPIRED") ||
      errMsg.includes("FILE_REFERENCE_EMPTY") ||
      errMsg.includes("FILE_ID_INVALID")
    ) {
      console.warn(`[Downloader] Refreshing expired file reference for "${file.name}"...`);
      const refreshed = await refreshFileLocation(client, file);
      const retryBuffer = await executeDownload(refreshed.location);
      if (!retryBuffer || retryBuffer.length === 0) {
        throw new Error("Received empty payload on retry from Telegram");
      }
      const retryUint8 = new Uint8Array(retryBuffer);
      return new Blob([retryUint8.buffer as ArrayBuffer], { type: file.mimeType || "application/octet-stream" });
    }

    throw err;
  }
}

/**
 * Adapter called by TransferStore to execute a download task.
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

  try {
    const blob = await runHardenedDownloader(
      client,
      file,
      (receivedBytes, speedBytes) => {
        const total = file.size || task.fileSize || 1;
        const progress = Math.min(100, Math.round((receivedBytes / total) * 100));
        const speed = formatSpeed(speedBytes);
        const remainingBytes = Math.max(0, total - receivedBytes);
        const etaSec = speedBytes > 0 ? Math.ceil(remainingBytes / speedBytes) : 0;
        const eta = etaSec > 0 ? `${etaSec}s` : "--";

        store.updateTaskProgress(task.id, progress, receivedBytes, speed, eta);
      },
      task.abortController?.signal
    );

    // Trigger browser file download
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = file.name;
    document.body.appendChild(anchor);

    try {
      anchor.click();
    } finally {
      document.body.removeChild(anchor);
    }

    store.updateTask(task.id, {
      status: "COMPLETED",
      progress: 100,
      bytesTransferred: file.size,
      speed: "0 B/s",
      eta: "0s",
    });
    store.setTaskStatus(task.id, "COMPLETED");

    toast.success(`Download complete: ${file.name}`);

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 15_000);
  } catch (err: unknown) {
    const isPaused =
      task.abortController?.signal.reason === "PAUSED" ||
      (err instanceof Error && err.message === "TRANSFER_PAUSED");

    if (isPaused) {
      store.setTaskStatus(task.id, "PAUSED");
      return;
    }

    const isCanceled =
      task.abortController?.signal.aborted ||
      (err instanceof Error && (err.message === "TRANSFER_ABORTED" || err.message === "USER_CANCELED"));

    if (isCanceled) {
      store.setTaskStatus(task.id, "FAILED", "Canceled by user");
      return;
    }

    const errMsg = err instanceof Error ? err.message : "Download failed";
    console.error(`[Downloader] Download error for ${file.name}:`, err);
    store.setTaskStatus(task.id, "FAILED", errMsg);
    toast.error(`Download failed: ${file.name}`);
  }
}
