import React, { useEffect, useState } from "react";
import { Upload } from "lucide-react";

interface DropzoneOverlayProps {
  activeChannelTitle: string;
  onFilesDropped: (files: FileList | File[]) => void;
}

export const DropzoneOverlay: React.FC<DropzoneOverlayProps> = ({
  activeChannelTitle,
  onFilesDropped,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter <= 0) {
        setIsDragging(false);
        dragCounter = 0;
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter = 0;

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onFilesDropped(e.dataTransfer.files);
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [onFilesDropped]);

  if (!isDragging) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-6 select-none pointer-events-none">
      <div className="flex h-full w-full max-w-2xl max-h-[420px] flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-zinc-600 bg-zinc-900/60 p-8 text-center shadow-2xl">
        <div className="flex h-16 w-16 items-center justify-center rounded-md bg-zinc-950 border border-zinc-800 text-zinc-100 shadow-lg">
          <Upload className="h-8 w-8 stroke-[1.5px] animate-bounce" />
        </div>

        <div className="space-y-1">
          <h2 className="text-base font-semibold text-zinc-100">
            Drop files to upload directly to Telegram
          </h2>
          <p className="text-xs text-zinc-400 font-mono">
            Destination: <span className="text-zinc-200">{activeChannelTitle}</span>
          </p>
        </div>

        <div className="mt-2 rounded-sm bg-zinc-950/80 border border-zinc-800/80 px-3 py-1 text-[11px] font-mono text-zinc-500">
          Max 2 GB per file • 100% Client-Side MTProto Stream
        </div>
      </div>
    </div>
  );
};
