export type StreamPlaybackStatus =
  | "IDLE"
  | "CONNECTING"
  | "RESOLVING_METADATA"
  | "PROBING_CONTAINER"
  | "INITIALIZING_MSE"
  | "BUFFERING"
  | "PLAYING"
  | "PAUSED"
  | "SEEKING"
  | "STALLED"
  | "UNSUPPORTED"
  | "ERROR";

export interface StreamTelemetry {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  codec: string;
  status: StreamPlaybackStatus;
  statusMessage?: string;

  // Real-time playback telemetry
  currentTime: number;
  duration: number;
  bufferedAheadSeconds: number;
  bufferedRanges: { start: number; end: number }[];

  // Network & Transport telemetry
  activeMtprotoRequests: number;
  instantaneousBytesPerSec: number;
  averageBytesPerSec: number;
  totalBytesDownloaded: number;
  lastChunkLatencyMs: number;
  currentDcId: number;

  // Media & Demux telemetry
  isFragmented: boolean;
  totalSegmentsAppended: number;
  rebufferCount: number;
  lastAppendDurationMs: number;
  sourceBufferQuotaError: boolean;

  // Diagnostic error
  error?: string | null;
}

export type TelemetryCallback = (telemetry: StreamTelemetry) => void;
