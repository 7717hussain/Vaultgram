import { TelegramClient, Api } from "telegram";
import bigInt from "big-integer";
import { DriveFile } from "../indexer";
import { rehydrateFileLocation } from "../utils/rehydrate-media";
import { refreshFileLocation } from "../media-refresher";

export interface RangeChunk {
  offset: number;
  data: Uint8Array;
}

export interface RangeReaderTelemetry {
  activeRequests: number;
  instantaneousBytesPerSec: number;
  averageBytesPerSec: number;
  totalBytesDownloaded: number;
  lastLatencyMs: number;
  dcId: number;
}

export type RangeReaderTelemetryListener = (stats: RangeReaderTelemetry) => void;

// Telegram MTProto Limits & Alignment Constants
export const ONE_MIB = 1024 * 1024; // 1,048,576 Bytes (1 MiB block boundary)
export const DEFAULT_CHUNK_SIZE = 512 * 1024; // 524,288 Bytes (512 KiB target chunk)
export const ALIGNMENT_1KIB = 1024; // 1,024 Bytes (1 KiB minimum alignment for precise mode)

export interface TelegramSubRequest {
  alignedOffset: number;
  limit: number;
  logicalStartOffset: number;
  logicalLength: number;
  leadingSkip: number;
}

/**
 * Splits an arbitrary logical byte range [offset, offset + length - 1] into
 * one or more strictly legal Telegram upload.getFile requests.
 *
 * Guarantees:
 * 1. offset >= 0 && offset < fileSize
 * 2. offset is 1024-byte (1 KiB) aligned for precise=true
 * 3. limit is 1024-byte (1 KiB) aligned for precise=true
 * 4. limit > 0 && limit <= 1048576 (1 MiB)
 * 5. Math.floor(alignedOffset / 1048576) === Math.floor((alignedOffset + limit - 1) / 1048576)
 *    (The entire request stays strictly within a single 1 MiB block boundary)
 */
export function splitTelegramRange(
  offset: number,
  length: number,
  fileSize: number
): TelegramSubRequest[] {
  const effectiveEnd = Math.min(fileSize - 1, offset + length - 1);
  const totalLengthToFetch = effectiveEnd - offset + 1;
  if (totalLengthToFetch <= 0) return [];

  const requests: TelegramSubRequest[] = [];
  let currentLogicalOffset = offset;

  while (currentLogicalOffset <= effectiveEnd) {
    // 1. Calculate 1 KiB aligned start for MTProto upload.getFile (precise: true)
    const alignedOffset = Math.floor(currentLogicalOffset / ALIGNMENT_1KIB) * ALIGNMENT_1KIB;
    const leadingSkip = currentLogicalOffset - alignedOffset;

    // 2. Determine boundary of current 1 MiB block
    const blockIndex = Math.floor(alignedOffset / ONE_MIB);
    const blockEnd = (blockIndex + 1) * ONE_MIB;
    const remainingInBlock = blockEnd - alignedOffset;

    // 3. Determine how many bytes we want from this block
    const remainingLogical = effectiveEnd - currentLogicalOffset + 1;
    const neededFromBlock = leadingSkip + remainingLogical;

    // 4. Calculate limit: must not exceed DEFAULT_CHUNK_SIZE (512 KiB), remainingInBlock, or ONE_MIB
    const rawLimit = Math.min(DEFAULT_CHUNK_SIZE, remainingInBlock, neededFromBlock);

    // Limit must be 1 KiB aligned (ceiling to cover requested bytes, capped at remainingInBlock)
    let limit = Math.ceil(rawLimit / ALIGNMENT_1KIB) * ALIGNMENT_1KIB;
    limit = Math.min(limit, remainingInBlock, ONE_MIB);

    if (limit <= 0) break;

    // Invariant check: never cross 1 MiB block boundary
    const startBlock = Math.floor(alignedOffset / ONE_MIB);
    const endBlock = Math.floor((alignedOffset + limit - 1) / ONE_MIB);
    if (startBlock !== endBlock) {
      limit = remainingInBlock;
    }

    const availableLogicalBytes = Math.min(remainingLogical, limit - leadingSkip);

    requests.push({
      alignedOffset,
      limit,
      logicalStartOffset: currentLogicalOffset,
      logicalLength: availableLogicalBytes,
      leadingSkip,
    });

    currentLogicalOffset += availableLogicalBytes;
  }

  return requests;
}

export class TelegramRangeReader {
  private client: TelegramClient;
  private file: DriveFile;
  private location: Api.TypeInputFileLocation;
  private dcId: number;
  private fileSize: number;

  private activeRequestsCount = 0;
  private totalBytesDownloaded = 0;
  private speedSamples: { time: number; bytes: number }[] = [];
  private lastLatencyMs = 0;
  private telemetryListener?: RangeReaderTelemetryListener;

  private isDestroyed = false;
  private abortControllers = new Set<AbortController>();
  private activeSenders = new Map<number, any>();

