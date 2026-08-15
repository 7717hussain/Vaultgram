import React, { useMemo, useState, useRef } from "react";
import { useDriveStore } from "@/lib/stores/drive-store";
import { useTransferStore } from "@/lib/stores/transfer-store";
import { DriveFile } from "@/lib/telegram/indexer";
import { DriveToolbar } from "./drive-toolbar";
import { FileGrid } from "./file-grid";
import { FileTable } from "./file-table";
import { MediaPreviewModal } from "./media-preview-modal";
import { VideoPlayerModal } from "./video-player-modal";
import { DropzoneOverlay } from "./dropzone-overlay";
import { UploadChannelSelectModal } from "./upload-channel-select-modal";
import { TransfersView } from "./transfers-view";
import { Inbox } from "lucide-react";
import { toast } from "sonner";

export const DriveCanvas: React.FC = () => {
  const {
    channels,
    activeChannelId,
    files,
    activeFilter,
    customFolders,
    pinnedFileIds,
    favoriteFileIds,
    searchQuery,
    viewMode,
    sortField,
    sortOrder,
    syncStatus,
    previewFile,
    setPreviewFile,
  } = useDriveStore();

  const { enqueueDownload, enqueueUpload } = useTransferStore();
  const hiddenFileInputRef = useRef<HTMLInputElement | null>(null);

  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [isChannelSelectOpen, setIsChannelSelectOpen] = useState(false);

  // 1. Filter Files based on active navigation category, folder, or search query
  const filteredFiles = useMemo(() => {
    let result = [...files];

    if (activeFilter === "IMAGE") {
      result = result.filter((f) => f.category === "IMAGE");
    } else if (activeFilter === "VIDEO") {
      result = result.filter((f) => f.category === "VIDEO");
    } else if (activeFilter === "DOC") {
      result = result.filter((f) => f.category === "DOC");
    } else if (activeFilter === "ARCHIVE") {
      result = result.filter((f) => f.category === "ARCHIVE");
    } else if (activeFilter === "AUDIO") {
      result = result.filter((f) => f.category === "AUDIO");
    } else if (activeFilter === "PINNED") {
      result = result.filter((f) => pinnedFileIds.has(f.id));
    } else if (activeFilter === "FAVORITES") {
      result = result.filter((f) => favoriteFileIds.has(f.id));
    } else if (customFolders[activeFilter]) {
      const folder = customFolders[activeFilter];
      result = result.filter((f) => folder.fileIds.includes(f.id));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.channelTitle.toLowerCase().includes(q) ||
          f.category.toLowerCase().includes(q)
      );
    }

    // 2. Sort Files
    return result.sort((a, b) => {
      let comparison = 0;
      if (sortField === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === "size") {
        comparison = a.size - b.size;
      } else {
        comparison = a.date - b.date;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [
    files,
    activeFilter,
    searchQuery,
    sortField,
    sortOrder,
    customFolders,
    pinnedFileIds,
    favoriteFileIds,
  ]);

  // Handle Drag and Drop Uploads
  const handleFilesDropped = (incoming: FileList | File[]) => {
    const droppedFiles = Array.from(incoming);
    if (!channels || channels.length === 0) {
      toast.error("No synced channels found. Please configure channels first.");
      return;
    }

    if (activeChannelId === "UNIFIED") {
      setPendingUploadFiles(droppedFiles);
      setIsChannelSelectOpen(true);
    } else {
      const activeChan = channels.find((c) => c.id === activeChannelId);
      if (activeChan) {
        for (const file of droppedFiles) {
          enqueueUpload(file, activeChan.id, activeChan.title);
        }
        toast.success(`Queued ${droppedFiles.length} file(s) for upload to ${activeChan.title}`);
      }
    }
  };

  const handleChannelSelectedForUpload = (selectedChannelId: string) => {
    const targetChan = channels.find((c) => c.id === selectedChannelId);
    if (!targetChan) return;

    for (const file of pendingUploadFiles) {
      enqueueUpload(file, targetChan.id, targetChan.title);
    }
    toast.success(`Queued ${pendingUploadFiles.length} file(s) for upload to ${targetChan.title}`);
    setPendingUploadFiles([]);
    setIsChannelSelectOpen(false);
  };

  const handleTriggerUpload = () => {
    if (hiddenFileInputRef.current) {
      hiddenFileInputRef.current.click();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files ? Array.from(e.target.files) : [];
    if (selected.length > 0) {
      handleFilesDropped(selected);
    }
    if (e.target) e.target.value = "";
  };

  const handleDownload = (file: DriveFile) => {
    enqueueDownload(file);
  };

  return (
    <main className="relative flex flex-1 flex-col h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Hidden File Input for Button Triggers */}
      <input
        ref={hiddenFileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Global Full-Screen Drag & Drop Overlay */}
      <DropzoneOverlay
        activeChannelTitle={
          activeChannelId === "UNIFIED"
            ? "All Channels (Unified)"
            : channels.find((c) => c.id === activeChannelId)?.title || "Active Channel"
        }
        onFilesDropped={handleFilesDropped}
      />

      {/* Channel Selection Modal for Uploads initiated in Unified View */}
      <UploadChannelSelectModal
        isOpen={isChannelSelectOpen}
        channels={channels}
        filesCount={pendingUploadFiles.length}
        onSelect={handleChannelSelectedForUpload}
        onCancel={() => {
          setIsChannelSelectOpen(false);
          setPendingUploadFiles([]);
        }}
      />

      {/* Top Toolbar (Hidden on Transfers view for dedicated header) */}
      {activeFilter !== "TRANSFERS" && <DriveToolbar onTriggerUpload={handleTriggerUpload} />}

      {/* Render Dedicated Transfers View if Selected */}
      {activeFilter === "TRANSFERS" ? (
        <TransfersView />
      ) : (
        /* Main Virtualized Content Area */
        <div className="flex-1 overflow-hidden p-5">
          {files.length === 0 && syncStatus.isSyncing ? (
            viewMode === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                  <div
                    key={i}
                    className="flex flex-col justify-between rounded-md border border-zinc-800/40 bg-zinc-900/20 p-3 h-[142px] animate-pulse"
                  >
                    <div className="h-8 w-8 rounded-sm bg-zinc-800/60" />
                    <div className="space-y-1">
                      <div className="h-3 w-3/4 rounded-sm bg-zinc-800/60" />
                      <div className="h-2 w-1/2 rounded-sm bg-zinc-800/40" />
                    </div>
                    <div className="h-2 w-full rounded-sm bg-zinc-800/30" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div
                    key={i}
                    className="h-10 w-full rounded-sm bg-zinc-900/20 border border-zinc-800/40 animate-pulse"
                  />
                ))}
              </div>
            )
          ) : filteredFiles.length === 0 ? (
            <div className="flex h-[420px] flex-col items-center justify-center gap-2.5 text-center text-zinc-500">
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400">
                <Inbox className="h-6 w-6 stroke-[1.25px]" />
              </div>
              <span className="text-xs font-semibold text-zinc-300">
                {searchQuery ? "No matching files" : "No files in this category"}
              </span>
              <p className="text-[11px] text-zinc-500 max-w-xs leading-relaxed">
                {searchQuery
                  ? "Try searching for a different keyword or check spelling."
                  : "Drag & drop files anywhere to upload directly to Telegram."}
              </p>
            </div>
          ) : viewMode === "grid" ? (
            <FileGrid files={filteredFiles} onDownload={handleDownload} />
          ) : (
            <FileTable files={filteredFiles} onDownload={handleDownload} />
          )}
        </div>
      )}

      {/* Video Streaming Modal (Vidstack + MTProto Service Worker Range Streaming) */}
      {previewFile?.category === "VIDEO" ? (
        <VideoPlayerModal
          file={previewFile}
          isOpen={!!previewFile}
          onClose={() => setPreviewFile(null)}
        />
      ) : (
        /* Image / Document Preview Lightbox Modal */
        <MediaPreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={handleDownload}
        />
      )}
    </main>
  );
};
