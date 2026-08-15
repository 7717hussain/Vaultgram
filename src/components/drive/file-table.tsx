import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DriveFile } from "@/lib/telegram/indexer";
import { FileTableRow } from "./file-table-row";

interface FileTableProps {
  files: DriveFile[];
  onDownload: (file: DriveFile) => void;
}

export const FileTable: React.FC<FileTableProps> = ({ files, onDownload }) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44, // 44px row height (h-11)
    overscan: 10,
  });

  return (
    <div className="flex flex-col h-full rounded-sm border border-zinc-800/80 bg-zinc-950/60 overflow-hidden select-none">
      {/* Sticky Table Header */}
      <div className="flex h-9 w-full items-center border-b border-zinc-800/80 bg-zinc-900/50 font-mono text-[10px] text-zinc-400 uppercase tracking-wider px-3 shrink-0 rounded-t-sm">
        <div className="flex-1 min-w-0 pr-4">Name</div>
        <div className="w-36 shrink-0 px-2">Channel Source</div>
        <div className="w-24 shrink-0 px-2">Category</div>
        <div className="w-24 shrink-0 px-2">Size</div>
        <div className="w-28 shrink-0 px-2">Date</div>
        <div className="w-12 shrink-0 text-right">Actions</div>
      </div>

      {/* Virtualized Scrollable Body */}
      <div ref={parentRef} className="flex-1 overflow-y-auto w-full relative">
        <div
          className="w-full relative"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const file = files[virtualRow.index];
            if (!file) return null;

            return (
              <div
                key={file.id}
                className="absolute top-0 left-0 w-full"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <FileTableRow file={file} onDownload={onDownload} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