  constructor(
    client: TelegramClient,
    file: DriveFile,
    initialLocation?: Api.TypeInputFileLocation,
    onTelemetry?: RangeReaderTelemetryListener
  ) {
    this.client = client;
    this.file = file;
    this.fileSize = file.size;
    this.dcId = file.dcId || 2;
    this.telemetryListener = onTelemetry;

    try {
      this.location = initialLocation || rehydrateFileLocation(file);
    } catch {
      this.location = new Api.InputDocumentFileLocation({
        id: bigInt(file.id),
        accessHash: bigInt(file.accessHash || "0"),
        fileReference: Buffer.alloc(0),
        thumbSize: "",
      });
    }
  }

  public setTelemetryListener(listener: RangeReaderTelemetryListener) {
    this.telemetryListener = listener;
  }

  public getDcId(): number {
    return this.dcId;
  }

  public getFileSize(): number {
    return this.fileSize;
  }

  private notifyTelemetry(latencyMs = 0, newBytes = 0) {
    if (this.isDestroyed || !this.telemetryListener) return;

    const now = Date.now();
    if (newBytes > 0) {
      this.totalBytesDownloaded += newBytes;
      this.speedSamples.push({ time: now, bytes: newBytes });
      this.lastLatencyMs = latencyMs;
    }

    this.speedSamples = this.speedSamples.filter((s) => now - s.time <= 2000);
    const windowBytes = this.speedSamples.reduce((acc, s) => acc + s.bytes, 0);
    const windowTimeSec = Math.max(0.2, (now - (this.speedSamples[0]?.time || now - 500)) / 1000);
    const instantaneousSpeed = Math.round(windowBytes / windowTimeSec);

    this.telemetryListener({
      activeRequests: this.activeRequestsCount,
      instantaneousBytesPerSec: instantaneousSpeed,
      averageBytesPerSec: instantaneousSpeed,
      totalBytesDownloaded: this.totalBytesDownloaded,
      lastLatencyMs: this.lastLatencyMs,
      dcId: this.dcId,
    });
  }

  /**
   * Retrieves or initializes a pooled MTProto sender for the target media DC.
   */
  private async getSender(): Promise<any> {
    if (this.activeSenders.has(this.dcId)) {
      return this.activeSenders.get(this.dcId);
    }

    const sender = await this.client.getSender(this.dcId);
    this.activeSenders.set(this.dcId, sender);
    return sender;
  }

  /**
   * Refreshes the file reference and sender if a 400 FILE_REFERENCE_EXPIRED error occurs.
   */
  private async refreshLocation(): Promise<void> {
    console.warn(`[TelegramRangeReader] Refreshing expired token for "${this.file.name}"...`);
    const refreshed = await refreshFileLocation(this.client, this.file);
    this.location = refreshed.location;
    if (refreshed.dcId) {
      this.dcId = refreshed.dcId;
    }
    this.activeSenders.clear();
  }

  /**
   * Reads an arbitrary byte range [offset, offset + length - 1] from Telegram MTProto directly in the browser.
   * Decomposes the range into strictly valid 1 MiB-block boundary sub-requests and reassembles in order.
   */
  public async readRange(
    offset: number,
    length: number,
    signal?: AbortSignal
  ): Promise<Uint8Array> {
    if (this.isDestroyed || signal?.aborted) {
      throw new Error("ABORTED");
    }

    const effectiveEnd = Math.min(this.fileSize - 1, offset + length - 1);
    const exactRequestedLength = effectiveEnd - offset + 1;
    if (exactRequestedLength <= 0) {
      return new Uint8Array(0);
    }

    // Split logical range into strictly legal Telegram MTProto sub-requests
    const subRequests = splitTelegramRange(offset, exactRequestedLength, this.fileSize);
    if (subRequests.length === 0) {
      return new Uint8Array(0);
    }

    const resultBuffer = new Uint8Array(exactRequestedLength);
    let bytesWritten = 0;

    const abortController = new AbortController();
    this.abortControllers.add(abortController);

    const onParentAbort = () => abortController.abort();
    if (signal) {
      signal.addEventListener("abort", onParentAbort);
    }

    try {
      this.activeRequestsCount++;
      this.notifyTelemetry();

      for (const sub of subRequests) {
        if (this.isDestroyed || abortController.signal.aborted || signal?.aborted) {
          throw new Error("ABORTED");
        }

        const chunkData = await this.fetchSingleAlignedChunk(
          sub.alignedOffset,
          sub.limit,
          abortController.signal
        );

        if (!chunkData || chunkData.length === 0) {
          break; // Reached EOF
        }

        if (sub.leadingSkip >= chunkData.length) {
          break;
        }

        const usableBytes = chunkData.subarray(sub.leadingSkip);
        const bytesNeeded = exactRequestedLength - bytesWritten;
        const bytesToCopy = Math.min(bytesNeeded, sub.logicalLength, usableBytes.length);

        if (bytesToCopy <= 0) {
          break;
        }

        resultBuffer.set(usableBytes.subarray(0, bytesToCopy), bytesWritten);
        bytesWritten += bytesToCopy;

        if (bytesWritten >= exactRequestedLength) {
          break;
        }
      }

      return resultBuffer.subarray(0, bytesWritten);
    } finally {
      this.activeRequestsCount = Math.max(0, this.activeRequestsCount - 1);
      this.abortControllers.delete(abortController);
      if (signal) {
        signal.removeEventListener("abort", onParentAbort);
      }
      this.notifyTelemetry();
    }
  }

