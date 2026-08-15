import React from "react";
import { ChannelMeta } from "@/lib/telegram/session";
import { Check, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChannelItemRowProps {
  channel: ChannelMeta;
  isSelected: boolean;
  onToggle: () => void;
}

export const ChannelItemRow: React.FC<ChannelItemRowProps> = ({
  channel,
  isSelected,
  onToggle,
}) => {
  // Generate a deterministic subtle dark tint based on channel title
  const getInitials = (title: string) => {
    if (!title) return "CH";
    const words = title.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return title.slice(0, 2).toUpperCase();
  };

  return (
    <div
      onClick={onToggle}
      className={cn(
        "group flex h-12 w-full cursor-pointer items-center justify-between px-3 rounded-sm transition-all select-none",
        isSelected
          ? "bg-zinc-900/80 border border-zinc-700/60"
          : "bg-transparent border border-transparent hover:bg-zinc-800/40 hover:border-zinc-800/50"
      )}
    >
      {/* Left: Avatar + Title & Meta */}
      <div className="flex items-center gap-2.5 overflow-hidden min-w-0 pr-2">
        {/* Avatar */}
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-[11px] font-mono font-medium border",
            channel.isSelf
              ? "bg-zinc-800 border-zinc-700 text-zinc-100"
              : isSelected
              ? "bg-zinc-800 border-zinc-700 text-zinc-100"
              : "bg-zinc-950 border-zinc-800/80 text-zinc-400 group-hover:text-zinc-200"
          )}
        >
          {channel.isSelf ? (
            <Bookmark className="h-3.5 w-3.5 stroke-[1.75px]" />
          ) : (
            getInitials(channel.title)
          )}
        </div>

        {/* Channel Details */}
        <div className="flex flex-col overflow-hidden min-w-0">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span
              className={cn(
                "truncate text-xs font-medium leading-tight",
                isSelected ? "text-zinc-100" : "text-zinc-300 group-hover:text-zinc-100"
              )}
            >
              {channel.title}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
            {channel.username ? (
              <span className="truncate text-zinc-400">@{channel.username}</span>
            ) : (
              <span>Telegram Chat</span>
            )}
            {channel.unreadCount ? channel.unreadCount > 0 && (
              <>
                <span className="text-zinc-700">•</span>
                <span className="text-zinc-400">{channel.unreadCount} unread</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Right: Sharp Minimalist Checkbox */}
      <div
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border transition-all",
          isSelected
            ? "bg-zinc-100 border-zinc-100 text-zinc-950 shadow-sm"
            : "border-zinc-700 bg-zinc-950/80 group-hover:border-zinc-500"
        )}
      >
        {isSelected && <Check className="h-3 w-3 stroke-[2.5px]" />}
      </div>
    </div>
  );
};
