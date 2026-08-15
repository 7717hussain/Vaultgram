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
} from "lucide-react";
import { DriveFile } from "@/lib/telegram/indexer";
import { useTransferStore } from "@/lib/stores/transfer-store";
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

  const [isPlaying, setIsPlaying] = useState(false);
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

  // Click outside listener for speed popover
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
    if (!videoRef.current) return;
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
    if (!videoRef.current) return;
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
        {/* Top Header: Floating Left Pill & Right Merged Pill (Preserved) */}
        <div
          className={`absolute top-4 inset-x-4 z-30 flex items-center justify-between pointer-events-none transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* Left Pill: Title & Metadata */}
          <div className="bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-sm px-3 py-1.5 flex items-center gap-2.5 shadow-xl pointer-events-auto max-w-[70%]">
            <VideoIcon className="w-4 h-4 text-zinc-400 shrink-0" />
            <span className="text-xs font-medium text-zinc-100 truncate" title={file.name}>
              {file.name}
            </span>
            <span className="px-1.5 py-0.5 text-[10px] font-mono bg-zinc-900 border border-zinc-800 rounded-sm text-zinc-400 shrink-0">
              {formatBytes(file.size)}
            </span>
            <span className="text-[10px] font-mono text-zinc-500 shrink-0">
              {formatDate(file.date)}
            </span>
          </div>

          {/* Right Merged Pill: Download & Close Actions */}
          <div className="bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-sm p-1 flex items-center gap-1 shadow-xl pointer-events-auto">
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
          <video
            ref={videoRef}
            src={`/stream/${file.id}`}
            className="w-full h-full object-contain"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => videoRef.current && setDuration(videoRef.current.duration)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            autoPlay
            playsInline
          />
        </div>

        {/* Bottom Control Layer (Naked Seekbar + Clustered Control Pods) */}
        <div
          className={`absolute bottom-4 inset-x-4 z-30 flex flex-col gap-3 transition-opacity duration-300 ${
            showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 1. Naked Standalone Seekbar (Directly on Canvas, No Enclosing Pill) */}
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

          {/* 2. Clustered Control Pods (YouTube-style Modular Floating Pills) */}
          <div className="flex items-center justify-between text-zinc-200 select-none">
            
            {/* Left Pod: Playback & Timestamps */}
            <div className="bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-sm px-2.5 py-1.5 flex items-center gap-3 shadow-xl">
              <button
                type="button"
                onClick={togglePlay}
                className="p-1 hover:bg-zinc-800 text-zinc-100 rounded-sm transition-colors"
                title={isPlaying ? "Pause (Space/K)" : "Play (Space/K)"}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
              </button>

              <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
                <span className="text-zinc-200 font-medium">{formatTime(currentTime)}</span>
                <span className="text-zinc-600">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Right Pod: Speed, Volume, PiP, Fullscreen */}
            <div className="bg-zinc-950/85 backdrop-blur-md border border-zinc-800/80 rounded-sm px-2.5 py-1.5 flex items-center gap-2.5 shadow-xl">
              
              {/* Speed Popover */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setIsSpeedMenuOpen(!isSpeedMenuOpen)}
                  className="flex items-center gap-1 px-2 py-0.5 text-xs font-mono bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-sm text-zinc-300 transition-colors"
                >
                  <span>{playbackRate.toFixed(playbackRate % 1 === 0 ? 0 : 2)}x</span>
                  <ChevronUp className={`w-3 h-3 text-zinc-500 transition-transform ${isSpeedMenuOpen ? "" : "rotate-180"}`} />
                </button>

                {isSpeedMenuOpen && (
                  <div className="absolute bottom-full mb-2 right-0 w-28 bg-zinc-950 border border-zinc-800/90 rounded-sm shadow-2xl p-1 backdrop-blur-md z-40 space-y-0.5">
                    <div className="px-2 py-1 text-[10px] font-mono text-zinc-500 border-b border-zinc-800/60 mb-1">
                      SPEED
                    </div>
                    {SPEED_OPTIONS.map((rate) => (
                      <div
                        key={rate}
                        onClick={() => setSpeed(rate)}
                        className={`flex items-center justify-between px-2 py-1 text-xs font-mono rounded-sm cursor-pointer transition-colors ${
                          playbackRate === rate
                            ? "bg-zinc-900 text-zinc-100 font-semibold"
                            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                        }`}
                      >
                        <span>{rate.toFixed(rate % 1 === 0 ? 0 : 2)}x</span>
                        {playbackRate === rate && <Check className="w-3 h-3 text-zinc-200" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Volume Track */}
              <div className="flex items-center gap-1.5 pl-1 border-l border-zinc-800/80">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-sm transition-colors"
                  title="Mute (M)"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-zinc-500" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-zinc-200" />
                  )}
                </button>

                <div
                  ref={volumeTrackRef}
                  onClick={handleVolumeTrackClick}
                  className="group/vol relative w-14 h-1 hover:h-1.5 bg-zinc-800 rounded-sm cursor-pointer transition-all flex items-center"
                >
                  <div
                    className="bg-zinc-200 h-full rounded-sm"
                    style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full opacity-0 group-hover/vol:opacity-100 transition-opacity pointer-events-none shadow"
                    style={{
                      left: `${(isMuted ? 0 : volume) * 100}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                </div>
              </div>

              {/* PiP Button */}
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
                title="Fullscreen (F)"
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
