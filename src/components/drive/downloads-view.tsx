import React, { useState, useMemo } from "react";
import { useTransferStore, TransferTask } from "@/lib/stores/transfer-store";
import { formatBytes, cn } from "@/lib/utils";
import {
  Download,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Sliders,
  Search,
  FileText,
  Video,
  Image,
  Archive,
  Music,
  File,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type StatusFilter = "ALL" | "ACTIVE" | "QUEUED" | "PAUSED" | "COMPLETED" | "FAILED";

const FILTER_TABS: { id: StatusFilter; label: string }[] = [
  { id: "ALL", label: "All Transfers" },
  { id: "ACTIVE", label: "Active" },
  { id: "QUEUED", label: "Queued" },
  { id: "PAUSED", label: "Paused" },
  { id: "COMPLETED", label: "Completed" },
  { id: "FAILED", label: "Failed" },
];

export const DownloadsView: React.FC = () => {
  const {
    tasks,
    maxConcurrentDownloads,
    setMaxConcurrentDownloads,
    pauseTask,
    resumeTask,
    retryTask,
    removeTask,
    clearCompleted,
    pauseAllActive,
    resumeAllPaused,
    enqueueDownload,
  } = useTransferStore();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const downloadTasks = useMemo(() => {
    return tasks.filter((t) => t.type === "DOWNLOAD");
  }, [tasks]);

  const activeCount = downloadTasks.filter((t) => t.status === "ACTIVE").length;
  const queuedCount = downloadTasks.filter((t) => t.status === "QUEUED").length;
  const pausedCount = downloadTasks.filter((t) => t.status === "PAUSED").length;
  const completedCount = downloadTasks.filter((t) => t.status === "COMPLETED").length;
  const failedCount = downloadTasks.filter((t) => t.status === "FAILED").length;

  const tabCounts: Record<StatusFilter, number> = {
    ALL: downloadTasks.length,
    ACTIVE: activeCount,
    QUEUED: queuedCount,
    PAUSED: pausedCount,
    COMPLETED: completedCount,
    FAILED: failedCount,
  };

  const filteredTasks = useMemo(() => {
    let result = downloadTasks;

    if (statusFilter !== "ALL") {
      result = result.filter((t) => t.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((t) => t.fileName.toLowerCase().includes(q));
    }

    return result;
  }, [downloadTasks, statusFilter, searchQuery]);

  const getFileIcon = (mime?: string) => {
    if (!mime) return File;
    if (mime.startsWith("image/")) return Image;
    if (mime.startsWith("video/")) return Video;
    if (mime.startsWith("audio/")) return Music;
    if (mime.includes("pdf") || mime.includes("document") || mime.includes("text")) return FileText;
    if (mime.includes("zip") || mime.includes("tar") || mime.includes("rar")) return Archive;
    return File;
  };

  const handleRedownload = (task: TransferTask) => {
    if (task.rawDriveFile) {
      enqueueDownload(task.rawDriveFile);
      toast.success(`Re-download enqueued: ${task.fileName}`);
    } else {
      toast.error("Original file metadata not available for re-download");
    }
  };

  return (
    <div className="flex flex-1 flex-col h-full bg-zinc-950 text-zinc-100 overflow-hidden select-none">
      {/* Streamlined Header Section */}
      <div className="flex flex-col gap-3.5 border-b border-zinc-800/80 px-6 py-4 bg-zinc-950/95 backdrop-blur-sm">
        {/* Top Row: Title + Concurrency Segmented Control + Batch Actions */}
        <div className="flex items-center justify-between">
          {/* Clean Title & Count */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-zinc-900 border border-zinc-800 text-zinc-200">
              <Download className="h-4 w-4 stroke-[1.75px]" />
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-zinc-100">Downloads</h1>
              <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
                {downloadTasks.length} Total
              </span>
            </div>
          </div>

          {/* Controls & Batch Actions */}
          <div className="flex items-center gap-2.5">
            {/* Minimalist Concurrency Segmented Control */}
            <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-md border border-zinc-800">
              <span className="text-xs font-mono text-zinc-400 pl-1.5 pr-0.5 flex items-center gap-1">
                <Sliders className="h-3 w-3" />
                <span>Concurrency:</span>
              </span>
              <button
                onClick={() => setMaxConcurrentDownloads(1)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                  maxConcurrentDownloads === 1
                    ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60 font-mono"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                1 Active <span className="text-[10px] text-zinc-500 font-normal">(Recommended)</span>
              </button>
              <button
                onClick={() => setMaxConcurrentDownloads(2)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                  maxConcurrentDownloads === 2
                    ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60 font-mono"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                2 Active
              </button>
            </div>

            {/* Batch Controls */}
            {activeCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={pauseAllActive}
                className="h-8 gap-1.5 border-zinc-800 bg-zinc-900/60 text-xs text-zinc-300 hover:text-zinc-100"
              >
                <Pause className="h-3.5 w-3.5" />
                <span>Pause All ({activeCount})</span>
              </Button>
            )}

            {pausedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={resumeAllPaused}
                className="h-8 gap-1.5 border-zinc-800 bg-zinc-900/60 text-xs text-zinc-300 hover:text-zinc-100"
              >
                <Play className="h-3.5 w-3.5" />
                <span>Resume All ({pausedCount})</span>
              </Button>
            )}

            {completedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearCompleted}
                className="h-8 gap-1.5 border-zinc-800 bg-zinc-900/60 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear Completed</span>
              </Button>
            )}
          </div>
        </div>

        {/* Bottom Row: Filter Tabs & Search Bar */}
        <div className="flex items-center justify-between gap-4 pt-1">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {FILTER_TABS.map((tab) => {
              const count = tabCounts[tab.id];
              return (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5",
                    statusFilter === tab.id
                      ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60 shadow-sm"
                      : "text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-300"
                  )}
                >
                  <span>{tab.label}</span>
                  <span className="font-mono text-[10px] opacity-70">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500 stroke-[1.5px]" />
            <Input
              type="text"
              placeholder="Search downloads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-3 text-xs bg-zinc-900/90 border-zinc-800 rounded-md placeholder:text-zinc-500 focus:border-zinc-700"
            />
          </div>
        </div>
      </div>

      {/* Task List Canvas */}
      <div className="flex-1 overflow-y-auto p-6 space-y-2.5">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/50 text-zinc-500 mb-3">
              <Download className="h-6 w-6 stroke-[1.25px]" />
            </div>
            <h3 className="text-sm font-medium text-zinc-300">No downloads found</h3>
            <p className="text-xs text-zinc-500 max-w-xs mt-1">
              {statusFilter === "ALL"
                ? "Your transfer ledger is clear. Download files from any connected channel to manage them here."
                : `No downloads matching filter "${statusFilter.toLowerCase()}".`}
            </p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const Icon = getFileIcon(task.mimeType);

            return (
              <div
                key={task.id}
                className="group flex items-center justify-between gap-4 rounded-md border border-zinc-800/60 bg-zinc-900/30 p-3.5 hover:bg-zinc-900/60 hover:border-zinc-800 transition-all"
              >
                {/* Left: Icon & File Meta */}
                <div className="flex items-center gap-3 min-w-0 max-w-md">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-zinc-950 border border-zinc-800 text-zinc-300">
                    <Icon className="h-4 w-4 stroke-[1.5px]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-medium text-zinc-100" title={task.fileName}>
                        {task.fileName}
                      </span>
                      {task.channelTitle && (
                        <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded-[2px] bg-zinc-900 border border-zinc-800/80 text-zinc-400">
                          {task.channelTitle}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 mt-0.5">
                      <span>{formatBytes(task.fileSize)}</span>
                      <span>•</span>
                      <span>{new Date(task.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      {task.error && (
                        <>
                          <span>•</span>
                          <span className="text-rose-400 truncate max-w-[200px]" title={task.error}>
                            {task.error}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Center: Progress & Live Metrics */}
                <div className="flex flex-1 max-w-md flex-col gap-1.5 px-4">
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                    <span>
                      {formatBytes(task.bytesTransferred)} / {formatBytes(task.fileSize)}
                    </span>
                    <div className="flex items-center gap-2">
                      {task.status === "ACTIVE" && (
                        <>
                          <span className="text-zinc-200">{task.speed}</span>
                          <span>•</span>
                          <span>{task.eta}</span>
                          <span>•</span>
                        </>
                      )}
                      <span className="text-zinc-100 font-semibold">{Math.round(task.progress)}%</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-1.5 w-full bg-zinc-950 rounded-none overflow-hidden border border-zinc-800/40">
                    <div
                      className={cn(
                        "h-full transition-all duration-200",
                        task.status === "PAUSED"
                          ? "bg-amber-500"
                          : task.status === "COMPLETED"
                          ? "bg-emerald-500"
                          : task.status === "FAILED"
                          ? "bg-rose-500"
                          : "bg-zinc-100"
                      )}
                      style={{ width: `${Math.max(1, task.progress)}%` }}
                    />
                  </div>
                </div>

                {/* Right: Status Pill & Action Buttons */}
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={cn(
                      "font-mono text-[10px] px-2 py-0.5 rounded-sm uppercase tracking-wider",
                      task.status === "ACTIVE"
                        ? "border border-zinc-700 bg-zinc-800 text-zinc-100 animate-pulse"
                        : task.status === "PAUSED"
                        ? "border border-amber-500/30 bg-amber-500/10 text-amber-400"
                        : task.status === "COMPLETED"
                        ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : task.status === "FAILED"
                        ? "border border-rose-500/30 bg-rose-500/10 text-rose-400"
                        : "border border-zinc-800 bg-zinc-900 text-zinc-500"
                    )}
                  >
                    {task.status}
                  </span>

                  {/* Actions according to status */}
                  <div className="flex items-center gap-1">
                    {task.status === "ACTIVE" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => pauseTask(task.id)}
                        title="Pause Download"
                        className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                      >
                        <Pause className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    {task.status === "PAUSED" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => resumeTask(task.id)}
                        title="Resume Download"
                        className="h-7 w-7 text-amber-400 hover:text-amber-300 hover:bg-zinc-800"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    {task.status === "FAILED" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => retryTask(task.id)}
                        title="Retry Download"
                        className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    {task.status === "COMPLETED" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRedownload(task)}
                        title="Re-download File"
                        className="h-7 text-xs font-mono text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 px-2"
                      >
                        Save Again
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTask(task.id)}
                      title="Remove from Ledger"
                      className="h-7 w-7 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
