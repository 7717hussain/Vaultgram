import React from "react";
import { useTransferStore, TransferTask } from "@/lib/stores/transfer-store";
import { useDriveStore } from "@/lib/stores/drive-store";
import {
  Upload,
  Download,
  X,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from "lucide-react";
import { formatBytes, cn } from "@/lib/utils";

export const TransferDock: React.FC = () => {
  const { tasks, isOpen, toggleOpen, cancelTask, clearCompleted } = useTransferStore();
  const { activeFilter } = useDriveStore();

  // If user is currently on the dedicated Downloads View, hide the floating dock completely
  if (activeFilter === "DOWNLOADS" || tasks.length === 0) {
    return null;
  }

  const activeUploads = tasks.filter((t) => t.type === "UPLOAD" && t.status === "ACTIVE").length;
  const activeDownloads = tasks.filter((t) => t.type === "DOWNLOAD" && t.status === "ACTIVE").length;
  const pausedCount = tasks.filter((t) => t.status === "PAUSED").length;
  const queuedCount = tasks.filter((t) => t.status === "QUEUED").length;
  const completedCount = tasks.filter((t) => t.status === "COMPLETED").length;

  const totalActive = activeUploads + activeDownloads;

  // Aggregate progress calculation
  const aggregateProgress =
    tasks.reduce((acc, t) => acc + (t.status === "COMPLETED" ? 100 : t.progress), 0) /
    (tasks.length || 1);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 sm:w-96 rounded-md border border-zinc-800/90 bg-zinc-950 shadow-2xl overflow-hidden select-none">
      {/* Dock Header Bar */}
      <div
        onClick={toggleOpen}
        className="flex h-10 w-full cursor-pointer items-center justify-between px-3 bg-zinc-900/90 hover:bg-zinc-900 border-b border-zinc-800/60 transition-colors"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {totalActive > 0 ? (
            <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-100">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-200"></span>
              </span>
              <span className="truncate">
                {activeUploads > 0 && `↑ ${activeUploads} Upload${activeUploads > 1 ? "s" : ""} `}
                {activeDownloads > 0 && `↓ ${activeDownloads} Download${activeDownloads > 1 ? "s" : ""}`}
                {queuedCount > 0 && ` (${queuedCount} queued)`}
                {pausedCount > 0 && ` [${pausedCount} paused]`}
              </span>
            </div>
          ) : pausedCount > 0 ? (
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span>{pausedCount} transfer{pausedCount > 1 ? "s" : ""} paused</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 stroke-[1.5px]" />
              <span>All transfers complete ({completedCount})</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {completedCount > 0 && totalActive === 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearCompleted();
              }}
              className="text-[11px] font-mono text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded-sm hover:bg-zinc-800 transition-colors"
            >
              Clear
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleOpen();
            }}
            className="p-1 text-zinc-400 hover:text-zinc-200"
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Aggregate Hairline Progress Bar when Collapsed */}
      {!isOpen && (totalActive > 0 || pausedCount > 0) && (
        <div className="h-0.5 w-full bg-zinc-900">
          <div
            className={cn(
              "h-full transition-all duration-300",
              pausedCount > 0 && totalActive === 0 ? "bg-amber-500" : "bg-zinc-300"
            )}
            style={{ width: `${Math.max(5, aggregateProgress)}%` }}
          />
        </div>
      )}

      {/* Expanded Transfer Task List */}
      {isOpen && (
        <div className="max-h-72 overflow-y-auto divide-y divide-zinc-900 bg-zinc-950 p-2 space-y-2">
          {tasks.map((task) => (
            <TransferTaskRow key={task.id} task={task} onCancel={() => cancelTask(task.id)} />
          ))}
        </div>
      )}
    </div>
  );
};

interface TransferTaskRowProps {
  task: TransferTask;
  onCancel: () => void;
}

const TransferTaskRow: React.FC<TransferTaskRowProps> = ({ task, onCancel }) => {
  const isUpload = task.type === "UPLOAD";

  return (
    <div className="group flex flex-col gap-1.5 rounded-sm bg-zinc-900/40 border border-zinc-800/40 p-2.5 transition-all">
      {/* Top Row: Icon + Name + Badge + Cancel */}
      <div className="flex items-center justify-between gap-2 overflow-hidden">
        <div className="flex items-center gap-2 overflow-hidden min-w-0">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-zinc-950 border border-zinc-800 text-zinc-300">
            {isUpload ? (
              <Upload className="h-3 w-3 stroke-[1.75px]" />
            ) : (
              <Download className="h-3 w-3 stroke-[1.75px]" />
            )}
          </div>
          <span className="truncate text-xs font-medium text-zinc-200" title={task.fileName}>
            {task.fileName}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={cn(
              "font-mono text-[9px] px-1.5 py-0.5 rounded-[2px] uppercase",
              task.status === "ACTIVE"
                ? "border border-zinc-700 bg-zinc-800 text-zinc-200"
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

          {task.status !== "COMPLETED" && (
            <button
              onClick={onCancel}
              title="Cancel Transfer"
              className="p-0.5 text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <X className="h-3.5 w-3.5 stroke-[1.5px]" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 w-full bg-zinc-900 rounded-none overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-200",
            task.status === "PAUSED"
              ? "bg-amber-500"
              : task.status === "COMPLETED"
              ? "bg-emerald-500"
              : task.status === "FAILED"
              ? "bg-rose-500"
              : "bg-zinc-200"
          )}
          style={{ width: `${Math.max(2, task.progress)}%` }}
        />
      </div>

      {/* Telemetry Line */}
      <div className="flex items-center justify-between font-mono text-[10px] text-zinc-500">
        <span className="text-zinc-400">
          {formatBytes(task.bytesTransferred)} / {formatBytes(task.fileSize)}
        </span>

        {task.status === "ACTIVE" && (
          <div className="flex items-center gap-2 text-zinc-400">
            <span>{task.speed}</span>
            <span>•</span>
            <span>{task.eta}</span>
          </div>
        )}

        {task.status === "PAUSED" && (
          <span className="text-amber-400 font-medium">Paused</span>
        )}

        {task.status === "COMPLETED" && (
          <span className="text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="h-2.5 w-2.5" /> 100%
          </span>
        )}

        {task.status === "FAILED" && (
          <span className="text-rose-400 truncate max-w-[120px]">
            {task.error || "Failed"}
          </span>
        )}

        {task.status === "QUEUED" && <span>Waiting in queue...</span>}
      </div>
    </div>
  );
};
