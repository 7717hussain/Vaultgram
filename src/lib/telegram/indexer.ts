import { tgStreamClient } from "./client";
import {
  ChannelMeta,
  getChannelFilesFromDb,
  appendChannelFilesBatchToDb,
} from "./session";

export type FileCategory = "IMAGE" | "VIDEO" | "DOC" | "ARCHIVE" | "AUDIO" | "OTHER";

export interface DriveFile {
  id: string; // `${channelId}_${messageId}`
  messageId: number;
  channelId: string;
  channelTitle: string;
  name: string;
  size: number; // bytes
  mimeType: string;
  date: number; // unix timestamp
  category: FileCategory;
  rawMessage?: any;
  isPinned?: boolean;
  isFavorite?: boolean;
  streamUrl?: string;
  dcId?: number;
  accessHash?: string | bigint | any;
  fileReference?: any;
  location?: any;
}

export function classifyFileType(fileName: string, mimeType: string, isPhoto = false): FileCategory {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  if (
    isPhoto ||
    mimeType.startsWith("image/") ||
    ["jpg", "jpeg", "png", "webp", "gif", "svg", "bmp", "ico", "heic"].includes(ext)
  ) {
    return "IMAGE";
  }

  if (
    mimeType.startsWith("video/") ||
    ["mp4", "mkv", "webm", "avi", "mov", "flv", "m4v", "ts", "wmv"].includes(ext)
  ) {
    return "VIDEO";
  }

  if (
    mimeType.startsWith("audio/") ||
    ["mp3", "m4a", "wav", "flac", "ogg", "aac", "opus", "wma"].includes(ext)
  ) {
    return "AUDIO";
  }

  if (
    ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso"].includes(ext) ||
    mimeType.includes("zip") ||
    mimeType.includes("compressed") ||
    mimeType.includes("tar") ||
    mimeType.includes("7z")
  ) {
    return "ARCHIVE";
  }

  if (
    ["pdf", "epub", "doc", "docx", "txt", "ppt", "pptx", "xls", "xlsx", "csv", "md"].includes(ext) ||
    mimeType.includes("pdf") ||
    mimeType.includes("document") ||
    mimeType.includes("text")
  ) {
    return "DOC";
  }

  return "OTHER";
}

export function normalizeTelegramMessage(msg: any, channel: ChannelMeta): DriveFile | null {
  if (!msg || !msg.media) return null;

  let doc = null;
  let photo = null;
  let isPhoto = false;

  if (msg.media.document) {
    doc = msg.media.document;
  } else if (msg.media.photo) {
    photo = msg.media.photo;
    isPhoto = true;
  }

  if (!doc && !isPhoto) return null;

  const messageId = msg.id;
  const channelId = String(channel.id);
  let fileName = msg.file?.name || "";
  const mimeType = doc?.mimeType || (isPhoto ? "image/jpeg" : "application/octet-stream");
  const size = Number(doc?.size || 0);

  if (!fileName) {
    const snippet = (msg.message || "").trim().slice(0, 30).replace(/[^\w\s-]/g, "");
    if (snippet) {
      fileName = snippet;
    } else if (isPhoto) {
      fileName = `photo_${messageId}.jpg`;
    } else if (mimeType.includes("video")) {
      fileName = `video_${messageId}.mp4`;
    } else if (mimeType.includes("audio")) {
      fileName = `audio_${messageId}.mp3`;
    } else {
      fileName = `file_${messageId}`;
    }
  }

  const category = classifyFileType(fileName, mimeType, isPhoto);

  let dcId: number | undefined = undefined;
  let accessHash: string | bigint | undefined = undefined;
  let fileReference: any = undefined;
  let location: any = undefined;

  if (doc) {
    dcId = doc.dcId;
    accessHash = doc.accessHash;
    fileReference = doc.fileReference;
    location = {
      id: doc.id,
      accessHash: doc.accessHash,
      fileReference: doc.fileReference,
      thumbSize: "",
    };
  } else if (photo) {
    dcId = photo.dcId;
    accessHash = photo.accessHash;
    fileReference = photo.fileReference;
    const sizes = photo.sizes || [];
    const largestSize = sizes[sizes.length - 1];
    location = {
      id: photo.id,
      accessHash: photo.accessHash,
      fileReference: photo.fileReference,
      thumbSize: (largestSize && "type" in largestSize ? largestSize.type : "x") || "x",
    };
  }

  return {
    id: `${channelId}_${messageId}`,
    messageId,
    channelId,
    channelTitle: channel.title || "Telegram Chat",
    name: fileName,
    size,
    mimeType,
    date: msg.date || Math.floor(Date.now() / 1000),
    category,
    dcId,
    accessHash,
    fileReference,
    location,
    streamUrl: `/stream/${channelId}_${messageId}?size=${size}&mime=${encodeURIComponent(mimeType)}`,
  };
}

