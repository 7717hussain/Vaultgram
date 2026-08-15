import { create } from "zustand";
import { DriveFile } from "../telegram/indexer";
import {
  getSavedTransferTasks,
  saveTransferTasksToDb,
  getSavedTransferConcurrency,
  saveTransferConcurrencyToDb,
} from "../telegram/session";

export type TransferType = "UPLOAD" | "DOWNLOAD";
export type TransferStatus = "QUEUED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "FAILED";

export interface TransferTask {
  id: string; // unique task id
  fileId?: string; // DriveFile id if download
  fileName: string;
  fileSize: number;
  type: TransferType;
  status: TransferStatus;
  progress: number; // 0 to 100
  bytesTransferred: number;
  speed: string; // e.g. "4.2 MB/s"
  eta: string; // e.g. "1m 12s"
  channelId?: string;
  channelTitle?: string;
  mimeType?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
  abortController?: AbortController;
  rawFile?: File; // only for upload tasks
  rawDriveFile?: DriveFile; // only for download tasks
}

// Persistent representation stripped of in-memory objects (File, AbortController)
export type PersistentTransferRecord = Omit<TransferTask, "abortController" | "rawFile">;

interface TransferStoreState {
  tasks: TransferTask[];
  isOpen: boolean;
  maxConcurrentDownloads: 1 | 2;
  isHydrated: boolean;

  // Actions
  hydrateStore: () => Promise<void>;
  setMaxConcurrentDownloads: (concurrency: 1 | 2) => void;
  enqueueUpload: (file: File, channelId: string, channelTitle: string) => string;
  enqueueDownload: (driveFile: DriveFile) => string;
  pauseTask: (taskId: string) => void;
  resumeTask: (taskId: string) => void;
  retryTask: (taskId: string) => void;
  cancelTask: (taskId: string) => void;
  removeTask: (taskId: string) => void;
  clearCompleted: () => void;
  pauseAllActive: () => void;
  resumeAllPaused: () => void;
  setIsOpen: (open: boolean) => void;
  toggleOpen: () => void;
  updateTaskProgress: (
    taskId: string,
    progress: number,
    bytesTransferred: number,
    speed: string,
    eta: string
  ) => void;
  updateTask: (
    taskId: string,
    updates: Partial<Omit<TransferTask, "id">>
  ) => void;
  setTaskStatus: (taskId: string, status: TransferStatus, error?: string) => void;
  processQueue: () => void;
}

// Track actively executing task IDs in memory to avoid race conditions during async dispatch
const runningTaskIds = new Set<string>();

// Helper to save task ledger to IndexedDB without transient in-memory buffers
function persistLedger(tasks: TransferTask[]) {
  const records: PersistentTransferRecord[] = tasks.map((t) => {
    // If saving an active task on shutdown/reload, mark it as PAUSED
    const status = t.status === "ACTIVE" ? "PAUSED" : t.status;
    return {
      id: t.id,
      fileId: t.fileId,
      fileName: t.fileName,
      fileSize: t.fileSize,
      type: t.type,
      status,
      progress: t.progress,
      bytesTransferred: t.bytesTransferred,
      speed: "0 B/s",
      eta: "--",
      channelId: t.channelId,
      channelTitle: t.channelTitle,
      mimeType: t.mimeType,
      error: t.error,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
      rawDriveFile: t.rawDriveFile,
    };
  });
  saveTransferTasksToDb(records);
}