  /**
   * Fetches a single aligned chunk that strictly obeys Telegram 1 MiB boundary constraints.
   */
  private async fetchSingleAlignedChunk(
    alignedOffset: number,
    limit: number,
    signal: AbortSignal,
    retryCount = 0
  ): Promise<Uint8Array> {
    if (this.isDestroyed || signal.aborted) {
      throw new Error("ABORTED");
    }

    const startTime = Date.now();

    // Pre-flight Telegram protocol validation logging
    const crosses1MiBBoundary =
      Math.floor(alignedOffset / ONE_MIB) !== Math.floor((alignedOffset + limit - 1) / ONE_MIB);

    console.log(`[TelegramRangeReader] GET_FILE_VALIDATE`, {
      offset: alignedOffset,
      limit: limit,
      precise: true,
      offsetMod1024: alignedOffset % 1024,
      limitMod1024: limit % 1024,
      blockIndex: Math.floor(alignedOffset / ONE_MIB),
      blockOffset: alignedOffset % ONE_MIB,
      remainingIn1MiBBlock: ONE_MIB - (alignedOffset % ONE_MIB),
      crosses1MiBBoundary,
    });

    if (crosses1MiBBoundary) {
      console.error(`[TelegramRangeReader] FATAL PROTOCOL VIOLATION: Chunk crosses 1 MiB block boundary!`, {
        offset: alignedOffset,
        limit,
      });
      throw new Error(`ILLEGAL_TELEGRAM_CHUNK_BOUNDARY: offset ${alignedOffset}, limit ${limit}`);
    }

    try {
      const sender = await this.getSender();
      const request = new Api.upload.GetFile({
        location: this.location,
        offset: bigInt(alignedOffset),
        limit: limit,
        precise: true,
      });

      const response: any = await this.client.invokeWithSender(request, sender);
      const latency = Date.now() - startTime;

      let bytes: Uint8Array;
      if (response && response.bytes) {
        bytes = response.bytes instanceof Uint8Array ? response.bytes : new Uint8Array(response.bytes);
      } else {
        bytes = new Uint8Array(0);
      }

      this.notifyTelemetry(latency, bytes.length);
      return bytes;
    } catch (err: any) {
      const errMsg = String(err?.message || err);

      if (signal.aborted || this.isDestroyed) {
        throw new Error("ABORTED");
      }

      // Handle Telegram Token Expiration
      if (
        (errMsg.includes("FILE_REFERENCE_EXPIRED") || errMsg.includes("FILE_REFERENCE_EMPTY")) &&
        retryCount < 2
      ) {
        await this.refreshLocation();
        return this.fetchSingleAlignedChunk(alignedOffset, limit, signal, retryCount + 1);
      }

      // Handle Flood Wait
      if (errMsg.includes("FLOOD_WAIT_") || errMsg.includes("FLOOD_WAIT")) {
        const seconds = parseInt(errMsg.replace(/\D/g, "") || "5", 10);
        console.warn(`[TelegramRangeReader] FLOOD_WAIT_${seconds} on chunk offset ${alignedOffset}. Cooldown...`);
        await new Promise((resolve) => setTimeout(resolve, (seconds + 1) * 1000));
        if (signal.aborted || this.isDestroyed) throw new Error("ABORTED");
        return this.fetchSingleAlignedChunk(alignedOffset, limit, signal, retryCount + 1);
      }

      // Handle Connection drops / Transport retries
      if ((errMsg.includes("Not connected") || errMsg.includes("TIMEOUT") || errMsg.includes("RPC_CALL_FAIL")) && retryCount < 3) {
        console.warn(`[TelegramRangeReader] Transient error (${errMsg}). Retrying in 500ms...`);
        this.activeSenders.delete(this.dcId);
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (signal.aborted || this.isDestroyed) throw new Error("ABORTED");
        return this.fetchSingleAlignedChunk(alignedOffset, limit, signal, retryCount + 1);
      }

      console.error(`[TelegramRangeReader] Fatal chunk fetch error at ${alignedOffset} (limit ${limit}):`, err);
      throw err;
    }
  }

  /**
   * Aborts all active in-flight MTProto range requests.
   */
  public abortAll() {
    for (const controller of this.abortControllers) {
      try {
        controller.abort();
      } catch {}
    }
    this.abortControllers.clear();
    this.activeRequestsCount = 0;
    this.notifyTelemetry();
  }

  /**
   * Cleans up resources.
   */
  public destroy() {
    this.isDestroyed = true;
    this.abortAll();
    this.activeSenders.clear();
  }
}