export type IndexProgressCallback = (info: {
  channelId: string;
  channelTitle: string;
  totalIndexed: number;
  isComplete: boolean;
  batchCount: number;
}) => void;

export class TelegramMediaIndexer {
  private activeSyncControllers = new Map<string, AbortController>();

  // -------------------------------------------------------------
  // Deep Incremental Pagination (Supports 10,000+ Files per Channel)
  // -------------------------------------------------------------
  async indexChannelDeep(
    channel: ChannelMeta,
    onProgress?: IndexProgressCallback,
    onBatchStream?: (batch: DriveFile[]) => void
  ): Promise<DriveFile[]> {
    const channelId = String(channel.id);

    // Cancel any previous in-flight sync for this channel
    if (this.activeSyncControllers.has(channelId)) {
      this.activeSyncControllers.get(channelId)?.abort();
    }
    const abortController = new AbortController();
    this.activeSyncControllers.set(channelId, abortController);

    if (!tgStreamClient.client || !tgStreamClient.isConnected) {
      await tgStreamClient.init();
    }

    const channelEntity = await this.resolveEntity(channelId);
    const cachedFiles = await getChannelFilesFromDb(channelId);
    
    // Instant preliminary yield of cached files to UI
    if (cachedFiles.length > 0 && onBatchStream) {
      onBatchStream(cachedFiles);
      if (onProgress) {
        onProgress({
          channelId,
          channelTitle: channel.title,
          totalIndexed: cachedFiles.length,
          isComplete: false,
          batchCount: 0,
        });
      }
    }

    // Determine highest message ID in cache for incremental top-sync
    let highestKnownId = 0;
    for (const f of cachedFiles) {
      if (f.messageId > highestKnownId) {
        highestKnownId = f.messageId;
      }
    }

    let allCollectedFiles = [...cachedFiles];
    const map = new Map<string, DriveFile>();
    for (const f of allCollectedFiles) {
      map.set(f.id, f);
    }

    const BATCH_SIZE = 100;

    // 1. First, fetch any NEW messages arrived since last sync (incremental forward sync)
    if (highestKnownId > 0) {
      try {
        const newMsgs = await tgStreamClient.client.getMessages(channelEntity, {
          minId: highestKnownId,
          limit: 100,
        });
        if (newMsgs && newMsgs.length > 0) {
          const newFiles = newMsgs
            .map((m: any) => normalizeTelegramMessage(m, channel))
            .filter(Boolean) as DriveFile[];

          if (newFiles.length > 0) {
            for (const f of newFiles) map.set(f.id, f);
            allCollectedFiles = Array.from(map.values()).sort((a, b) => b.date - a.date);
            await appendChannelFilesBatchToDb(channelId, newFiles);
            if (onBatchStream) onBatchStream(newFiles);
          }
        }
      } catch (err) {
        console.warn(`[Indexer] Forward sync notice for channel ${channelId}:`, err);
      }
    }

    // 2. Deep Pagination Backward Loop (Full History)
    let lastOffsetId = 0;
    // If we have existing cache, continue back from the lowest message id
    if (cachedFiles.length > 0) {
      let lowestId = Infinity;
      for (const f of cachedFiles) {
        if (f.messageId < lowestId) lowestId = f.messageId;
      }
      if (lowestId !== Infinity) {
        lastOffsetId = lowestId;
      }
    }

    let hasMore = true;
    let batchCounter = 0;

    while (hasMore && !abortController.signal.aborted) {
      try {
        batchCounter++;

        // Query Telegram MTProto with dedicated media search
        const batch = await tgStreamClient.client.getMessages(channelEntity, {
          limit: BATCH_SIZE,
          offsetId: lastOffsetId,
        });

        if (!batch || batch.length === 0) {
          hasMore = false;
          break;
        }

        const parsedBatch = batch
          .map((m: any) => normalizeTelegramMessage(m, channel))
          .filter(Boolean) as DriveFile[];

        if (parsedBatch.length > 0) {
          for (const f of parsedBatch) {
            map.set(f.id, f);
          }

          allCollectedFiles = Array.from(map.values()).sort((a, b) => b.date - a.date);

          // Stream to IndexedDB & UI store
          await appendChannelFilesBatchToDb(channelId, parsedBatch);
          if (onBatchStream) {
            onBatchStream(parsedBatch);
          }
        }

        // Update offset
        const oldestMessageInBatch = batch[batch.length - 1];
        lastOffsetId = oldestMessageInBatch.id;

        if (onProgress) {
          onProgress({
            channelId,
            channelTitle: channel.title,
            totalIndexed: allCollectedFiles.length,
            isComplete: false,
            batchCount: batchCounter,
          });
        }

        // Reached the earliest message in the chat
        if (batch.length < BATCH_SIZE) {
          hasMore = false;
          break;
        }

        // Yield CPU cycle to allow fluid 60FPS UI rendering
        await new Promise((r) => setTimeout(r, 60));
      } catch (err: any) {
        const msg = String(err.message || err);
        if (msg.includes("FLOOD_WAIT_")) {
          const waitSec = parseInt(msg.match(/FLOOD_WAIT_(\d+)/)?.[1] || "6", 10);
          console.warn(`[Indexer] Rate limited on ${channel.title}. Pausing for ${waitSec}s...`);
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }

        console.error(`[Indexer] Error during deep sync on ${channel.title}:`, err);
        break;
      }
    }

    if (onProgress) {
      onProgress({
        channelId,
        channelTitle: channel.title,
        totalIndexed: allCollectedFiles.length,
        isComplete: true,
        batchCount: batchCounter,
      });
    }

    this.activeSyncControllers.delete(channelId);
    return allCollectedFiles;
  }

