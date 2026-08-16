import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  X,
  Download,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Check,
  ChevronUp,
  PictureInPicture2,
  Video as VideoIcon,
  Loader2,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { DriveFile } from "@/lib/telegram/indexer";
import { useTransferStore } from "@/lib/stores/transfer-store";
import { useDriveStore } from "@/lib/stores/drive-store";
import { formatBytes, formatDate } from "@/lib/utils";
import { getSavedSession } from "@/lib/telegram/session";
import { tgStreamClient } from "@/lib/telegram/client";
import { rehydrateFileLocation } from "@/lib/telegram/utils/rehydrate-media";
import { refreshFileLocation } from "@/lib/telegram/media-refresher";

interface VideoPlayerModalProps {
  file: DriveFile | null;
  isOpen: boolean;
  onClose: () => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  file,
  isOpen,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const volumeTrackRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enqueueDownload = useTransferStore((state) => state.enqueueDownload);
  const storeFiles = useDriveStore((state) => state.files);
  const activeFile = (file ? storeFiles.find((f) => f.id === file.id) : null) || file;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [sessionString, setSessionString] = useState<string>("");
  const [liveLocation, setLiveLocation] = useState<any>(null);

  // Reset live location when file changes
  useEffect(() => {
    setLiveLocation(null);
  }, [file?.id]);

  // Retrieve active session string for local daemon proxy
  useEffect(() => {
    if (!isOpen) return;
    getSavedSession().then((saved) => {
      const activeSession = saved || (tgStreamClient.client?.session ? (tgStreamClient.client.session as any).save?.() : "") || "";
      setSessionString(activeSession);
    });
  }, [isOpen]);

  // If accessHash or fileReference is missing from initial index, auto-fetch from Telegram
  useEffect(() => {
    if (!isOpen || !activeFile) return;

    let needsRefresh = false;
    try {
      const loc = liveLocation || (rehydrateFileLocation(activeFile) as any);
      if (!loc || !loc.accessHash || loc.accessHash.toString() === "0" || !loc.fileReference || loc.fileReference.length === 0) {
        needsRefresh = true;
      }
    } catch (_) {
      needsRefresh = true;
    }

    if (needsRefresh && tgStreamClient.client) {
      console.log("[VideoPlayer] Auto-refreshing media location from Telegram for:", activeFile.name);
      refreshFileLocation(tgStreamClient.client, activeFile)
        .then((res) => {
          if (res?.location) {
            setLiveLocation(res.location);
          }
        })
        .catch((err) => {
          console.warn("[VideoPlayer] Location refresh failed:", err);
        });
    }
  }, [isOpen, activeFile?.id]);

  // Construct local daemon stream URL
  const getDaemonStreamUrl = useCallback(() => {
    if (!activeFile) return "";

    const activeSession =
      sessionString ||
      localStorage.getItem("vaultgram_session_string") ||
      localStorage.getItem("vaultgram_session") ||
      localStorage.getItem("telegram_session") ||
      (tgStreamClient.client?.session ? (tgStreamClient.client.session as any).save?.() : "") ||
      "";

    if (!activeSession) return "";

    let loc: any = liveLocation;
    if (!loc || !loc.id) {
      try {
        loc = rehydrateFileLocation(activeFile);
      } catch (err) {
        console.error("🚨 [VideoPlayer] Failed to rehydrate file location:", err);
      }
    }

    const fileId = loc?.id ? loc.id.toString() : (activeFile.location?.id || activeFile.id);
    const accessHash = loc?.accessHash ? loc.accessHash.toString() : (activeFile.location?.accessHash || activeFile.accessHash || "");
    const dcId = loc?.dcId || activeFile.dcId || 2;

    const rawFileRef = loc?.fileReference || activeFile.location?.fileReference || activeFile.fileReference;
    let fileRefBase64 = "";

    if (rawFileRef) {
      if (typeof rawFileRef === "string") {
        fileRefBase64 = rawFileRef;
      } else if (typeof Buffer !== "undefined" && Buffer.isBuffer(rawFileRef)) {
        fileRefBase64 = rawFileRef.toString("base64");
      } else if (rawFileRef instanceof Uint8Array || Array.isArray(rawFileRef)) {
        fileRefBase64 = Buffer.from(rawFileRef).toString("base64");
      } else if (typeof rawFileRef === "object") {
        fileRefBase64 = Buffer.from(Object.values(rawFileRef)).toString("base64");
      }
    }

    if (!accessHash || accessHash === "0" || !fileRefBase64) {
      // Hold stream URL until media hashes are confirmed or refreshed
      return "";
    }

    const params = new URLSearchParams({
      session: activeSession,
      dcId: String(dcId),
      id: String(fileId),
      accessHash: String(accessHash),
      fileReference: fileRefBase64,
      size: String(activeFile.size),
      mimeType: activeFile.mimeType || "video/mp4",
      channelId: String(activeFile.channelId || ""),
      msgId: String(activeFile.messageId || (activeFile as any).msgId || ""),
      ...(retryKey ? { r: String(retryKey) } : {}),
    });

    return `http://localhost:4000/stream?${params.toString()}`;
  }, [activeFile, sessionString, retryKey, liveLocation]);

