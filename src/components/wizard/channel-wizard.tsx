import React, { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useChannelWizardStore } from "@/lib/stores/channel-wizard-store";
import { ChannelItemRow } from "./channel-item-row";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Layers,
  Search,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  FolderSync,
} from "lucide-react";

export const ChannelWizard: React.FC = () => {
  const {
    availableChannels,
    selectedChannelIds,
    isLoading,
    error,
    floodWaitSeconds,
    fetchChannels,
    toggleChannel,
    selectAll,
    deselectAll,
    confirmSelection,
  } = useChannelWizardStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Instant real-time filtering
  const filteredChannels = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return availableChannels;
    return availableChannels.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.username && c.username.toLowerCase().includes(q))
    );
  }, [availableChannels, searchQuery]);

  const selectedCount = selectedChannelIds.size;
  const isContinueDisabled = selectedCount === 0 || isLoading || isSaving;

  const handleContinue = async () => {
    setIsSaving(true);
    try {
      await confirmSelection();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4 bg-zinc-950 selection:bg-zinc-800">
      {/* Background vignette */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0%,transparent_70%)]" />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[460px] rounded-md border border-zinc-800/80 bg-zinc-900/40 p-6 shadow-2xl backdrop-blur-md"
      >
        {/* Header */}
        <div className="flex flex-col space-y-1.5 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-zinc-900 border border-zinc-800 text-zinc-200">
              <Layers className="h-3.5 w-3.5 stroke-[1.5px]" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100 font-sans">
              Select Channels to Index
            </h1>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Choose the Telegram chats and channels Vaultgram should monitor for media and files.
          </p>
        </div>

        {/* Rate Limit Alert */}
        {floodWaitSeconds > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-sm border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            <span>Telegram rate-limit active. Retrying in {floodWaitSeconds}s...</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-3 flex items-center justify-between rounded-sm border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => fetchChannels()}
              className="text-xs underline hover:text-white"
            >
              Retry
            </button>
          </div>
        )}

        {/* Search Bar & Counter */}
        <div className="space-y-2 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500 stroke-[1.5px]" />
            <Input
              type="text"
              placeholder="Search chats and channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={isLoading}
              className="h-8 pl-8 text-xs bg-zinc-950/70 border-zinc-800/80 rounded-md placeholder:text-zinc-600"
            />
          </div>

          {/* Quick Actions & Counter */}
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 px-0.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                disabled={isLoading || availableChannels.length === 0}
                className="hover:text-zinc-200 transition-colors disabled:opacity-40"
              >
                Select All
              </button>
              <span className="text-zinc-700">•</span>
              <button
                type="button"
                onClick={deselectAll}
                disabled={isLoading || availableChannels.length === 0}
                className="hover:text-zinc-200 transition-colors disabled:opacity-40"
              >
                Deselect All
              </button>
            </div>

            <span className="text-zinc-400 font-medium">
              <span className="text-zinc-200">{selectedCount}</span> of{" "}
              {availableChannels.length} selected
            </span>
          </div>
        </div>

        {/* Channel List Container */}
        <div className="rounded-md border border-zinc-800/80 bg-zinc-950/60 overflow-hidden">
          <ScrollArea className="h-[260px] p-1.5">
            {isLoading ? (
              /* Sleek Skeleton Loading Rows */
              <div className="space-y-1.5 p-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="flex h-12 w-full items-center justify-between px-3 rounded-sm bg-zinc-900/30 border border-zinc-800/30 animate-pulse"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-sm bg-zinc-800/60" />
                      <div className="space-y-1">
                        <div className="h-3 w-28 rounded-sm bg-zinc-800/60" />
                        <div className="h-2 w-16 rounded-sm bg-zinc-800/40" />
                      </div>
                    </div>
                    <div className="h-4 w-4 rounded-[2px] bg-zinc-800/60" />
                  </div>
                ))}
              </div>
            ) : filteredChannels.length === 0 ? (
              /* Empty State */
              <div className="flex h-[240px] flex-col items-center justify-center gap-2 text-center p-4 text-zinc-500">
                <FolderSync className="h-6 w-6 stroke-[1.25px] text-zinc-600" />
                <span className="text-xs font-medium text-zinc-400">
                  {searchQuery ? "No channels match your filter" : "No Telegram channels found"}
                </span>
                <p className="text-[11px] text-zinc-600 max-w-[200px]">
                  {searchQuery
                    ? "Try adjusting your search query"
                    : "Create or join a channel in Telegram to index files."}
                </p>
              </div>
            ) : (
              /* Channel Items */
              <div className="space-y-1">
                {filteredChannels.map((channel) => (
                  <ChannelItemRow
                    key={channel.id}
                    channel={channel}
                    isSelected={selectedChannelIds.has(channel.id)}
                    onToggle={() => toggleChannel(channel.id)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Footer Actions */}
        <div className="mt-4 pt-3 border-t border-zinc-800/50 flex items-center justify-between">
          <button
            type="button"
            onClick={() => fetchChannels()}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh list</span>
          </button>

          <Button
            onClick={handleContinue}
            disabled={isContinueDisabled}
            className="gap-2 rounded-md h-9 px-4 font-medium text-xs shadow-sm"
          >
            <span>{isSaving ? "Saving..." : "Continue to Drive"}</span>
            <ArrowRight className="h-3.5 w-3.5 stroke-[1.75px]" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
};
