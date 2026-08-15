import { tgStreamClient } from "../client";
import { useTransferStore, TransferTask } from "../../stores/transfer-store";
import { useDriveStore } from "../../stores/drive-store";
import { normalizeTelegramMessage } from "../indexer";
import { appendChannelFilesBatchToDb } from "../session";
import { formatSpeed } from "../../utils";

export async function executeUploadTask(task: TransferTask) {
  const store = useTransferStore.getState();
  const file = task.rawFile;

  if (!file || !task.channelId) {
    store.setTaskStatus(task.id, "FAILED", "Missing file or target channel");
    return;
  }

  // Check if already aborted before starting
  if (task.abortController?.signal.aborted) {
    store.setTaskStatus(task.id, "FAILED", "Canceled by user");
    return;
  }

  if (!tgStreamClient.client || !tgStreamClient.isConnected) {
    await tgStreamClient.init();
  }

  store.setTaskStatus(task.id, "ACTIVE");

  const client = tgStreamClient.client;
  let lastBytes = 0;
  let lastTimestamp = Date.now();
  const totalBytes = file.size;

  try {
    // Resolve target channel entity
    let channelEntity: any = null;
    try {
      channelEntity = await client.getEntity(parseInt(task.channelId, 10));
    } catch {
      const dialogs = await client.getDialogs();
      for (const d of dialogs) {
        if (d.entity && String(d.entity.id) === task.channelId) {
          channelEntity = d.entity;
          break;
        }
      }
    }

    if (!channelEntity) {
      throw new Error(`Target channel ${task.channelTitle || task.channelId} could not be resolved.`);
    }

    if (task.abortController?.signal.aborted) {
      store.setTaskStatus(task.id, "FAILED", "Canceled by user");
      return;
    }

    // Set up progress callback with cancellation flag recognized by GramJS
    const progressCallback = (progressFraction: number) => {
      if (task.abortController?.signal.aborted) {
        (progressCallback as any).isCanceled = true;
        throw new Error("USER_CANCELED");
      }

      const now = Date.now();
      const currentBytes = Math.min(totalBytes, Math.round(progressFraction * totalBytes));
      const percentage = Math.min(100, progressFraction * 100);

      const timeDiffSec = (now - lastTimestamp) / 1000;
      if (timeDiffSec >= 0.5 || currentBytes === totalBytes) {
        const bytesDiff = Math.max(0, currentBytes - lastBytes);
        const bytesPerSec = timeDiffSec > 0 ? bytesDiff / timeDiffSec : 0;
        const speedStr = formatSpeed(bytesPerSec);

        const remainingBytes = Math.max(0, totalBytes - currentBytes);
        const remainingSec = bytesPerSec > 0 ? Math.round(remainingBytes / bytesPerSec) : 0;
        const etaStr =
          remainingSec < 60
            ? `${remainingSec}s`
            : `${Math.floor(remainingSec / 60)}m ${remainingSec % 60}s`;

        store.updateTaskProgress(task.id, percentage, currentBytes, speedStr, etaStr);
        lastBytes = currentBytes;
        lastTimestamp = now;
      }
    };

    // GramJS browser upload: pass native browser File directly
    const uploadedHandle = await client.uploadFile({
      file: file,
      workers: 4,
      onProgress: progressCallback,
    });

    if (task.abortController?.signal.aborted) {
      store.setTaskStatus(task.id, "FAILED", "Canceled by user");
      return;
    }

    // Send the uploaded handle as a document to the channel
    const sentMessage = await client.sendFile(channelEntity, {
      file: uploadedHandle,
      caption: "",
      forceDocument: true,
      workers: 1,
    });

    // Normalize into DriveFile and stream directly to local catalog & IndexedDB
    const channelMeta = {
      id: task.channelId,
      title: task.channelTitle || "Uploaded Files",
    };

    const newDriveFile = normalizeTelegramMessage(sentMessage, channelMeta);
    if (newDriveFile) {
      useDriveStore.getState().appendStreamedFiles([newDriveFile]);
      await appendChannelFilesBatchToDb(task.channelId, [newDriveFile]);
    }

    store.setTaskStatus(task.id, "COMPLETED");
  } catch (err: any) {
    if (task.abortController?.signal.aborted || err.message === "USER_CANCELED") {
      store.setTaskStatus(task.id, "FAILED", "Canceled by user");
      return;
    }

    const msg = String(err.message || err);
    if (msg.includes("FLOOD_WAIT_")) {
      const waitSec = parseInt(msg.match(/FLOOD_WAIT_(\d+)/)?.[1] || "10", 10);
      store.setTaskStatus(task.id, "PAUSED", `Rate limited. Retrying in ${waitSec}s`);
      
      let remaining = waitSec;
      const interval = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0 || task.abortController?.signal.aborted) {
          clearInterval(interval);
          if (!task.abortController?.signal.aborted) {
            executeUploadTask(task);
          }
        } else {
          store.setTaskStatus(task.id, "PAUSED", `Rate limited. Retrying in ${remaining}s`);
        }
      }, 1000);
      return;
    }

    console.error("[Uploader] Task failed:", err);
    store.setTaskStatus(task.id, "FAILED", err.message || "Upload failed");
  }
}