export const useTransferStore = create<TransferStoreState>((set, get) => ({
  tasks: [],
  isOpen: false,
  maxConcurrentDownloads: 1, // Default conservative 1 active download
  isHydrated: false,

  hydrateStore: async () => {
    if (get().isHydrated) return;
    try {
      const [savedConcurrency, savedRecords] = await Promise.all([
        getSavedTransferConcurrency(),
        getSavedTransferTasks<PersistentTransferRecord>(),
      ]);

      const restoredTasks: TransferTask[] = savedRecords.map((r) => ({
        ...r,
        speed: "0 B/s",
        eta: "--",
        abortController: new AbortController(),
      }));

      set({
        maxConcurrentDownloads: savedConcurrency,
        tasks: restoredTasks,
        isHydrated: true,
      });

      // Attempt to resume any queued tasks
      get().processQueue();
    } catch (e) {
      console.error("[TransferStore] Hydration error:", e);
      set({ isHydrated: true });
    }
  },

  setMaxConcurrentDownloads: (concurrency: 1 | 2) => {
    set({ maxConcurrentDownloads: concurrency });
    saveTransferConcurrencyToDb(concurrency);
    // If increased from 1 -> 2, immediately dispatch next queued item
    Promise.resolve().then(() => get().processQueue());
  },

  enqueueUpload: (file: File, channelId: string, channelTitle: string) => {
    const id = `up_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const task: TransferTask = {
      id,
      fileName: file.name,
      fileSize: file.size,
      type: "UPLOAD",
      status: "QUEUED",
      progress: 0,
      bytesTransferred: 0,
      speed: "0 B/s",
      eta: "--",
      channelId,
      channelTitle,
      mimeType: file.type,
      createdAt: Date.now(),
      rawFile: file,
      abortController: new AbortController(),
    };

    const newTasks = [task, ...get().tasks];
    set({ tasks: newTasks, isOpen: true });
    persistLedger(newTasks);
    Promise.resolve().then(() => get().processQueue());
    return id;
  },

  enqueueDownload: (driveFile: DriveFile) => {
    // If file is already queued or paused, switch to QUEUED and process
    const existing = get().tasks.find((t) => t.fileId === driveFile.id);
    if (existing) {
      if (existing.status === "PAUSED" || existing.status === "FAILED") {
        get().resumeTask(existing.id);
      }
      set({ isOpen: true });
      return existing.id;
    }

    const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const task: TransferTask = {
      id,
      fileId: driveFile.id,
      fileName: driveFile.name,
      fileSize: driveFile.size || 0,
      type: "DOWNLOAD",
      status: "QUEUED",
      progress: 0,
      bytesTransferred: 0,
      speed: "0 B/s",
      eta: "--",
      channelId: driveFile.channelId,
      channelTitle: driveFile.channelTitle,
      mimeType: driveFile.mimeType,
      createdAt: Date.now(),
      rawDriveFile: driveFile,
      abortController: new AbortController(),
    };

    const newTasks = [task, ...get().tasks];
    set({ tasks: newTasks, isOpen: true });
    persistLedger(newTasks);
    Promise.resolve().then(() => get().processQueue());
    return id;
  },

  pauseTask: (taskId: string) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (task.abortController) {
      try {
        task.abortController.abort("PAUSED");
      } catch (e) {
        console.warn("[TransferStore] Error aborting for pause:", e);
      }
    }

    runningTaskIds.delete(taskId);

    const updatedTasks = get().tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            status: "PAUSED" as TransferStatus,
            speed: "0 B/s",
            eta: "--",
            abortController: new AbortController(),
          }
        : t
    );

    set({ tasks: updatedTasks });
    persistLedger(updatedTasks);
    Promise.resolve().then(() => get().processQueue());
  },

  resumeTask: (taskId: string) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (!task) return;

    const updatedTasks = get().tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            status: "QUEUED" as TransferStatus,
            error: undefined,
            abortController: new AbortController(),
          }
        : t
    );

    set({ tasks: updatedTasks });
    persistLedger(updatedTasks);
    Promise.resolve().then(() => get().processQueue());
  },

  retryTask: (taskId: string) => {
    get().resumeTask(taskId);
  },

  cancelTask: (taskId: string) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (task && task.abortController) {
      try {
        task.abortController.abort("USER_CANCELED");
      } catch (e) {
        console.warn("[TransferStore] Error aborting task controller:", e);
      }
    }

    runningTaskIds.delete(taskId);

    const updatedTasks = get().tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            status: "FAILED" as TransferStatus,
            error: "Canceled by user",
            speed: "0 B/s",
            eta: "--",
          }
        : t
    );

    set({ tasks: updatedTasks });
    persistLedger(updatedTasks);
    Promise.resolve().then(() => get().processQueue());
  },

  removeTask: (taskId: string) => {
    get().cancelTask(taskId);
    const updatedTasks = get().tasks.filter((t) => t.id !== taskId);
    set({ tasks: updatedTasks });
    persistLedger(updatedTasks);
  },

  clearCompleted: () => {
    const updatedTasks = get().tasks.filter((t) => t.status !== "COMPLETED");
    set({ tasks: updatedTasks });
    persistLedger(updatedTasks);
  },

  pauseAllActive: () => {
    const activeTasks = get().tasks.filter((t) => t.status === "ACTIVE");
    for (const t of activeTasks) {
      get().pauseTask(t.id);
    }
  },

  resumeAllPaused: () => {
    const pausedTasks = get().tasks.filter((t) => t.status === "PAUSED");
    for (const t of pausedTasks) {
      get().resumeTask(t.id);
    }
  },

  setIsOpen: (open: boolean) => set({ isOpen: open }),
  toggleOpen: () => set({ isOpen: !get().isOpen }),

  updateTask: (taskId, updates) => {
    const current = get().tasks.find((t) => t.id === taskId);
    if (!current) return;

    if (updates.status === "COMPLETED" || updates.status === "FAILED") {
      runningTaskIds.delete(taskId);
    }

    const updatedTasks = get().tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            ...updates,
            completedAt:
              updates.status === "COMPLETED" ? Date.now() : t.completedAt,
          }
        : t
    );

    set({ tasks: updatedTasks });
    persistLedger(updatedTasks);

    if (updates.status === "COMPLETED" || updates.status === "FAILED") {
      Promise.resolve().then(() => get().processQueue());
    }
  },

  updateTaskProgress: (taskId, progress, bytesTransferred, speed, eta) => {
    const current = get().tasks.find((t) => t.id === taskId);
    if (!current || current.status !== "ACTIVE") return;

    set({
      tasks: get().tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              progress: Math.min(100, Math.max(0, Math.round(progress))),
              bytesTransferred,
              speed,
              eta,
            }
          : t
      ),
    });
  },

  setTaskStatus: (taskId, status, error) => {
    if (status === "COMPLETED" || status === "FAILED") {
      runningTaskIds.delete(taskId);
    }

    const updatedTasks = get().tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            status,
            error,
            progress: status === "COMPLETED" ? 100 : t.progress,
            completedAt: status === "COMPLETED" ? Date.now() : t.completedAt,
          }
        : t
    );

    set({ tasks: updatedTasks });
    persistLedger(updatedTasks);

    if (status === "COMPLETED" || status === "FAILED") {
      Promise.resolve().then(() => get().processQueue());
    }
  },

  processQueue: async () => {
    const { tasks, maxConcurrentDownloads } = get();

    // 1. Process Downloads (Limit strictly enforced by maxConcurrentDownloads)
    const activeDownloads = tasks.filter(
      (t) => t.type === "DOWNLOAD" && (t.status === "ACTIVE" || runningTaskIds.has(t.id))
    );
    const availableDownloadSlots = Math.max(0, maxConcurrentDownloads - activeDownloads.length);

    if (availableDownloadSlots > 0) {
      const queuedDownloads = tasks.filter(
        (t) => t.type === "DOWNLOAD" && t.status === "QUEUED" && !runningTaskIds.has(t.id)
      );

      for (let i = 0; i < Math.min(availableDownloadSlots, queuedDownloads.length); i++) {
        const nextDownload = queuedDownloads[i];
        runningTaskIds.add(nextDownload.id);

        set({
          tasks: get().tasks.map((t) =>
            t.id === nextDownload.id ? { ...t, status: "ACTIVE" } : t
          ),
        });

        import("../telegram/transfer/downloader")
          .then(({ executeDownloadTask }) => {
            executeDownloadTask(nextDownload).catch((err) => {
              console.error("[TransferStore] Downloader execution error:", err);
              get().setTaskStatus(nextDownload.id, "FAILED", err?.message || "Download error");
            });
          })
          .catch((importErr) => {
            console.error("[TransferStore] Failed to import downloader:", importErr);
            get().setTaskStatus(nextDownload.id, "FAILED", "Downloader module failed to load");
          });
      }
    }

    // 2. Process Uploads (Limit: 2 concurrent)
    const activeUploads = tasks.filter(
      (t) => t.type === "UPLOAD" && (t.status === "ACTIVE" || runningTaskIds.has(t.id))
    );
    const availableUploadSlots = Math.max(0, 2 - activeUploads.length);

    if (availableUploadSlots > 0) {
      const queuedUploads = tasks.filter(
        (t) => t.type === "UPLOAD" && t.status === "QUEUED" && !runningTaskIds.has(t.id)
      );

      for (let i = 0; i < Math.min(availableUploadSlots, queuedUploads.length); i++) {
        const nextUpload = queuedUploads[i];
        runningTaskIds.add(nextUpload.id);

        set({
          tasks: get().tasks.map((t) =>
            t.id === nextUpload.id ? { ...t, status: "ACTIVE" } : t
          ),
        });

        import("../telegram/transfer/uploader")
          .then(({ executeUploadTask }) => {
            executeUploadTask(nextUpload).catch((err) => {
              console.error("[TransferStore] Uploader execution error:", err);
              get().setTaskStatus(nextUpload.id, "FAILED", err?.message || "Upload error");
            });
          })
          .catch((importErr) => {
            console.error("[TransferStore] Failed to import uploader:", importErr);
            get().setTaskStatus(nextUpload.id, "FAILED", "Uploader module failed to load");
          });
      }
    }
  },
}));
