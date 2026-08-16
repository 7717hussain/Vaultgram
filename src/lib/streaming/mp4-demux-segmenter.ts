import { createFile } from "mp4box";
import { TelegramRangeReader } from "../telegram/streaming/telegram-range-reader";

export interface TrackMeta {
  id: number;
  codec: string;
  mime: string;
  initSegment: ArrayBuffer;
  duration: number;
  timescale: number;
}

export interface DemuxerInitResult {
  duration: number;
  videoTrack?: TrackMeta;
  audioTrack?: TrackMeta;
  isFragmented: boolean;
}

export interface SegmentPayload {
  trackId: number;
  buffer: ArrayBuffer;
  sampleNum: number;
  isLast: boolean;
}

export type SegmentCallback = (segment: SegmentPayload) => void;

export interface MP4ArrayBuffer extends ArrayBuffer {
  fileStart: number;
}

export class Mp4DemuxSegmenter {
  private mp4boxfile: any;
  private rangeReader: TelegramRangeReader;
  private fileSize: number;
  private isDestroyed = false;

  private onSegmentCallback?: SegmentCallback;
  private isReady = false;
  private readyPromise: Promise<DemuxerInitResult>;
  private readyResolve!: (res: DemuxerInitResult) => void;
  private readyReject!: (err: Error) => void;

  private nextByteOffset = 0;

  constructor(rangeReader: TelegramRangeReader) {
    this.rangeReader = rangeReader;
    this.fileSize = rangeReader.getFileSize();

    this.readyPromise = new Promise<DemuxerInitResult>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    this.mp4boxfile = createFile(false);
    this.setupMp4BoxCallbacks();
  }

  public onSegment(callback: SegmentCallback) {
    this.onSegmentCallback = callback;
  }

  private setupMp4BoxCallbacks() {
    this.mp4boxfile.onError = (err: any) => {
      console.error("[Mp4DemuxSegmenter] MP4Box error:", err);
      if (!this.isReady) {
        this.readyReject(new Error(typeof err === "string" ? err : err?.message || "MP4Box parsing error"));
      }
    };

    this.mp4boxfile.onReady = (info: any) => {
      console.log("[Mp4DemuxSegmenter] MP4 Header parsed successfully:", info);
      this.isReady = true;

      const duration = (info.duration || 0) / (info.timescale || 1);

      let videoMeta: TrackMeta | undefined;
      let audioMeta: TrackMeta | undefined;

      // Configure on-the-fly segmentation per track
      if (info.tracks && Array.isArray(info.tracks)) {
        for (const track of info.tracks) {
          this.mp4boxfile.setSegmentOptions(track.id, null, {
            nbSamples: 50, // ~1-2s chunk size for smooth buffering and backpressure
            rapAlignement: true,
          });
        }
      }

      // Generate initialization segments
      const initSegments = this.mp4boxfile.initializeSegmentation();

      if (info.videoTracks && info.videoTracks.length > 0) {
        const vTrack = info.videoTracks[0];
        const vInit = initSegments.find((s: any) => s.id === vTrack.id)?.buffer || new ArrayBuffer(0);
        videoMeta = {
          id: vTrack.id,
          codec: vTrack.codec,
          mime: `video/mp4; codecs="${vTrack.codec}"`,
          initSegment: vInit,
          duration: vTrack.duration / vTrack.timescale,
          timescale: vTrack.timescale,
        };
      }

      if (info.audioTracks && info.audioTracks.length > 0) {
        const aTrack = info.audioTracks[0];
        const aInit = initSegments.find((s: any) => s.id === aTrack.id)?.buffer || new ArrayBuffer(0);
        audioMeta = {
          id: aTrack.id,
          codec: aTrack.codec,
          mime: `audio/mp4; codecs="${aTrack.codec}"`,
          initSegment: aInit,
          duration: aTrack.duration / aTrack.timescale,
          timescale: aTrack.timescale,
        };
      }

      this.mp4boxfile.start();

      this.readyResolve({
        duration,
        videoTrack: videoMeta,
        audioTrack: audioMeta,
        isFragmented: !!info.isFragmented,
      });
    };

    this.mp4boxfile.onSegment = (trackId: number, _user: any, buffer: ArrayBuffer, sampleNum: number, is_last: boolean) => {
      if (this.isDestroyed || !this.onSegmentCallback) return;
      this.onSegmentCallback({
        trackId,
        buffer,
        sampleNum,
        isLast: is_last,
      });
    };
  }

