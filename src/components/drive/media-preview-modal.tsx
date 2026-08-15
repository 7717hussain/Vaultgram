import React, { useState, useEffect } from "react";
import {
  X,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  AlertCircle,
  Loader2,
  FileText,
  File,
  Copy,
} from "lucide-react";
import { DriveFile } from "@/lib/telegram/indexer";
import { tgStreamClient } from "@/lib/telegram/client";
import { useImagePreview } from "@/hooks/use-image-preview";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate } from "@/lib/utils";
import { toast } from "sonner";

interface MediaPreviewModalProps {
  file: DriveFile | null;
  onClose: () => void;
  onDownload: (file: DriveFile) => void;
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
  file,
  onClose,
  onDownload,
}) => {
  const isOpen = !!file;
  const isImage = file?.category === "IMAGE";
  const [zoom, setZoom] = useState(1);

  const {
    imageUrl,
    isLoading,
    error,
    dimensions,
    setDimensions,
    retry,
  } = useImagePreview(file, tgStreamClient.client, isOpen && isImage);

  // Reset zoom on file change
  useEffect(() => {
    setZoom(1);
  }, [file?.id, isOpen]);

  // Keyboard listener: Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!file) return null;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoom(1);

  const copyReference = () => {
    const text = `Channel: ${file.channelTitle} (ID: ${file.channelId}), Msg: ${file.messageId}`;
    navigator.clipboard.writeText(text);
    toast.success("Telegram message reference copied");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="flex flex-col w-full max-w-4xl max-h-[90vh] bg-zinc-950 border border-zinc-800/80 rounded-md shadow-2xl overflow-hidden select-none animate-in fade-in-0 zoom-in-95 duration-150 ease-out">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/80 bg-zinc-900/60">
          <div className="flex flex-col min-w-0 pr-4">
            <h2 className="text-sm font-semibold text-zinc-100 truncate" title={file.name}>
              {file.name}
            </h2>
            <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 mt-0.5">
              <span>{file.channelTitle}</span>
              <span>•</span>
              <span>{formatBytes(file.size)}</span>
              <span>•</span>
              <span>{formatDate(file.date)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Image Zoom Toolbar */}
            {isImage && imageUrl && (
              <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-sm p-0.5 mr-2">
                <button
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.5}
                  className="p-1 hover:bg-zinc-800 disabled:opacity-40 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono text-zinc-400 px-1 min-w-[34px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  disabled={zoom >= 3}
                  className="p-1 hover:bg-zinc-800 disabled:opacity-40 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                {zoom !== 1 && (
                  <button
                    onClick={handleResetZoom}
                    className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-colors border-l border-zinc-800"
                    title="Reset Zoom"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-sm transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Viewport Stage */}
        <div className="relative flex-1 min-h-[360px] max-h-[65vh] flex items-center justify-center p-4 bg-zinc-950 overflow-hidden select-none bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px]">
          {isImage ? (
            <>
              {isLoading && (
                <div className="flex flex-col items-center gap-3 text-zinc-400">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                  <span className="text-xs font-mono">Fetching full-res media via MTProto...</span>
                </div>
              )}

              {error && (
                <div className="flex flex-col items-center gap-3 text-center max-w-sm">
                  <AlertCircle className="w-8 h-8 text-rose-500" />
                  <div className="text-xs text-zinc-300">{error}</div>
                  <Button className="text-xs h-7 rounded-sm border-zinc-800" onClick={retry} size="sm" variant="outline">
                    Retry Fetch
                  </Button>
                </div>
              )}

              {imageUrl && !isLoading && !error && (
                <div className="w-full h-full flex items-center justify-center overflow-auto">
                  <img
                    src={imageUrl}
                    alt={file.name}
                    style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
                    className="max-w-full max-h-[60vh] object-contain transition-transform duration-100 ease-out shadow-2xl rounded-sm"
                    onLoad={(e) => {
                      const target = e.currentTarget;
                      setDimensions({ width: target.naturalWidth, height: target.naturalHeight });
                    }}
                  />
                </div>
              )}
            </>
          ) : file.category === "VIDEO" || file.category === "AUDIO" ? (
            <video
              controls
              autoPlay
              src={file.streamUrl}
              className="max-h-[60vh] w-full rounded-sm bg-black shadow-2xl"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-zinc-500">
              <div className="flex h-16 w-16 items-center justify-center rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
                {file.category === "DOC" ? (
                  <FileText className="h-8 w-8 stroke-[1.5px]" />
                ) : (
                  <File className="h-8 w-8 stroke-[1.5px]" />
                )}
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-mono text-zinc-300">{file.mimeType}</span>
                <p className="text-[11px] text-zinc-500">
                  Direct preview available via download.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800/80 bg-zinc-900/60">
          <div className="text-[11px] font-mono text-zinc-500 flex items-center gap-2">
            <span>
              {dimensions ? `${dimensions.width} × ${dimensions.height} px` : file.mimeType}
            </span>
            <button
              onClick={copyReference}
              className="text-zinc-600 hover:text-zinc-400 p-0.5 rounded transition-colors"
              title="Copy Telegram message reference"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-8 px-3 text-xs border-zinc-800 hover:bg-zinc-900 text-zinc-300 rounded-sm"
            >
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onDownload(file);
                onClose();
              }}
              className="h-8 px-3 text-xs gap-1.5 bg-zinc-100 hover:bg-white text-zinc-950 font-medium rounded-sm"
            >
              <Download className="w-3.5 h-3.5 stroke-[1.75px]" />
              Download File
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
};
