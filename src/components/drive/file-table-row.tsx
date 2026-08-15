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
import { formatBytes, formatDate } from "@/lib/utils";
import { toast } from "sonner";

interface FileTableRowProps {
  file: DriveFile;
  onDownload: (file: DriveFile) => void;
}

export const FileTableRow: React.FC<FileTableRowProps> = ({ file, onDownload }) => {
  const { pinnedFileIds, favoriteFileIds, togglePin, toggleFavorite, setPreviewFile } =
    useDriveStore();

  const isPinned = pinnedFileIds.has(file.id);
  const isFavorite = favoriteFileIds.has(file.id);

  const getFileIcon = () => {
    switch (file.category) {
      case "IMAGE":
        return <Image className="h-4 w-4 text-zinc-400 stroke-[1.5px]" />;
      case "VIDEO":
        return <Video className="h-4 w-4 text-zinc-400 stroke-[1.5px]" />;
      case "DOC":
        return <FileText className="h-4 w-4 text-zinc-400 stroke-[1.5px]" />;
      case "ARCHIVE":
        return <Archive className="h-4 w-4 text-zinc-400 stroke-[1.5px]" />;
      case "AUDIO":
        return <Music className="h-4 w-4 text-zinc-400 stroke-[1.5px]" />;
      default:
        return <File className="h-4 w-4 text-zinc-400 stroke-[1.5px]" />;
    }
  };

  const copyTelegramReference = () => {
    const text = `Channel: ${file.channelTitle} (ID: ${file.channelId}), Msg: ${file.messageId}`;
    navigator.clipboard.writeText(text);
    toast.success("Telegram message reference copied to clipboard");
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <tr
          onClick={() => setPreviewFile(file)}
          className="group h-10 border-b border-zinc-900/80 hover:bg-zinc-900/40 text-xs transition-colors cursor-pointer select-none"
        >
          {/* Name & Icon */}
          <td className="px-3 py-2">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-zinc-950 border border-zinc-800/80">
                {getFileIcon()}
              </div>
              <span
                className="truncate font-medium text-zinc-200 group-hover:text-zinc-100 max-w-[280px]"
                title={file.name}
              >
                {file.name}
              </span>
              {isPinned && <Pin className="h-2.5 w-2.5 text-cyan-400 fill-cyan-400 shrink-0" />}
              {isFavorite && <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400 shrink-0" />}
            </div>
          </td>

          {/* Channel Source */}
          <td className="px-3 py-2 text-zinc-400 truncate max-w-[140px]">
            {file.channelTitle}
          </td>

          {/* Category Badge */}
          <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">
            <span className="rounded-sm bg-zinc-900 border border-zinc-800 px-1.5 py-0.5">
              {file.category}
            </span>
          </td>

          {/* Size */}
          <td className="px-3 py-2 font-mono text-[11px] text-zinc-400">
            {formatBytes(file.size)}
          </td>

          {/* Date */}
          <td className="px-3 py-2 font-mono text-[11px] text-zinc-500">
            {formatDate(file.date)}
          </td>

          {/* Actions */}
          <td className="px-3 py-2 text-right">
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload(file);
                }}
                className="h-6 w-6 rounded-sm flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                title="Download"
              >
                <Download className="h-3 w-3 stroke-[1.5px]" />
              </button>
            </div>
          </td>
        </tr>
      </ContextMenuTrigger>

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
};