  /**
   * Appends byte buffer with fileStart metadata into MP4Box parser.
   */
  private appendData(offset: number, data: Uint8Array): number {
    if (this.isDestroyed || !data || data.length === 0) return offset;

    const buffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    ) as MP4ArrayBuffer;
    buffer.fileStart = offset;

    return this.mp4boxfile.appendBuffer(buffer);
  }

  /**
   * Discovers and parses the MP4 'moov' atom by probing head and jumping to nextParsePosition.
   */
  public async probeAndInit(signal?: AbortSignal): Promise<DemuxerInitResult> {
    const PROBE_CHUNK_SIZE = 512 * 1024; // 512 KB chunk

    // 1. Fetch initial head chunk (0 to 512KB)
    let currentOffset = 0;
    const firstChunk = await this.rangeReader.readRange(0, Math.min(this.fileSize, PROBE_CHUNK_SIZE), signal);
    this.appendData(0, firstChunk);
    currentOffset = firstChunk.length;

    // 2. Iteratively follow MP4Box box boundaries to locate moov atom
    let iterations = 0;
    while (!this.isReady && iterations < 30 && currentOffset < this.fileSize) {
      iterations++;

      let targetOffset = currentOffset;
      if (this.mp4boxfile.nextParsePosition && this.mp4boxfile.nextParsePosition > currentOffset) {
        targetOffset = this.mp4boxfile.nextParsePosition;
        console.log(`[Mp4DemuxSegmenter] Jumping directly to next box offset: ${targetOffset}`);
      } else if (currentOffset < PROBE_CHUNK_SIZE * 4) {
        targetOffset = currentOffset;
      } else {
        targetOffset = Math.max(currentOffset, this.fileSize - (2 * 1024 * 1024));
      }

      if (targetOffset >= this.fileSize) break;

      const chunkLength = Math.min(PROBE_CHUNK_SIZE, this.fileSize - targetOffset);
      const chunk = await this.rangeReader.readRange(targetOffset, chunkLength, signal);
      if (!chunk || chunk.length === 0) break;

      this.appendData(targetOffset, chunk);
      currentOffset = targetOffset + chunk.length;

      // Allow microtask tick for onReady callback
      await new Promise((r) => setTimeout(r, 15));
    }

    return await this.readyPromise;
  }

  /**
   * Pulls next sequential range of media bytes and feeds them to the demuxer.
   */
  public async fetchNextMediaBytes(
    chunkSize = 512 * 1024,
    signal?: AbortSignal
  ): Promise<number> {
    if (this.isDestroyed || signal?.aborted) return 0;
    if (this.nextByteOffset >= this.fileSize) return 0;

    const bytesToFetch = Math.min(chunkSize, this.fileSize - this.nextByteOffset);
    const data = await this.rangeReader.readRange(this.nextByteOffset, bytesToFetch, signal);
    if (!data || data.length === 0) return 0;

    const offsetFetched = this.nextByteOffset;
    this.nextByteOffset = this.appendData(offsetFetched, data);
    return data.length;
  }

  /**
   * Seeks to a specific timestamp in seconds using MP4Box sync sample index.
   */
  public seek(timeInSeconds: number): { byteOffset: number; seekTime: number } {
    if (!this.isReady) {
      return { byteOffset: 0, seekTime: 0 };
    }

    try {
      this.mp4boxfile.flush();
      const seekInfo = this.mp4boxfile.seek(timeInSeconds, true);
      this.nextByteOffset = seekInfo.offset;
      return {
        byteOffset: seekInfo.offset,
        seekTime: seekInfo.time,
      };
    } catch (err) {
      console.warn("[Mp4DemuxSegmenter] Seek calculation failed, fallback to proportional offset:", err);
      const ratio = Math.max(0, Math.min(1, timeInSeconds / 100));
      const roughOffset = Math.floor((this.fileSize * ratio) / 4096) * 4096;
      this.nextByteOffset = roughOffset;
      return { byteOffset: roughOffset, seekTime: timeInSeconds };
    }
  }

  public getNextByteOffset(): number {
    return this.nextByteOffset;
  }

  public setNextByteOffset(offset: number) {
    this.nextByteOffset = Math.max(0, Math.min(this.fileSize, offset));
  }

  public destroy() {
    this.isDestroyed = true;
    try {
      this.mp4boxfile.flush();
    } catch {}
  }
}
