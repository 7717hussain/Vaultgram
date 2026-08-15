import React, { useState } from "react";
import { useDriveStore, NavFilter } from "@/lib/stores/drive-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useChannelWizardStore } from "@/lib/stores/channel-wizard-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Layers,
  Files,
  Image,
  Video,
  FileText,
  Archive,
  Music,
  Pin,
  Star,
  Clock,
  Plus,
  Folder,
  Trash2,
  HardDrive,
  SlidersHorizontal,
  LogOut,
  Bookmark,
  Download,
} from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";

export const Sidebar: React.FC = () => {
  const {
    channels,
    activeChannelId,
    activeFilter,
    files,
    customFolders,
    pinnedFileIds,
    favoriteFileIds,
    setActiveChannel,
    setActiveFilter,
    createCustomFolder,
    deleteCustomFolder,
  } = useDriveStore();

  const { logout } = useAuthStore();
  const { resetWizard } = useChannelWizardStore();

  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Compute category counts
  const counts = React.useMemo(() => {
    const c = {
      ALL: files.length,
      IMAGE: 0,
      VIDEO: 0,
      DOC: 0,
      ARCHIVE: 0,
      AUDIO: 0,
      PINNED: pinnedFileIds.size,
      FAVORITES: favoriteFileIds.size,
      RECENTS: Math.min(files.length, 25),
    };
    for (const f of files) {
      if (f.category === "IMAGE") c.IMAGE++;
      else if (f.category === "VIDEO") c.VIDEO++;
      else if (f.category === "DOC") c.DOC++;
      else if (f.category === "ARCHIVE") c.ARCHIVE++;
      else if (f.category === "AUDIO") c.AUDIO++;
    }
    return c;
  }, [files, pinnedFileIds, favoriteFileIds]);

  const totalIndexedBytes = React.useMemo(() => {
    return files.reduce((acc, f) => acc + (f.size || 0), 0);
  }, [files]);

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim()) {
      createCustomFolder(newFolderName.trim());
      setNewFolderName("");
      setIsNewFolderOpen(false);
    }
  };

  const getInitials = (title: string) => {
    if (!title) return "CH";
    const words = title.trim().split(/\s+/);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return title.slice(0, 2).toUpperCase();
  };

  const navItems: { id: NavFilter; label: string; icon: React.FC<any>; count: number }[] = [
    { id: "ALL", label: "All Files", icon: Files, count: counts.ALL },
    { id: "IMAGE", label: "Images", icon: Image, count: counts.IMAGE },
    { id: "VIDEO", label: "Videos", icon: Video, count: counts.VIDEO },
    { id: "DOC", label: "Documents", icon: FileText, count: counts.DOC },
    { id: "ARCHIVE", label: "Archives / ZIPs", icon: Archive, count: counts.ARCHIVE },
    { id: "AUDIO", label: "Audio", icon: Music, count: counts.AUDIO },
  ];

  const quickAccessItems: { id: NavFilter; label: string; icon: React.FC<any>; count?: number }[] = [
    { id: "PINNED", label: "Pinned", icon: Pin, count: counts.PINNED },
    { id: "FAVORITES", label: "Favorites", icon: Star, count: counts.FAVORITES },
    { id: "RECENTS", label: "Recent Uploads", icon: Clock, count: counts.RECENTS },
    { id: "DOWNLOADS", label: "Downloads Manager", icon: Download },
  ];

  return (
    <aside className="flex h-screen w-72 flex-col border-r border-zinc-800/80 bg-zinc-950 select-none">
      {/* ========================================================================= */}
      {/* ZONE A: TOP 25% HORIZONTAL CHANNEL CAROUSEL */}
      {/* ========================================================================= */}
      <div className="border-b border-zinc-800/80 p-3 pb-2.5">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="font-mono text-[10px] uppercase text-zinc-500 tracking-wider">
            Channels
          </span>
          <span className="font-mono text-[10px] text-zinc-600">
            {channels.length} synced
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {/* Unified View Tile (Always First) */}
          <button
            onClick={() => setActiveChannel("UNIFIED")}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs transition-all",
              activeChannelId === "UNIFIED"
                ? "bg-zinc-100 text-zinc-950 font-medium shadow-sm"
                : "bg-zinc-900/60 text-zinc-400 border border-zinc-800 hover:text-zinc-200 hover:border-zinc-700"
            )}
          >
            <Layers className="h-3.5 w-3.5 shrink-0 stroke-[1.5px]" />
            <span className="truncate max-w-[85px]">All Channels</span>
          </button>

          {/* Individual Channel Tiles */}
          {channels.map((ch) => {
            const isAct = activeChannelId === ch.id;
            return (
              <button
                key={ch.id}
                onClick={() => setActiveChannel(ch.id)}
                title={ch.title}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs transition-all",
                  isAct
                    ? "bg-zinc-100 text-zinc-950 font-medium shadow-sm"
                    : "bg-zinc-900/60 text-zinc-400 border border-zinc-800 hover:text-zinc-200 hover:border-zinc-700"
                )}
              >
                <div
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] text-[9px] font-mono",
                    isAct
                      ? "bg-zinc-900 text-zinc-100"
                      : "bg-zinc-800 text-zinc-300"
                  )}
                >
                  {ch.isSelf ? <Bookmark className="h-2.5 w-2.5" /> : getInitials(ch.title)}
                </div>
                <span className="truncate max-w-[85px]">{ch.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ZONE B: BOTTOM 75% NAVIGATION & SYSTEM DECK */}
      {/* ========================================================================= */}
      <ScrollArea className="flex-1 px-3 py-3">
        {/* Media Categories */}
        <div className="space-y-1">
          <span className="px-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            Categories
          </span>
          <div className="space-y-0.5 pt-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isAct = activeFilter === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveFilter(item.id)}
                  className={cn(
                    "flex h-8 w-full items-center justify-between px-2.5 rounded-sm text-xs transition-colors",
                    isAct
                      ? "bg-zinc-900 text-zinc-100 font-medium border border-zinc-800"
                      : "text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 stroke-[1.5px]" />
                    <span>{item.label}</span>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {item.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Access */}
        <div className="mt-5 space-y-1">
          <span className="px-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            Quick Access
          </span>
          <div className="space-y-0.5 pt-1">
            {quickAccessItems.map((item) => {
              const Icon = item.icon;
              const isAct = activeFilter === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveFilter(item.id)}
                  className={cn(
                    "flex h-8 w-full items-center justify-between px-2.5 rounded-sm text-xs transition-colors",
                    isAct
                      ? "bg-zinc-900 text-zinc-100 font-medium border border-zinc-800"
                      : "text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 stroke-[1.5px]" />
                    <span>{item.label}</span>
                  </div>
                  {item.count !== undefined && (
                    <span className="font-mono text-[10px] text-zinc-500">
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Virtual Folders */}
        <div className="mt-5 space-y-1">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Custom Folders
            </span>
            <button
              onClick={() => setIsNewFolderOpen(true)}
              className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200"
            >
              <Plus className="h-3 w-3 stroke-[1.75px]" />
              <span>New</span>
            </button>
          </div>

          <div className="space-y-0.5 pt-1">
            {Object.values(customFolders).length === 0 ? (
              <div className="px-2.5 py-1 text-[11px] text-zinc-600 font-mono">
                No custom folders
              </div>
            ) : (
              Object.values(customFolders).map((folder) => {
                const isAct = activeFilter === folder.id;
                return (
                  <div
                    key={folder.id}
                    className={cn(
                      "group flex h-8 w-full items-center justify-between px-2.5 rounded-sm text-xs transition-colors",
                      isAct
                        ? "bg-zinc-900 text-zinc-100 font-medium border border-zinc-800"
                        : "text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200"
                    )}
                  >
                    <button
                      onClick={() => setActiveFilter(folder.id)}
                      className="flex flex-1 items-center gap-2 text-left truncate"
                    >
                      <Folder className="h-3.5 w-3.5 shrink-0 stroke-[1.5px]" />
                      <span className="truncate">{folder.name}</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCustomFolder(folder.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity p-0.5"
                    >
                      <Trash2 className="h-3 w-3 stroke-[1.5px]" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </ScrollArea>

      {/* ========================================================================= */}
      {/* PINNED SYSTEM FOOTER */}
      {/* ========================================================================= */}
      <div className="border-t border-zinc-800/80 p-3 bg-zinc-950/80 space-y-3">
        {/* Storage Inspector */}
        <div className="space-y-1 rounded-sm border border-zinc-800/60 bg-zinc-900/40 p-2.5">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-zinc-400 flex items-center gap-1.5">
              <HardDrive className="h-3 w-3 text-zinc-500" />
              Indexed Storage
            </span>
            <span className="text-zinc-200 font-medium">
              {formatBytes(totalIndexedBytes)}
            </span>
          </div>
          <div className="h-1 w-full bg-zinc-800 rounded-none overflow-hidden">
            <div
              className="h-full bg-zinc-400 transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.max(5, (files.length / 200) * 100))}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
            <span>{files.length} items cataloged</span>
            <span>Local Cache</span>
          </div>
        </div>

        {/* Connection Status & Control Deck */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-mono text-zinc-400">Connected</span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => resetWizard()}
              title="Reconfigure Channels"
              className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 stroke-[1.5px]" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logout()}
              title="Logout"
              className="h-7 w-7 text-zinc-400 hover:text-red-400"
            >
              <LogOut className="h-3.5 w-3.5 stroke-[1.5px]" />
            </Button>
          </div>
        </div>
      </div>

      {/* New Folder Modal */}
      <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
        <DialogContent className="sm:max-w-[340px] border-zinc-800 bg-zinc-950">
          <DialogHeader>
            <DialogTitle className="text-sm">Create Virtual Folder</DialogTitle>
            <DialogDescription className="text-xs">
              Group files together locally without modifying Telegram chats.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateFolder} className="space-y-3 pt-2">
            <Input
              type="text"
              placeholder="e.g. Movies, Physics Notes"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
              className="bg-zinc-900 border-zinc-800 text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsNewFolderOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-xs">
                Create Folder
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
};
