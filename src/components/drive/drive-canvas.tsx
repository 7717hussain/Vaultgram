import React, { useMemo, useState, useRef } from "react";
import { useDriveStore } from "@/lib/stores/drive-store";
import { useTransferStore } from "@/lib/stores/transfer-store";
import { DriveFile } from "@/lib/telegram/indexer";
import { DriveToolbar } from "./drive-toolbar";
import { FileCard } from "./file-card";
import { FileTableRow } from "./file-table-row";
import { MediaPreviewModal } from "./media-preview-modal";
import { DropzoneOverlay } from "./dropzone-overlay";
import { UploadChannelSelectModal } from "./upload-channel-select-modal";
import { DownloadsView } from "./downloads-view";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Inbox, ChevronDown } from "lucide-react";
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
    renderPage,
    pageSize,
    loadMoreRenderItems,
    previewFile,
    setPreviewFile,
  } = useDriveStore();

  const { enqueueDownload, enqueueUpload } = useTransferStore();
  const hiddenFileInputRef = useRef<HTMLInputElement | null>(null);

  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [isChannelSelectOpen, setIsChannelSelectOpen] = useState(false);

  const getActiveChannelTitle = () => {
    if (activeChannelId === "UNIFIED") return "All Channels (Unified)";
    const ch = channels.find((c) => c.id === activeChannelId);
    return ch?.title || "Active Channel";
  };

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
    } else if (activeFilter === "RECENTS") {
      result = [...result].sort((a, b) => b.date - a.date).slice(0, 50);
    } else if (customFolders[activeFilter]) {
      const folder = customFolders[activeFilter];
      result = result.filter((f) => folder.fileIds.includes(f.id));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.mimeType.toLowerCase().includes(q) ||
          f.channelTitle.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === "name") {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      return sortOrder === "asc" ? valA - valB : valB - valA;
    });

    return result;
  }, [
    files,
    activeFilter,
    customFolders,
    pinnedFileIds,
    favoriteFileIds,
    searchQuery,
    sortField,
    sortOrder,
  ]);

  // 2. Windowed Progressive Slice for 10k+ Scale
  const visibleLimit = renderPage * pageSize;
  const visibleFiles = useMemo(() => {
    return filteredFiles.slice(0, visibleLimit);
  }, [filteredFiles, visibleLimit]);

  const hasMoreToRender = visibleFiles.length < filteredFiles.length;

  // 3. Initiate Chunked Stream Download
  const handleDownload = (file: DriveFile) => {
    enqueueDownload(file);
  };

  // 4. Handle Upload File Ingestion (From Button or Dropzone)
  const handleQueueFiles = (fileList: FileList | File[]) => {
    const fileArray = Array.from(fileList);
    if (fileArray.length === 0) return;

    if (activeChannelId === "UNIFIED") {
      setPendingUploadFiles(fileArray);
      setIsChannelSelectOpen(true);
    } else {
      const activeCh = channels.find((c) => c.id === activeChannelId);
      const chTitle = activeCh?.title || "Channel";
      for (const file of fileArray) {
        enqueueUpload(file, activeChannelId, chTitle);
      }
      toast.success(`Queued ${fileArray.length} file(s) for upload.`);
    }
  };

  const handleChannelSelectedForUpload = (channelId: string, channelTitle: string) => {
    setIsChannelSelectOpen(false);
    for (const file of pendingUploadFiles) {
      enqueueUpload(file, channelId, channelTitle);
    }
    toast.success(`Queued ${pendingUploadFiles.length} file(s) for upload to ${channelTitle}.`);
    setPendingUploadFiles([]);
  };

  const handleTriggerUpload = () => {
    hiddenFileInputRef.current?.click();
  };

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-zinc-950">
      {/* Hidden File Input */}
      <input
        ref={hiddenFileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            handleQueueFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />

      {/* Full-Window Drag and Drop Overlay */}
      <DropzoneOverlay
        activeChannelTitle={getActiveChannelTitle()}
        onFilesDropped={handleQueueFiles}
      />

      {/* Channel Selector for Unified View Uploads */}
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

      {/* Top Toolbar (Hidden on Downloads view for dedicated header) */}
      {activeFilter !== "DOWNLOADS" && <DriveToolbar onTriggerUpload={handleTriggerUpload} />}

      {/* Render Dedicated Downloads View if Selected */}
      {activeFilter === "DOWNLOADS" ? (
        <DownloadsView />
      ) : (
        /* Main Content Area */
        <ScrollArea className="flex-1 p-5">
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
        ) : (
          <div className="space-y-6">
            {viewMode === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {visibleFiles.map((file) => (
                  <FileCard key={file.id} file={file} onDownload={handleDownload} />
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-zinc-800/80 bg-zinc-950/60 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800/80 bg-zinc-900/50 font-mono text-[10px] text-zinc-400 uppercase tracking-wider">
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Channel Source</th>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 font-medium">Size</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleFiles.map((file) => (
                      <FileTableRow key={file.id} file={file} onDownload={handleDownload} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {hasMoreToRender && (
              <div className="flex flex-col items-center justify-center gap-2 py-4 border-t border-zinc-900">
                <span className="text-[11px] font-mono text-zinc-500">
                  Showing {visibleFiles.length} of {filteredFiles.length} files
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMoreRenderItems}
                  className="gap-1.5 border-zinc-800 bg-zinc-900/60 text-xs text-zinc-300 hover:text-zinc-100 rounded-sm"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  Load More Files
                </Button>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
      )}

      {/* Media Preview Lightbox Modal */}
      <MediaPreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onDownload={handleDownload}
      />
    </main>
  );
};
