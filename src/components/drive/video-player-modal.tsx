import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  X,
  Download,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Maximize,
  Minimize,
  Check,
  ChevronUp,
  PictureInPicture2,
  Video as VideoIcon,
  Loader2,
  AlertCircle,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { DriveFile } from "@/lib/telegram/indexer";
import { useTransferStore } from "@/lib/stores/transfer-store";
import { useDriveStore } from "@/lib/stores/drive-store";
import { formatBytes } from "@/lib/utils";

interface VideoPlayerModalProps {
  file: DriveFile | null;
  isOpen: boolean;
  onClose: () => void;
}

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

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

  // YouTube-style keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

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
      if (e.key === "ArrowRight") {
        e.preventDefault();
        seekRelative(5);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekRelative(-5);
      }
      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        seekRelative(10);
      }
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        seekRelative(-10);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        adjustVolume(0.05);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        adjustVolume(-0.05);
      }
      if (/^[0-9]$/.test(e.key) && duration > 0) {
        e.preventDefault();
        const percent = parseInt(e.key, 10) / 10;
        seekAbsolute(percent * duration);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isPlaying, isMuted, duration, volume]);

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

  const seekAbsolute = (targetTime: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(duration || 1, targetTime));
    setCurrentTime(videoRef.current.currentTime);
    resetHideTimer();
  };

  const adjustVolume = (delta: number) => {
    if (!videoRef.current) return;
    const newVol = Math.max(0, Math.min(1, volume + delta));
    videoRef.current.volume = newVol;
    videoRef.current.muted = newVol === 0;
    setVolume(newVol);
    setIsMuted(newVol === 0);
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
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted && volume === 0) {
      videoRef.current.volume = 0.5;
      setVolume(0.5);
    }
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
        {/* Floating Top Header Bar (Rectangular Pods) */}
        <div
          className={`absolute top-4 inset-x-4 z-30 flex items-center justify-between pointer-events-none transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* Header Info Pod */}
          <div className="pointer-events-auto bg-zinc-950/90 backdrop-blur-md border border-zinc-800/90 rounded-sm px-3 py-1.5 flex items-center gap-2.5 shadow-2xl min-w-0 max-w-[70%]">
            <div className="p-1 bg-zinc-900 border border-zinc-800 rounded-sm text-zinc-400 flex-shrink-0">
              <VideoIcon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-100 truncate tracking-tight font-sans">
                {activeFile.name}
              </span>
              <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline-block flex-shrink-0">
                • {formatBytes(activeFile.size)}
              </span>
            </div>
          </div>

          {/* Header Action Buttons Pod */}
          <div className="pointer-events-auto bg-zinc-950/90 backdrop-blur-md border border-zinc-800/90 rounded-sm px-2 py-1 flex items-center gap-1.5 shadow-2xl">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-200 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-sm transition-colors"
              title="Download original file"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              onClick={isFullscreen ? toggleFullscreen : onClose}
              className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 rounded-sm transition-colors"
              title="Close player (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video Canvas Stage */}
        <div
          className="relative w-full h-full aspect-video bg-black flex items-center justify-center overflow-hidden cursor-pointer select-none"
          onClick={togglePlay}
        >
          {/* Live Buffering Spinner */}
          {isBuffering && !hasError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20 gap-3 select-none pointer-events-none">
              <Loader2 className="w-9 h-9 text-zinc-100 animate-spin stroke-[1.5px]" />
              <span className="text-[11px] font-mono text-zinc-300 tracking-wider bg-zinc-900/90 px-3 py-1 rounded-sm border border-zinc-800">
                STREAMING VIA MTPROTO
              </span>
            </div>
          )}

          {/* Stream Connection Error Card */}
          {hasError && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-20 gap-3 p-6 text-center select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-sm">
                <AlertCircle className="w-8 h-8 text-rose-400 stroke-[1.5px]" />
              </div>
              <span className="text-sm font-semibold text-zinc-100">Stream Playback Error</span>
              <p className="text-xs text-zinc-400 max-w-md font-mono bg-zinc-900/80 p-2.5 rounded-sm border border-zinc-800">
                Failed to load video stream from Telegram.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={retryStream}
                  className="px-3.5 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-white rounded-sm flex items-center gap-1.5 transition-colors border border-zinc-700"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry Stream</span>
                </button>
                <button
                  onClick={handleDownload}
                  className="px-3.5 py-1.5 text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-sm flex items-center gap-1.5 transition-colors border border-zinc-800"
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

        {/* YouTube-Style Bottom Floating Control Pods & Seekbar */}
        <div
          className={`absolute bottom-4 inset-x-4 z-30 flex flex-col gap-2.5 transition-opacity duration-300 pointer-events-none ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* YouTube Precision Scrubber Track */}
          <div
            ref={scrubberRef}
            onClick={handleScrubberClick}
            onMouseMove={handleScrubberMouseMove}
            onMouseLeave={() => setHoverTime(null)}
            className="pointer-events-auto group/scrubber relative w-full h-4 flex items-center cursor-pointer select-none px-0.5"
          >
            {/* Hover Floating Timestamp Tooltip */}
            {hoverTime !== null && (
              <div
                className="absolute -top-7 transform -translate-x-1/2 px-2 py-0.5 bg-zinc-900/95 border border-zinc-700/80 rounded-sm text-[10px] font-mono text-zinc-100 shadow-2xl pointer-events-none whitespace-nowrap"
                style={{ left: `${hoverPosition}px` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}

            {/* Scrubber Background Bar */}
            <div className="w-full h-1 group-hover/scrubber:h-2 bg-zinc-800/80 rounded-sm overflow-hidden relative transition-all duration-150 shadow-inner">
              {/* Buffered Progress */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-zinc-600/60 rounded-sm transition-all duration-150"
                style={{ width: `${bufferedPercent}%` }}
              />
              {/* Playback Progress */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-zinc-100 rounded-sm"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* YouTube Scrubber Playhead Knob (Expands on Hover) */}
            <div
              className="absolute top-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg scale-0 group-hover/scrubber:scale-100 transition-transform duration-100 pointer-events-none"
              style={{ left: `${progressPercent}%`, transform: "translate(-50%, -50%)" }}
            />
          </div>

          {/* Clustered Rectangular Control Pods */}
          <div className="flex items-center justify-between select-none">
            
            {/* Left Pod: [Play/Pause] -> [10s Rewind] -> [Timeline Timestamp] -> [10s Forward] */}
            <div className="pointer-events-auto bg-zinc-950/90 backdrop-blur-md border border-zinc-800/90 rounded-sm px-2.5 py-1.5 flex items-center gap-2 shadow-2xl">
              {/* 1. Play / Pause Button */}
              <button
                type="button"
                onClick={togglePlay}
                className="p-1 hover:bg-zinc-800 text-zinc-100 rounded-sm transition-colors"
                title={isPlaying ? "Pause (k/space)" : "Play (k/space)"}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
              </button>

              {/* 2. 10 Second Rewind Icon */}
              <button
                type="button"
                onClick={() => seekRelative(-10)}
                className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-sm transition-colors flex items-center"
                title="Rewind 10s (j)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              {/* 3. Timeline Monospace Timestamp */}
              <div className="flex items-center gap-1.5 px-2 text-xs font-mono text-zinc-400 border-x border-zinc-800/80">
                <span className="text-zinc-100 font-medium">{formatTime(currentTime)}</span>
                <span className="text-zinc-600">/</span>
                <span>{formatTime(duration)}</span>
              </div>

              {/* 4. 10 Second Forward Icon */}
              <button
                type="button"
                onClick={() => seekRelative(10)}
                className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-sm transition-colors flex items-center"
                title="Forward 10s (l)"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Right Pod: [Sound Panel] -> [Speed Selector] -> [PiP] -> [Fullscreen] */}
            <div className="pointer-events-auto bg-zinc-950/90 backdrop-blur-md border border-zinc-800/90 rounded-sm px-2.5 py-1.5 flex items-center gap-2.5 shadow-2xl">
              
              {/* Sound Panel (Mute Button + Volume Slider) */}
              <div className="group/vol flex items-center gap-1.5 pr-1 border-r border-zinc-800/80">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-sm transition-colors"
                  title="Mute (m)"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-zinc-500" />
                  ) : volume < 0.5 ? (
                    <Volume1 className="w-4 h-4 text-zinc-200" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-zinc-200" />
                  )}
                </button>

                {/* Volume Rail */}
                <div
                  ref={volumeTrackRef}
                  onClick={handleVolumeTrackClick}
                  className="w-14 h-3 flex items-center cursor-pointer select-none"
                >
                  <div className="w-full h-1 bg-zinc-800 rounded-sm relative overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-zinc-200 rounded-sm"
                      style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Playback Speed Popover */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setIsSpeedMenuOpen(!isSpeedMenuOpen)}
                  className="flex items-center gap-1 px-2 py-0.5 text-xs font-mono bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-sm text-zinc-300 transition-colors"
                >
                  <span>{playbackRate.toFixed(playbackRate % 1 === 0 ? 0 : 2)}x</span>
                  <ChevronUp
                    className={`w-3 h-3 text-zinc-500 transition-transform duration-150 ${
                      isSpeedMenuOpen ? "" : "rotate-180"
                    }`}
                  />
                </button>

                {isSpeedMenuOpen && (
                  <div className="absolute bottom-full mb-2 right-0 w-28 bg-zinc-950 border border-zinc-800/90 rounded-sm shadow-2xl p-1 backdrop-blur-md z-40 space-y-0.5">
                    <div className="px-2 py-1 text-[10px] font-mono text-zinc-500 border-b border-zinc-800/60 mb-1">
                      SPEED
                    </div>
                    {SPEED_OPTIONS.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setSpeed(rate)}
                        className={`w-full flex items-center justify-between px-2 py-1 text-xs font-mono rounded-sm cursor-pointer transition-colors ${
                          playbackRate === rate
                            ? "bg-zinc-900 text-zinc-100 font-semibold"
                            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                        }`}
                      >
                        <span>{rate.toFixed(rate % 1 === 0 ? 0 : 2)}x</span>
                        {playbackRate === rate && <Check className="w-3 h-3 text-emerald-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Picture-in-Picture Button */}
              <button
                type="button"
                onClick={togglePiP}
                className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-sm transition-colors border-l border-zinc-800/80 pl-2"
                title="Picture in Picture"
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>

              {/* Fullscreen Button */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-sm transition-colors"
                title={isFullscreen ? "Exit Fullscreen (f)" : "Fullscreen (f)"}
              >
                {isFullscreen ? (
                  <Minimize className="w-4 h-4 text-zinc-200" />
                ) : (
                  <Maximize className="w-4 h-4 text-zinc-200" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayerModal;
