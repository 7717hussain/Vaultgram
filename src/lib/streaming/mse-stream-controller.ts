import { TelegramClient } from "telegram";
import { DriveFile } from "../telegram/indexer";
import { TelegramRangeReader } from "../telegram/streaming/telegram-range-reader";
import { Mp4DemuxSegmenter, DemuxerInitResult } from "./mp4-demux-segmenter";
import { StreamTelemetry, TelemetryCallback, StreamPlaybackStatus } from "./telemetry";

export class MseStreamController {
  private file: DriveFile;
  private videoElement: HTMLVideoElement;
  private rangeReader: TelegramRangeReader;
  private demuxer: Mp4DemuxSegmenter;

  private mediaSource: MediaSource | null = null;
  private videoSourceBuffer: SourceBuffer | null = null;
  private audioSourceBuffer: SourceBuffer | null = null;
  private mediaSourceUrl: string | null = null;

  private videoTrackId: number | null = null;
  private audioTrackId: number | null = null;

  private status: StreamPlaybackStatus = "IDLE";
  private statusMessage = "";
  private mimeCodec = "video/mp4";
  private duration = 0;

  private videoAppendQueue: ArrayBuffer[] = [];
  private audioAppendQueue: ArrayBuffer[] = [];
  private isVideoAppending = false;
  private isAudioAppending = false;
  private isDestroyed = false;

  private bufferLoopTimer: ReturnType<typeof setTimeout> | null = null;
  private telemetryCallback?: TelemetryCallback;

  // Stream Metrics
  private totalSegmentsAppended = 0;
  private rebufferCount = 0;
  private lastAppendDurationMs = 0;
  private isFragmented = false;

  constructor(
    client: TelegramClient,
    file: DriveFile,
    videoElement: HTMLVideoElement,
    onTelemetry?: TelemetryCallback
  ) {
    this.file = file;
    this.videoElement = videoElement;
    this.telemetryCallback = onTelemetry;

    this.rangeReader = new TelegramRangeReader(client, file, undefined, (_stats) => {
      this.emitTelemetry();
    });

    this.demuxer = new Mp4DemuxSegmenter(this.rangeReader);
    this.setupDemuxerCallbacks();
    this.setupVideoListeners();
  }

  private setStatus(status: StreamPlaybackStatus, message = "") {
    this.status = status;
    this.statusMessage = message;
    this.emitTelemetry();
  }

  private setupDemuxerCallbacks() {
    this.demuxer.onSegment((segment) => {
      if (this.isDestroyed) return;

      if (segment.trackId === this.videoTrackId) {
        this.queueVideoBuffer(segment.buffer);
      } else if (segment.trackId === this.audioTrackId) {
        this.queueAudioBuffer(segment.buffer);
      }
    });
  }

  private setupVideoListeners() {
    this.videoElement.addEventListener("waiting", this.handleWaiting);
    this.videoElement.addEventListener("playing", this.handlePlaying);
    this.videoElement.addEventListener("timeupdate", this.handleTimeUpdate);
    this.videoElement.addEventListener("seeking", this.handleSeeking);
    this.videoElement.addEventListener("seeked", this.handleSeeked);
  }

  private handleWaiting = () => {
    if (this.status !== "SEEKING") {
      this.rebufferCount++;
      this.setStatus("BUFFERING", "Buffering stream...");
    }
  };

  private handlePlaying = () => {
    this.setStatus("PLAYING");
  };

  private handleTimeUpdate = () => {
    this.emitTelemetry();
  };

  private handleSeeking = () => {
    this.setStatus("SEEKING", "Seeking keyframe...");
  };

  private handleSeeked = () => {
    this.setStatus("PLAYING");
  };