  // Deep index all selected channels concurrently
  async indexAllChannelsDeep(
    channels: ChannelMeta[],
    onGlobalProgress?: (info: { totalCount: number; activeChannelTitle: string; isComplete: boolean }) => void,
    onFileStream?: (newFiles: DriveFile[]) => void
  ): Promise<DriveFile[]> {
    let totalCount = 0;

    for (const channel of channels) {
      if (onGlobalProgress) {
        onGlobalProgress({
          totalCount,
          activeChannelTitle: channel.title,
          isComplete: false,
        });
      }

      await this.indexChannelDeep(
        channel,
        (p) => {
          totalCount += p.batchCount;
          if (onGlobalProgress) {
            onGlobalProgress({
              totalCount: p.totalIndexed,
              activeChannelTitle: channel.title,
              isComplete: false,
            });
          }
        },
        onFileStream
      );
    }

    if (onGlobalProgress) {
      onGlobalProgress({
        totalCount,
        activeChannelTitle: "All Channels",
        isComplete: true,
      });
    }

    // Load final aggregated dataset from DB
    const aggregated: DriveFile[] = [];
    for (const ch of channels) {
      const files = await getChannelFilesFromDb(ch.id);
      aggregated.push(...files);
    }

    const unique = new Map<string, DriveFile>();
    for (const f of aggregated) unique.set(f.id, f);

    return Array.from(unique.values()).sort((a, b) => b.date - a.date);
  }

  private async resolveEntity(channelId: string) {
    if (tgStreamClient.channelEntityCache.has(channelId)) {
      return tgStreamClient.channelEntityCache.get(channelId);
    }
    try {
      const entity = await tgStreamClient.client.getEntity(parseInt(channelId, 10));
      tgStreamClient.channelEntityCache.set(channelId, entity);
      return entity;
    } catch {
      const dialogs = await tgStreamClient.client.getDialogs();
      for (const d of dialogs) {
        if (d.entity && String(d.entity.id) === channelId) {
          tgStreamClient.channelEntityCache.set(channelId, d.entity);
          return d.entity;
        }
      }
      throw new Error(`Channel entity ${channelId} could not be resolved.`);
    }
  }
}

export const telegramMediaIndexer = new TelegramMediaIndexer();