  // Cinema Auto-Hide Controller
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

    if (isPlaying && !isSpeedMenuOpen) {
      hideTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
  }, [isPlaying, isSpeedMenuOpen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Initialize and reset playback states
  useEffect(() => {
    if (!isOpen || !file) {
      setDuration(0);
      setCurrentTime(0);
      setBufferedEnd(0);
      setIsPlaying(false);
      setIsBuffering(false);
      setStreamError(null);
      return;
    }

    setStreamError(null);
    setIsBuffering(true);

    return () => {
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.removeAttribute("src");
          videoRef.current.load();
        } catch (_) {}
      }
    };
  }, [file?.id, isOpen, retryKey]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape" && !document.fullscreenElement) {
        onClose();
      }
      if (e.key === " " || e.key === "k" || e.key === "K") {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      }
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleMute();
      }
      if (e.key === "ArrowRight" || e.key === "l" || e.key === "L") {
        e.preventDefault();
        seekRelative(10);
      }
      if (e.key === "ArrowLeft" || e.key === "j" || e.key === "J") {
        e.preventDefault();
        seekRelative(-10);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isPlaying, isMuted, duration]);

  // Click-outside listener for speed popover
  useEffect(() => {
    const handleClickOutside = () => {
      if (isSpeedMenuOpen) setIsSpeedMenuOpen(false);
    };
    if (isSpeedMenuOpen) {
      window.addEventListener("click", handleClickOutside);
      return () => window.removeEventListener("click", handleClickOutside);
    }
  }, [isSpeedMenuOpen]);

  if (!isOpen || !file) return null;

  const togglePlay = () => {
    if (!videoRef.current || streamError) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      setShowControls(true);
    }
  };

  const seekRelative = (seconds: number) => {
    if (!videoRef.current || duration === 0) return;
    videoRef.current.currentTime = Math.max(
      0,
      Math.min(duration, videoRef.current.currentTime + seconds)
    );
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen error:", err);
    }
  };

  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.warn("PiP error:", err);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!volumeTrackRef.current || !videoRef.current) return;
    const rect = volumeTrackRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoRef.current.volume = pos;
    videoRef.current.muted = pos === 0;
    setVolume(pos);
    setIsMuted(pos === 0);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
    if (videoRef.current.buffered.length > 0) {
      setBufferedEnd(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
    }
  };

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubberRef.current || !videoRef.current || duration === 0) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = pos * duration;
    videoRef.current.currentTime = target;
    setCurrentTime(target);
  };

  const handleScrubberMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubberRef.current || duration === 0) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosition(e.clientX - rect.left);
    setHoverTime(pos * duration);
  };

  const formatTime = (secs: number) => {
    const total = Math.floor(secs || 0);
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(mins).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const setSpeed = (rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
    setIsSpeedMenuOpen(false);
  };

  const handleDownload = () => {
    enqueueDownload(file);
    onClose();
  };

  const retryStream = () => {
    setStreamError(null);
    setIsBuffering(true);
    setRetryKey((k) => k + 1);
  };

  const streamUrl = getDaemonStreamUrl();
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={resetHideTimer}
      onMouseEnter={resetHideTimer}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/95 ${
        isFullscreen ? "w-screen h-screen p-0" : "p-4 backdrop-blur-md"
      } ${!showControls && isPlaying ? "cursor-none" : "cursor-default"}`}
    >
      <div
        className={`relative flex flex-col w-full bg-zinc-950 overflow-hidden ${
          isFullscreen
            ? "h-full w-full rounded-none"
            : "max-w-5xl rounded-md border border-zinc-800/80 shadow-2xl"
        }`}
      >
        {/* Top Header: Floating Left Pill & Right Merged Pill */}
        <div
          className={`absolute top-4 inset-x-4 z-30 flex items-center justify-between pointer-events-none transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* Left Floating Header Pill: Title & Telemetry */}
          <div className="pointer-events-auto bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-sm px-3 py-1.5 flex items-center gap-2.5 max-w-[70%] shadow-xl">
            <VideoIcon className="w-4 h-4 text-zinc-400 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-zinc-100 truncate" title={file.name}>
                {file.name}
              </span>
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400">
                <span>{file.channelTitle}</span>
                <span>•</span>
                <span>{formatBytes(file.size)}</span>
                <span>•</span>
                <span>{formatDate(file.date)}</span>
              </div>
            </div>
          </div>

          {/* Right Floating Header Pill: Merged Download + Close Button */}
          <div className="pointer-events-auto bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-sm p-1 flex items-center gap-1 shadow-xl">
            <button
              onClick={handleDownload}
              className="h-7 px-2.5 text-xs font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-sm text-zinc-200 flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
            <button
              onClick={isFullscreen ? toggleFullscreen : onClose}
              className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-sm transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video Canvas */}
        <div
          className="relative w-full h-full aspect-video bg-black flex items-center justify-center overflow-hidden cursor-pointer"
          onClick={togglePlay}
        >
          {/* YouTube-Style Live Buffering Overlay */}
          {isBuffering && !streamError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-20 gap-2 select-none pointer-events-none">
              <Loader2 className="w-9 h-9 text-zinc-200 animate-spin stroke-[1.5px]" />
              <span className="text-[11px] font-mono text-zinc-300 tracking-wider">
                STREAMING LIVE
              </span>
            </div>
          )}

          {/* Stream Connection Error State */}
          {streamError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-20 gap-3 p-6 text-center select-none">
              <AlertCircle className="w-10 h-10 text-rose-400 stroke-[1.5px]" />
              <span className="text-sm font-semibold text-zinc-200">Stream Connection Interrupted</span>
              <p className="text-xs text-zinc-400 max-w-md font-mono bg-zinc-900/80 p-2.5 rounded-sm border border-zinc-800">
                {streamError}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    retryStream();
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-white rounded-sm flex items-center gap-1.5 transition-colors border border-zinc-700"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry Stream</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload();
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-sm flex items-center gap-1.5 transition-colors border border-zinc-800"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download File</span>
                </button>
              </div>
            </div>
          )}

          <video
            ref={videoRef}
            src={streamUrl || undefined}
            className="w-full h-full object-contain cursor-pointer"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration);
                setIsBuffering(false);
                videoRef.current.play().catch(() => {});
              }
            }}
            onWaiting={() => setIsBuffering(true)}
            onPlaying={() => {
              setIsPlaying(true);
              setIsBuffering(false);
            }}
            onPause={() => setIsPlaying(false)}
            onError={() => {
              const err = videoRef.current?.error;
              console.error("[VideoTag Error]:", {
                code: err?.code,
                message: err?.message,
              });
              setStreamError("Unable to stream chunk from Telegram Daemon.");
              setIsBuffering(false);
            }}
            autoPlay
            playsInline
          />
        </div>

        {/* Bottom Control Layer (Naked Standalone Seekbar + Clustered Control Pods) */}
        <div
          className={`absolute bottom-4 inset-x-4 z-30 flex flex-col gap-3 transition-opacity duration-300 ${
            showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 1. Naked Standalone Seekbar */}
          <div
            ref={scrubberRef}
            onClick={handleScrubberClick}
            onMouseMove={handleScrubberMouseMove}
            onMouseLeave={() => setHoverTime(null)}
            className="group/track relative w-full h-3 flex items-center cursor-pointer select-none px-0.5"
          >
            {/* Hover Tooltip */}
            {hoverTime !== null && (
              <div
                className="absolute -top-7 transform -translate-x-1/2 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700/80 rounded-sm text-[10px] font-mono text-zinc-200 shadow-xl pointer-events-none"
                style={{ left: `${hoverPosition}px` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}

            {/* Scrubber Background Bar */}
            <div className="w-full h-1 group-hover/track:h-1.5 bg-zinc-800/90 rounded-sm overflow-hidden relative transition-all">
              {/* Buffered Progress */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-zinc-700/50 rounded-sm"
                style={{ width: `${bufferedPercent}%` }}
              />
              {/* Playback Progress */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-zinc-100 rounded-sm"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Seekbar Playhead Dot (Thumb) */}
            <div
              className="absolute top-1/2 w-3 h-3 bg-white rounded-full shadow-md transition-transform group-hover/track:scale-125 pointer-events-none"
              style={{ left: `${progressPercent}%`, transform: "translate(-50%, -50%)" }}
            />
          </div>

          {/* 2. Clustered Control Pods (Floating Modular Pills) */}
          <div className="flex items-center justify-between text-zinc-200 select-none">
            {/* Left Pod: Playback & Timestamps */}
            <div className="bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-sm px-2.5 py-1.5 flex items-center gap-3 shadow-xl">
              <button
                type="button"
                onClick={togglePlay}
                className="hover:text-white transition-colors focus:outline-none"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              </button>

              <span className="font-mono text-xs text-zinc-300">
                {formatTime(currentTime)} <span className="text-zinc-500">/</span> {formatTime(duration)}
              </span>
            </div>

            {/* Right Pod: Audio, Speed, PiP, & Fullscreen */}
            <div className="bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-sm px-2.5 py-1.5 flex items-center gap-3 shadow-xl">
              {/* Volume Scrubber with Smooth Hover Expansion */}
              <div className="group/vol flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="hover:text-white transition-colors focus:outline-none"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-zinc-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>

                <div
                  ref={volumeTrackRef}
                  onClick={handleVolumeTrackClick}
                  className="w-0 group-hover/vol:w-16 h-1 bg-zinc-800 rounded-sm overflow-hidden cursor-pointer relative transition-all duration-200"
                >
                  <div
                    className="h-full bg-zinc-200 rounded-sm"
                    style={{ width: `${isMuted ? 0 : volume * 100}%` }}
                  />
                </div>
              </div>

              {/* Custom Monochromatic Speed Popover */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsSpeedMenuOpen(!isSpeedMenuOpen)}
                  className="px-2 py-0.5 rounded-sm bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-mono text-zinc-300 flex items-center gap-1 transition-colors focus:outline-none"
                >
                  <span>{playbackRate}x</span>
                  <ChevronUp className={`w-3 h-3 transition-transform ${isSpeedMenuOpen ? "rotate-180" : ""}`} />
                </button>

                {isSpeedMenuOpen && (
                  <div className="absolute bottom-full right-0 mb-2 w-24 bg-zinc-950 border border-zinc-800 rounded-sm shadow-2xl py-1 z-50 animate-in fade-in-0 zoom-in-95 duration-100">
                    <div className="px-2 py-1 text-[10px] font-mono text-zinc-400 border-b border-zinc-800/80 uppercase tracking-wider">
                      Speed
                    </div>
                    {SPEED_OPTIONS.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setSpeed(rate)}
                        className={`w-full px-2 py-1 text-xs font-mono flex items-center justify-between hover:bg-zinc-900 transition-colors ${
                          playbackRate === rate ? "text-zinc-100 font-semibold bg-zinc-900/60" : "text-zinc-400"
                        }`}
                      >
                        <span>{rate}x</span>
                        {playbackRate === rate && <Check className="w-3 h-3 text-zinc-100" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* PiP Button */}
              <button
                type="button"
                onClick={togglePiP}
                className="hover:text-white transition-colors focus:outline-none"
                title="Picture-in-Picture"
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>

              {/* Fullscreen Button */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="hover:text-white transition-colors focus:outline-none"
                title="Fullscreen (F)"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayerModal;
