import React from "react";
import { DriveFile } from "@/lib/telegram/indexer";
import { useDriveStore } from "@/lib/stores/drive-store";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Image,
  Video,
  FileText,
  Archive,
  Music,
  File,
  Download,
  Eye,
  Pin,
  Star,
  Copy,
} from "lucide-react";
import { cn, formatBytes, formatDate } from "@/lib/utils";
import { toast } from "sonner";

interface FileCardProps {
  file: DriveFile;
  onDownload: (file: DriveFile) => void;
}

export const FileCard = React.memo<FileCardProps>(
  ({ file, onDownload }) => {
    // Selective subscriptions to prevent unnecessary re-render thrashing
    const isPinned = useDriveStore((s) => s.pinnedFileIds.has(file.id));
    const isFavorite = useDriveStore((s) => s.favoriteFileIds.has(file.id));
    const togglePin = useDriveStore((s) => s.togglePin);
    const toggleFavorite = useDriveStore((s) => s.toggleFavorite);
    const setPreviewFile = useDriveStore((s) => s.setPreviewFile);

    const getFileIcon = () => {
      switch (file.category) {
        case "IMAGE":
          return <Image className="h-6 w-6 text-zinc-400 stroke-[1.5px]" />;
        case "VIDEO":
          return <Video className="h-6 w-6 text-zinc-400 stroke-[1.5px]" />;
        case "DOC":
          return <FileText className="h-6 w-6 text-zinc-400 stroke-[1.5px]" />;
        case "ARCHIVE":
          return <Archive className="h-6 w-6 text-zinc-400 stroke-[1.5px]" />;
        case "AUDIO":
          return <Music className="h-6 w-6 text-zinc-400 stroke-[1.5px]" />;
        default:
          return <File className="h-6 w-6 text-zinc-400 stroke-[1.5px]" />;
      }
    };

    const copyTelegramReference = () => {
      const text = `Channel: ${file.channelTitle} (ID: ${file.channelId}), Msg: ${file.messageId}`;
      navigator.clipboard.writeText(text);
      toast.success("Telegram message reference copied to clipboard");
    };

    return (
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            onClick={() => setPreviewFile(file)}
            className={cn(
              "group relative flex flex-col justify-between rounded-md border border-zinc-800/80 bg-zinc-900/30 p-3 transition-all hover:bg-zinc-900/70 hover:border-zinc-700/80 cursor-pointer select-none h-[142px]",
              isPinned && "border-zinc-700/90 bg-zinc-900/50"
            )}
          >
            {/* Top: Icon + Pin / Star Badges */}
            <div className="flex items-start justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-zinc-950 border border-zinc-800/80 group-hover:border-zinc-700 transition-colors">
                {getFileIcon()}
              </div>

              <div className="flex items-center gap-1">
                {isPinned && <Pin className="h-3 w-3 text-cyan-400 fill-cyan-400" />}
                {isFavorite && <Star className="h-3 w-3 text-amber-400 fill-amber-400" />}
              </div>
            </div>

            {/* Middle: File Name */}
            <div className="my-auto py-1">
              <span
                className="line-clamp-2 text-xs font-medium leading-snug text-zinc-200 group-hover:text-zinc-100 break-words"
                title={file.name}
              >
                {file.name}
              </span>
            </div>

            {/* Bottom: Meta Bar */}
            <div className="flex items-center justify-between border-t border-zinc-800/40 pt-2 font-mono text-[10px] text-zinc-500">
              <span>{formatBytes(file.size)}</span>
              <span>{formatDate(file.date)}</span>
            </div>
          </div>
        </ContextMenuTrigger>

        {/* Right Click Context Menu */}
        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={() => setPreviewFile(file)} className="gap-2">
            <Eye className="h-3.5 w-3.5 stroke-[1.5px]" />
            <span>Quick Preview</span>
          </ContextMenuItem>

          <ContextMenuItem onClick={() => onDownload(file)} className="gap-2">
            <Download className="h-3.5 w-3.5 stroke-[1.5px]" />
            <span>Download Chunked</span>
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onClick={() => togglePin(file.id)} className="gap-2">
            <Pin className="h-3.5 w-3.5 stroke-[1.5px]" />
            <span>{isPinned ? "Unpin File" : "Pin File"}</span>
          </ContextMenuItem>

          <ContextMenuItem onClick={() => toggleFavorite(file.id)} className="gap-2">
            <Star className="h-3.5 w-3.5 stroke-[1.5px]" />
            <span>{isFavorite ? "Remove Favorite" : "Add to Favorites"}</span>
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onClick={copyTelegramReference} className="gap-2">
            <Copy className="h-3.5 w-3.5 stroke-[1.5px]" />
            <span>Copy Message Ref</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  },
  (prev, next) =>
    prev.file.id === next.file.id &&
    prev.file.size === next.file.size &&
    prev.file.date === next.file.date &&
    prev.file.name === next.file.name
);