  /**
   * Initializes the pure-browser MSE stream pipeline.
   */
  public async init(): Promise<void> {
    if (this.isDestroyed) return;

    this.setStatus("CONNECTING", "Connecting to Telegram MTProto...");

    try {
      this.setStatus("PROBING_CONTAINER", "Inspecting MP4 container metadata...");
      const demuxMeta = await this.demuxer.probeAndInit();

      this.duration = demuxMeta.duration;
      this.isFragmented = demuxMeta.isFragmented;

      if (demuxMeta.videoTrack) {
        this.videoTrackId = demuxMeta.videoTrack.id;
        this.mimeCodec = demuxMeta.videoTrack.mime;
      }
      if (demuxMeta.audioTrack) {
        this.audioTrackId = demuxMeta.audioTrack.id;
      }

      this.setStatus("INITIALIZING_MSE", "Initializing MediaSource...");
      await this.setupMediaSource(demuxMeta);

      this.setStatus("BUFFERING", "Pre-buffering initial segments...");
      this.startBufferManagementLoop();
    } catch (err: any) {
      console.error("[MseStreamController] Stream initialization failed:", err);
      if (this.status !== "UNSUPPORTED") {
        this.setStatus("ERROR", err?.message || "Failed to initialize stream.");
      }
      throw err;
    }
  }

  /**
   * Creates MediaSource and attaches SourceBuffers for video and audio.
   */
  private setupMediaSource(meta: DemuxerInitResult): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.mediaSource = new MediaSource();
      this.mediaSourceUrl = URL.createObjectURL(this.mediaSource);
      this.videoElement.src = this.mediaSourceUrl;

      const onSourceOpen = () => {
        if (!this.mediaSource || this.mediaSource.readyState !== "open") return;

        try {
          // 1. Setup Video SourceBuffer
          if (meta.videoTrack) {
            let vMime = meta.videoTrack.mime;
            if (!MediaSource.isTypeSupported(vMime)) {
              vMime = 'video/mp4; codecs="avc1.4d401f"';
            }
            if (MediaSource.isTypeSupported(vMime)) {
              this.videoSourceBuffer = this.mediaSource.addSourceBuffer(vMime);
              this.videoSourceBuffer.mode = "segments";

              this.videoSourceBuffer.addEventListener("updateend", () => {
                this.isVideoAppending = false;
                this.processVideoAppendQueue();
              });

              if (meta.videoTrack.initSegment && meta.videoTrack.initSegment.byteLength > 0) {
                this.queueVideoBuffer(meta.videoTrack.initSegment);
              }
            }
          }

          // 2. Setup Audio SourceBuffer
          if (meta.audioTrack) {
            let aMime = meta.audioTrack.mime;
            if (!MediaSource.isTypeSupported(aMime)) {
              aMime = 'audio/mp4; codecs="mp4a.40.2"';
            }
            if (MediaSource.isTypeSupported(aMime)) {
              this.audioSourceBuffer = this.mediaSource.addSourceBuffer(aMime);
              this.audioSourceBuffer.mode = "segments";

              this.audioSourceBuffer.addEventListener("updateend", () => {
                this.isAudioAppending = false;
                this.processAudioAppendQueue();
              });

              if (meta.audioTrack.initSegment && meta.audioTrack.initSegment.byteLength > 0) {
                this.queueAudioBuffer(meta.audioTrack.initSegment);
              }
            }
          }

          if (this.duration > 0 && Number.isFinite(this.duration)) {
            try {
              this.mediaSource.duration = this.duration;
            } catch (_) {}
          }

          resolve();
        } catch (err) {
          reject(err);
        }
      };

