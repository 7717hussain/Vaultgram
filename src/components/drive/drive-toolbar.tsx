import React from "react";
import { useDriveStore } from "@/lib/stores/drive-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  LayoutGrid,
  List,
  ArrowUpDown,
  Upload,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DriveToolbarProps {
  onTriggerUpload: () => void;
}

export const DriveToolbar: React.FC<DriveToolbarProps> = ({ onTriggerUpload }) => {
  const {
    channels,
    activeChannelId,
    activeFilter,
    customFolders,
    searchQuery,
    viewMode,
    sortField,
    sortOrder,
    syncStatus,
    setSearchQuery,
    setViewMode,
    setSorting,
    refreshIndex,
  } = useDriveStore();

  const getChannelTitle = () => {
    if (activeChannelId === "UNIFIED") return "All Channels";
    const ch = channels.find((c) => c.id === activeChannelId);
    return ch?.title || "Channel";
  };

  const getCategoryLabel = () => {
    switch (activeFilter) {
      case "ALL":
        return "All Files";
      case "IMAGE":
        return "Images";
      case "VIDEO":
        return "Videos";
      case "DOC":
        return "Documents";
      case "ARCHIVE":
        return "Archives";
      case "AUDIO":
        return "Audio";
      case "PINNED":
        return "Pinned Items";
      case "FAVORITES":
        return "Favorites";
      case "RECENTS":
        return "Recent Uploads";
      default:
        return customFolders[activeFilter]?.name || "Folder";
    }
  };

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-zinc-950/90 px-4 backdrop-blur-md select-none">
      {/* Left: Breadcrumbs + Live Sync Indicator */}
      <div className="flex items-center gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-zinc-400">{getChannelTitle()}</span>
          <ChevronRight className="h-3.5 w-3.5 text-zinc-600 stroke-[1.5px]" />
          <span className="font-semibold text-zinc-100">{getCategoryLabel()}</span>
        </div>

        {/* Live Background Sync Status Pill */}
        {syncStatus.isSyncing && (
          <div className="ml-2 flex items-center gap-1.5 rounded-sm bg-zinc-900 border border-zinc-800/80 px-2 py-0.5 text-[10px] font-mono text-zinc-400 animate-pulse">
            <RefreshCw className="h-2.5 w-2.5 animate-spin text-zinc-300" />
            <span className="truncate max-w-[200px]">{syncStatus.statusText}</span>
          </div>
        )}
      </div>

      {/* Center: Search input */}
      <div className="w-72 max-w-sm">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500 stroke-[1.5px]" />
          <Input
            type="text"
            placeholder="Search files in active view..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-zinc-900/60 border-zinc-800 rounded-md placeholder:text-zinc-500 focus:border-zinc-700"
          />
        </div>
      </div>

      {/* Right: Controls & Upload */}
      <div className="flex items-center gap-2">
        {/* Refresh Index Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => refreshIndex()}
          disabled={syncStatus.isSyncing}
          title="Refresh Channel Index"
          className="h-8 w-8 text-zinc-400 hover:text-zinc-100"
        >
          <RefreshCw
            className={cn(
              "h-3.5 w-3.5 stroke-[1.5px]",
              syncStatus.isSyncing && "animate-spin text-zinc-200"
            )}
          />
        </Button>

        {/* Sort Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-zinc-800 bg-zinc-900/60 text-xs text-zinc-300 hover:text-zinc-100"
            >
              <ArrowUpDown className="h-3 w-3 stroke-[1.5px]" />
              <span className="capitalize">
                {sortField} ({sortOrder.toUpperCase()})
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => setSorting("date")}>
              <span>Date {sortField === "date" ? `(${sortOrder.toUpperCase()})` : ""}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSorting("name")}>
              <span>Name {sortField === "name" ? `(${sortOrder.toUpperCase()})` : ""}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSorting("size")}>
              <span>Size {sortField === "size" ? `(${sortOrder.toUpperCase()})` : ""}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* View Toggle (Grid / List) */}
        <div className="flex items-center rounded-md border border-zinc-800 bg-zinc-900/60 p-0.5">
          <button
            onClick={() => setViewMode("grid")}
            title="Grid View"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-sm transition-all",
              viewMode === "grid"
                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5 stroke-[1.5px]" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            title="List View"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-sm transition-all",
              viewMode === "list"
                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <List className="h-3.5 w-3.5 stroke-[1.5px]" />
          </button>
        </div>

        {/* Upload File CTA */}
        <Button
          onClick={onTriggerUpload}
          size="sm"
          className="h-8 gap-1.5 bg-zinc-100 text-zinc-950 font-medium text-xs rounded-md shadow-sm"
        >
          <Upload className="h-3.5 w-3.5 stroke-[1.75px]" />
          <span>Upload File</span>
        </Button>
      </div>
    </header>
  );
};
