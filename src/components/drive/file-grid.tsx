import React, { useRef, useState, useEffect, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DriveFile } from "@/lib/telegram/indexer";
import { FileCard } from "./file-card";

interface FileGridProps {
  files: DriveFile[];
  onDownload: (file: DriveFile) => void;
}

const MIN_CARD_WIDTH = 190;
const CARD_GAP = 12; // gap-3 = 12px
const ROW_HEIGHT = 142 + CARD_GAP; // 142px card height + gap

export const FileGrid: React.FC<FileGridProps> = ({ files, onDownload }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);

  // Compute responsive columns dynamically from container width
  useEffect(() => {
    const updateColumns = () => {
      if (!parentRef.current) return;
      const width = parentRef.current.clientWidth;
      const computed = Math.max(1, Math.floor((width + CARD_GAP) / (MIN_CARD_WIDTH + CARD_GAP)));
      setColumns(computed);
    };

    updateColumns();

    const observer = new ResizeObserver(() => {
      updateColumns();
    });

    if (parentRef.current) {
      observer.observe(parentRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Partition files into rows of length `columns`
  const rows = useMemo(() => {
    const result: DriveFile[][] = [];
    for (let i = 0; i < files.length; i += columns) {
      result.push(files.slice(i, i + columns));
    }
    return result;
  }, [files, columns]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-full w-full overflow-y-auto select-none p-1">
      <div
        className="w-full relative"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowFiles = rows[virtualRow.index];
          if (!rowFiles) return null;

          return (
            <div
              key={virtualRow.index}
              className="absolute top-0 left-0 w-full grid gap-3"
              style={{
                height: `${virtualRow.size - CARD_GAP}px`,
                transform: `translateY(${virtualRow.start}px)`,
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              {rowFiles.map((file) => (
                <FileCard key={file.id} file={file} onDownload={onDownload} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
