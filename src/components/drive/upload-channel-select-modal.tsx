import React, { useState } from "react";
import { ChannelMeta } from "@/lib/telegram/session";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Layers, Bookmark } from "lucide-react";

interface UploadChannelSelectModalProps {
  isOpen: boolean;
  channels: ChannelMeta[];
  filesCount: number;
  onSelect: (channelId: string, channelTitle: string) => void;
  onCancel: () => void;
}

export const UploadChannelSelectModal: React.FC<UploadChannelSelectModalProps> = ({
  isOpen,
  channels,
  filesCount,
  onSelect,
  onCancel,
}) => {
  const [selectedId, setSelectedId] = useState<string>(channels[0]?.id || "");

  const getInitials = (title: string) => {
    if (!title) return "CH";
    const words = title.trim().split(/\s+/);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return title.slice(0, 2).toUpperCase();
  };

  const handleConfirm = () => {
    const target = channels.find((c) => c.id === selectedId) || channels[0];
    if (target) {
      onSelect(target.id, target.title);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md border-zinc-800 bg-zinc-950 p-5 rounded-md">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-zinc-900 border border-zinc-800 text-zinc-200">
              <Layers className="h-3.5 w-3.5" />
            </div>
            <DialogTitle className="text-sm font-semibold text-zinc-100">
              Select Destination Channel
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-zinc-400">
            You are in Unified View. Choose where to upload your {filesCount} file(s).
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-56 overflow-y-auto space-y-1.5 py-2 my-1">
          {channels.map((ch) => {
            const isSelected = (selectedId || channels[0]?.id) === ch.id;
            return (
              <div
                key={ch.id}
                onClick={() => setSelectedId(ch.id)}
                className={`flex cursor-pointer items-center justify-between px-3 py-2 rounded-sm border text-xs transition-all select-none ${
                  isSelected
                    ? "bg-zinc-900 border-zinc-700 text-zinc-100 font-medium"
                    : "border-zinc-800/60 bg-zinc-950/60 text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] bg-zinc-800 text-[10px] font-mono text-zinc-300">
                    {ch.isSelf ? <Bookmark className="h-3 w-3" /> : getInitials(ch.title)}
                  </div>
                  <span className="truncate">{ch.title}</span>
                </div>

                <div
                  className={`h-3 w-3 rounded-full border ${
                    isSelected ? "bg-zinc-100 border-zinc-100" : "border-zinc-700"
                  }`}
                />
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-1 border-t border-zinc-900">
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-xs rounded-sm">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            className="text-xs rounded-sm bg-zinc-100 text-zinc-950 font-medium hover:bg-white"
          >
            Start Upload
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
