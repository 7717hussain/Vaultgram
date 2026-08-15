import React from "react";
import { DriveFile } from "@/lib/telegram/indexer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Image, FileText, File } from "lucide-react";
import { formatBytes, formatDate } from "@/lib/utils";

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
  if (!file) return null;

  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl border-zinc-800 bg-zinc-950 p-5 rounded-md">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-sm font-semibold text-zinc-100 truncate pr-6">
            {file.name}
          </DialogTitle>
          <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono">
            <span>{file.channelTitle}</span>
            <span>•</span>
            <span>{formatBytes(file.size)}</span>
            <span>•</span>
            <span>{formatDate(file.date)}</span>
          </div>
        </DialogHeader>

        {/* Media Preview Stage */}
        <div className="my-3 flex min-h-[260px] max-h-[460px] items-center justify-center rounded-sm border border-zinc-800/80 bg-zinc-900/30 p-2 overflow-hidden">
          {file.category === "VIDEO" || file.category === "AUDIO" ? (
            <video
              controls
              autoPlay
              src={file.streamUrl}
              className="max-h-[420px] w-full rounded-sm bg-black"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-zinc-500">
              <div className="flex h-16 w-16 items-center justify-center rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
                {file.category === "DOC" ? (
                  <FileText className="h-8 w-8 stroke-[1.5px]" />
                ) : file.category === "IMAGE" ? (
                  <Image className="h-8 w-8 stroke-[1.5px]" />
                ) : (
                  <File className="h-8 w-8 stroke-[1.5px]" />
                )}
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-mono text-zinc-300">
                  {file.mimeType}
                </span>
                <p className="text-[11px] text-zinc-500">
                  Direct preview available via Telegram streaming.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-xs rounded-sm"
          >
            Close
          </Button>

          <Button
            size="sm"
            onClick={() => onDownload(file)}
            className="gap-2 text-xs rounded-sm bg-zinc-100 text-zinc-950 font-medium hover:bg-white"
          >
            <Download className="h-3.5 w-3.5 stroke-[1.75px]" />
            Download File
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