      this.mediaSource.addEventListener("sourceopen", onSourceOpen, { once: true });
    });
  }

  private queueVideoBuffer(buffer: ArrayBuffer) {
    if (this.isDestroyed || !buffer || buffer.byteLength === 0) return;
    this.videoAppendQueue.push(buffer);
    this.processVideoAppendQueue();
  }

  private queueAudioBuffer(buffer: ArrayBuffer) {
    if (this.isDestroyed || !buffer || buffer.byteLength === 0) return;
    this.audioAppendQueue.push(buffer);
    this.processAudioAppendQueue();
  }

  private processVideoAppendQueue() {
    if (this.isDestroyed || !this.videoSourceBuffer || this.isVideoAppending) return;
    if (this.videoAppendQueue.length === 0) return;

    if (this.videoSourceBuffer.updating) return;

    const nextBuffer = this.videoAppendQueue.shift();
    if (!nextBuffer) return;

    try {
      this.isVideoAppending = true;
      const start = Date.now();
      this.videoSourceBuffer.appendBuffer(nextBuffer);
      this.lastAppendDurationMs = Date.now() - start;
      this.totalSegmentsAppended++;
      if (this.totalSegmentsAppended === 1) {
        this.videoElement.play().catch(() => {});
      }
      this.emitTelemetry();
    } catch (err: any) {
      this.isVideoAppending = false;
      console.warn("[MseStreamController] Video appendBuffer error:", err);
    }
  }

  private processAudioAppendQueue() {
    if (this.isDestroyed || !this.audioSourceBuffer || this.isAudioAppending) return;
    if (this.audioAppendQueue.length === 0) return;

    if (this.audioSourceBuffer.updating) return;

    const nextBuffer = this.audioAppendQueue.shift();
    if (!nextBuffer) return;

    try {
      this.isAudioAppending = true;
      this.audioSourceBuffer.appendBuffer(nextBuffer);
    } catch (err: any) {
      this.isAudioAppending = false;
      console.warn("[MseStreamController] Audio appendBuffer error:", err);
    }
  }

  /**
   * Continuous forward-buffer scheduler with strict backpressure.
   */
  private async startBufferManagementLoop() {
    if (this.isDestroyed) return;

    const TARGET_FORWARD_BUFFER = 20; // 20s forward buffer target
    const MAX_FORWARD_BUFFER = 35; // 35s maximum buffer

    const currentTime = this.videoElement.currentTime || 0;
    const bufferedAhead = this.getBufferedAheadSeconds(currentTime);

    // If buffer is low, fetch next 512KB media chunk
    if (bufferedAhead < TARGET_FORWARD_BUFFER) {
      try {
        const fetchedBytes = await this.demuxer.fetchNextMediaBytes(512 * 1024);
        if (fetchedBytes === 0 && this.demuxer.getNextByteOffset() >= this.file.size) {
          if (this.mediaSource && this.mediaSource.readyState === "open") {
            try {
              this.mediaSource.endOfStream();
            } catch (_) {}
          }
        }
      } catch (err) {
        console.warn("[MseStreamController] Buffer fetch error:", err);
      }
    }

    const nextDelayMs = bufferedAhead >= MAX_FORWARD_BUFFER ? 800 : bufferedAhead < 5 ? 80 : 250;
    this.bufferLoopTimer = setTimeout(() => {
      this.startBufferManagementLoop();
    }, nextDelayMs);
  }

  private getBufferedAheadSeconds(currentTime: number): number {
    const buffered = this.videoElement.buffered;
    if (!buffered || buffered.length === 0) return 0;

    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) {
        return Math.max(0, buffered.end(i) - currentTime);
      }
    }
    return 0;
  }

  private getBufferedRanges(): { start: number; end: number }[] {
    const ranges: { start: number; end: number }[] = [];
    const buffered = this.videoElement.buffered;
    if (!buffered) return ranges;

    for (let i = 0; i < buffered.length; i++) {
      ranges.push({ start: buffered.start(i), end: buffered.end(i) });
    }
    return ranges;
  }

  /**
   * Random Seeking: cancels active requests, flushes pipeline, and seeks MP4Box.
   */
  public async seek(targetTimeSeconds: number): Promise<void> {
    if (this.isDestroyed) return;

    this.setStatus("SEEKING", `Seeking to ${Math.round(targetTimeSeconds)}s...`);
    this.rangeReader.abortAll();
    this.videoAppendQueue = [];
    this.audioAppendQueue = [];

    if (this.videoSourceBuffer && !this.videoSourceBuffer.updating) {
      try {
        this.videoSourceBuffer.abort();
      } catch (_) {}
    }
    if (this.audioSourceBuffer && !this.audioSourceBuffer.updating) {
      try {
        this.audioSourceBuffer.abort();
      } catch (_) {}
    }

    const seekInfo = this.demuxer.seek(targetTimeSeconds);
    console.log(`[MseStreamController] Seek target: ${targetTimeSeconds}s -> byte offset: ${seekInfo.byteOffset}`);

    this.videoElement.currentTime = targetTimeSeconds;

    try {
      await this.demuxer.fetchNextMediaBytes(512 * 1024);
    } catch (err) {
      console.warn("[MseStreamController] Post-seek initial fetch error:", err);
    }

    this.setStatus("PLAYING");
  }

  private emitTelemetry() {
    if (this.isDestroyed || !this.telemetryCallback) return;

    const currentTime = this.videoElement.currentTime || 0;
    const duration = this.duration || this.videoElement.duration || this.file.size;
    const bufferedAhead = this.getBufferedAheadSeconds(currentTime);
    const bufferedRanges = this.getBufferedRanges();

    const telemetry: StreamTelemetry = {
      fileId: this.file.id,
      fileName: this.file.name,
      fileSize: this.file.size,
      mimeType: this.file.mimeType,
      codec: this.mimeCodec,
      status: this.status,
      statusMessage: this.statusMessage,
      currentTime,
      duration,
      bufferedAheadSeconds: Math.round(bufferedAhead * 10) / 10,
      bufferedRanges,
      activeMtprotoRequests: 0,
      instantaneousBytesPerSec: 0,
      averageBytesPerSec: 0,
      totalBytesDownloaded: 0,
      lastChunkLatencyMs: 0,
      currentDcId: this.rangeReader.getDcId(),
      isFragmented: this.isFragmented,
      totalSegmentsAppended: this.totalSegmentsAppended,
      rebufferCount: this.rebufferCount,
      lastAppendDurationMs: this.lastAppendDurationMs,
      sourceBufferQuotaError: false,
      error: this.status === "ERROR" || this.status === "UNSUPPORTED" ? this.statusMessage : null,
    };

    this.telemetryCallback(telemetry);
  }

  /**
   * Complete teardown and memory cleanup.
   */
  public destroy() {
    this.isDestroyed = true;

    if (this.bufferLoopTimer) {
      clearTimeout(this.bufferLoopTimer);
      this.bufferLoopTimer = null;
    }

    this.rangeReader.destroy();
    this.demuxer.destroy();

    this.videoElement.removeEventListener("waiting", this.handleWaiting);
    this.videoElement.removeEventListener("playing", this.handlePlaying);
    this.videoElement.removeEventListener("timeupdate", this.handleTimeUpdate);
    this.videoElement.removeEventListener("seeking", this.handleSeeking);
    this.videoElement.removeEventListener("seeked", this.handleSeeked);

    this.videoAppendQueue = [];
    this.audioAppendQueue = [];

    if (this.videoSourceBuffer) {
      try {
        this.videoSourceBuffer.abort();
      } catch (_) {}
      this.videoSourceBuffer = null;
    }

    if (this.audioSourceBuffer) {
      try {
        this.audioSourceBuffer.abort();
      } catch (_) {}
      this.audioSourceBuffer = null;
    }

    if (this.mediaSource) {
      if (this.mediaSource.readyState === "open") {
        try {
          this.mediaSource.endOfStream();
        } catch (_) {}
      }
      this.mediaSource = null;
    }

    if (this.mediaSourceUrl) {
      URL.revokeObjectURL(this.mediaSourceUrl);
      this.mediaSourceUrl = null;
    }

    try {
      this.videoElement.removeAttribute("src");
      this.videoElement.load();
    } catch (_) {}

    this.setStatus("IDLE");
  }
}
