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
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

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

  // Reset states on file change
  useEffect(() => {
    if (isOpen) {
      setIsBuffering(true);
      setHasError(false);
      setCurrentTime(0);
      setDuration(0);
      setBufferedEnd(0);
    }
  }, [isOpen, activeFile?.id, retryCount]);

  if (!isOpen || !activeFile) return null;

  const streamUrl = `/stream/${activeFile.id}${retryCount > 0 ? `?r=${retryCount}` : ""}`;

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      setShowControls(true);
    }
    resetHideTimer();
  };

  const seekRelative = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(
      0,
      Math.min(duration || 1, videoRef.current.currentTime + seconds)
    );
    resetHideTimer();
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

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
    setIsBuffering(false);
    videoRef.current.play().catch(() => {});
    setIsPlaying(true);
  };

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubberRef.current || !videoRef.current || duration === 0) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = pos * duration;
    videoRef.current.currentTime = target;
    setCurrentTime(target);
    resetHideTimer();
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
    enqueueDownload(activeFile);
    onClose();
  };

  const retryStream = () => {
    setHasError(false);
    setIsBuffering(true);
    setRetryCount((c) => c + 1);
  };

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
        className={`relative flex flex-col bg-zinc-950 border border-zinc-800 shadow-2xl rounded-sm overflow-hidden ${
          isFullscreen ? "w-full h-full rounded-none border-none" : "w-full max-w-5xl max-h-[90vh]"
        }`}
      >
        {/* Floating Top Header Bar */}
        <div
          className={`absolute top-0 inset-x-0 z-30 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <div className="p-1.5 bg-zinc-900/90 border border-zinc-800 rounded-sm text-zinc-400">
              <VideoIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-semibold text-zinc-100 truncate tracking-tight font-sans">
                {activeFile.name}
              </h2>
              <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono">
                <span>{activeFile.channelTitle}</span>
                <span>•</span>
                <span>{formatBytes(activeFile.size)}</span>
                <span>•</span>
                <span>{formatDate(activeFile.date)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-200 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 rounded-sm transition-colors"
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
          {/* Live Buffering Spinner */}
          {isBuffering && !hasError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-20 gap-2 select-none pointer-events-none">
              <Loader2 className="w-9 h-9 text-zinc-200 animate-spin stroke-[1.5px]" />
              <span className="text-[11px] font-mono text-zinc-300 tracking-wider">
                STREAMING VIA MTPROTO
              </span>
            </div>
          )}

          {/* Stream Connection Error State */}
          {hasError && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-20 gap-3 p-6 text-center select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <AlertCircle className="w-10 h-10 text-rose-400 stroke-[1.5px]" />
              <span className="text-sm font-semibold text-zinc-200">Stream Playback Error</span>
              <p className="text-xs text-zinc-400 max-w-md font-mono bg-zinc-900/80 p-2.5 rounded-sm border border-zinc-800">
                Failed to load video stream from Telegram.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={retryStream}
                  className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-white rounded-sm flex items-center gap-1.5 transition-colors border border-zinc-700"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry Stream</span>
                </button>
                <button
                  onClick={handleDownload}
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
            src={streamUrl}
            className="w-full h-full object-contain cursor-pointer"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onWaiting={() => setIsBuffering(true)}
            onPlaying={() => {
              setIsBuffering(false);
              setIsPlaying(true);
            }}
            onPause={() => setIsPlaying(false)}
            onError={() => {
              setIsBuffering(false);
              setHasError(true);
            }}
            autoPlay
            playsInline
          />
        </div>

        {/* Bottom Control Layer (Naked Standalone Seekbar + Clustered Control Pods) */}
        <div
          className={`absolute bottom-0 inset-x-0 z-30 px-4 py-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Naked Precision Scrubber Track */}
          <div
            ref={scrubberRef}
            onClick={handleScrubberClick}
            onMouseMove={handleScrubberMouseMove}
            onMouseLeave={() => setHoverTime(null)}
            className="relative w-full h-2 flex items-center cursor-pointer group mb-2 select-none"
          >
            {/* Background Rail */}
            <div className="w-full h-[3px] group-hover:h-[5px] bg-zinc-800/80 rounded-full transition-all duration-150 relative overflow-hidden">
              {/* Buffered Range Bar */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-zinc-700/60 transition-all duration-200"
                style={{ width: `${bufferedPercent}%` }}
              />
              {/* Playback Progress Bar */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-zinc-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Hover Timestamp Tooltip */}
            {hoverTime !== null && (
              <div
                className="absolute bottom-4 -translate-x-1/2 px-1.5 py-0.5 bg-zinc-900/95 border border-zinc-800 rounded-sm text-[10px] font-mono text-zinc-200 shadow-md pointer-events-none select-none"
                style={{ left: `${hoverPosition}px` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}

            {/* Scrubber Playhead Knob */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md pointer-events-none"
              style={{ left: `${progressPercent}%` }}
            />
          </div>

          {/* Pod Controls Row */}
          <div className="flex items-center justify-between">
            {/* Left Control Cluster */}
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="p-1.5 hover:bg-zinc-800 text-zinc-200 rounded-sm transition-colors"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              </button>

              {/* Volume / Mute Pod */}
              <div className="flex items-center gap-1.5 group/vol">
                <button
                  onClick={toggleMute}
                  className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-sm transition-colors"
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                <div
                  ref={volumeTrackRef}
                  onClick={handleVolumeTrackClick}
                  className="w-16 h-4 flex items-center cursor-pointer select-none"
                >
                  <div className="w-full h-1 bg-zinc-800 rounded-full relative overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-zinc-300 rounded-full"
                      style={{ width: `${isMuted ? 0 : volume * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Monospace Timestamp */}
              <div className="text-[11px] font-mono text-zinc-400 select-none">
                <span className="text-zinc-200">{formatTime(currentTime)}</span>
                <span className="mx-1">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Right Control Cluster */}
            <div className="flex items-center gap-2">
              {/* Playback Speed Popover */}
              <div className="relative">
                <button
                  onClick={() => setIsSpeedMenuOpen((prev) => !prev)}
                  className="flex items-center gap-0.5 px-2 py-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-sm text-[11px] font-mono transition-colors border border-transparent hover:border-zinc-800"
                >
                  <span>{playbackRate}x</span>
                  <ChevronUp className="w-3 h-3" />
                </button>

                {isSpeedMenuOpen && (
                  <div className="absolute bottom-full right-0 mb-2 py-1 w-20 bg-zinc-900 border border-zinc-800 rounded-sm shadow-xl z-50 flex flex-col">
                    {SPEED_OPTIONS.map((speed) => (
                      <button
                        key={speed}
                        onClick={() => setSpeed(speed)}
                        className={`flex items-center justify-between px-2.5 py-1 text-[10px] font-mono transition-colors text-left ${
                          playbackRate === speed
                            ? "bg-zinc-800 text-zinc-100 font-semibold"
                            : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                        }`}
                      >
                        <span>{speed}x</span>
                        {playbackRate === speed && <Check className="w-3 h-3 text-emerald-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Picture in Picture */}
              <button
                onClick={togglePiP}
                className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-sm transition-colors"
                title="Picture in Picture"
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>

              {/* Fullscreen */}
              <button
                onClick={toggleFullscreen}
                className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-sm transition-colors"
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
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
