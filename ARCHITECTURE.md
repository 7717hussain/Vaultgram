# Vaultgram — System Architecture

This document is an engineering reference for the core subsystems, data pipelines, state managers, and communication boundaries of Vaultgram.

---

## 1. High-Level Flow Architecture

```
[ Telegram MTProto Gateway ] (WSS / DC 1-5)
            │
            ▼
┌────────────────────────────────────────────────────────┐
│                   Stage 1: Auth Portal                 │
│  - QR Login / Phone OTP / 2FA SRP / StringSession     │
│  - Storage: IndexedDB (`vaultgram_session_string`)     │
└───────────────────────────┬────────────────────────────┘
                            │ (Authenticated)
                            ▼
┌────────────────────────────────────────────────────────┐
│              Stage 2: Channel Setup Wizard             │
│  - Fetch User Dialogs (Channels, Supergroups, Saved)   │
│  - User Selection -> IndexedDB                         │
└───────────────────────────┬────────────────────────────┘
                            │ (Channels Selected)
                            ▼
┌────────────────────────────────────────────────────────┐
│             Stage 3: Drive Workspace & Canvas          │
├───────────────────────────┬────────────────────────────┤
│   Dual-Zone Navigation    │      Main Canvas Area      │
│  - Zone A: Channel Tabs   │  - Grid / Dense List View  │
│  - Zone B: Categories &   │  - Windowed Chunking (60)  │
│    Custom Virtual Folders │  - Right-Click Context     │
├───────────────────────────┴────────────────────────────┤
│                  Background Subsystems                 │
│  ┌───────────────────────┐  ┌───────────────────────┐  │
│  │ Deep Media Indexer    │  │ Zero-Backend Sync     │  │
│  │ - 100-msg offset loop │  │ - Telegram System Ch  │  │
│  │ - minId forward sync  │  │ - 3s Debounced Coalesc│  │
│  └───────────────────────┘  └───────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Transfer Engine & Floating Dock                  │  │
│  │ - 4-Worker MTProto Upload (`CustomFile` stream)  │  │
│  │ - 4-Worker MTProto Download (`GetFile` chunks)   │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Core Subsystems

### A. Authentication & Session Recovery
- **Entry Point:** [`src/lib/telegram/client.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/client.ts) / [`src/lib/stores/auth-store.ts`](file:///home/hussain/Frontend%20JEE/src/lib/stores/auth-store.ts)
- **State Owner:** `useAuthStore` (`bootStatus: 'BOOTING' | 'AUTHENTICATED' | 'UNAUTHENTICATED'`)
- **Persistence:** IndexedDB via `idb-keyval` (`vaultgram_session_string`, `vaultgram_user_profile`)
- **Mechanism:** WebSocket connection via `ConnectionWebSocketObfuscated`. Empty sessions pre-connect to DC 4 (`149.154.167.91:443`). SRP password computation handled by `computeCheck`.
- **Failure Boundary:** If session validation fails on boot, `bootStatus` moves cleanly to `UNAUTHENTICATED`. Background sync/indexing failures do **not** affect auth state.

---

### B. Media Indexing & 10k+ DOM Scale
- **Entry Point:** [`src/lib/telegram/indexer.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/indexer.ts)
- **State Owner:** `useDriveStore` (`files`, `channelFilesCache`, `syncStatus`)
- **Persistence:** IndexedDB (`vaultgram_files_ch_<channelId>`)
- **Data Pipeline:**
  1. **Instant Cold Cache:** Loads cached `DriveFile[]` immediately from IndexedDB.
  2. **Incremental Forward Sync:** Queries `client.getMessages(channel, { minId: highestKnownId })` to pull only new messages.
  3. **Deep Historical Pagination:** Iterative `offsetId` loop (100 batch size) with non-blocking microtask yields (`60ms`) to maintain 60 FPS UI rendering.
  4. **Progressive Windowing:** UI renders in chunked batches (`pageSize: 60`, `renderPage`), preventing DOM crashes when viewing 10,000+ files.

---

### C. Zero-Backend Cloud Sync
- **Entry Point:** [`src/lib/telegram/syncStore.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/syncStore.ts)
- **State Owner:** `useDriveStore` (`customFolders`, `pinnedFileIds`, `favoriteFileIds`, `viewMode`, `sortField`)
- **Persistence:** Private Telegram system channel titled `"Vaultgram Vault (Do Not Delete)"` containing tag `[VAULTGRAM_CONFIG_V1]`.
- **Idempotency & Mutex:** Singleton in-memory promise lock (`initPromise`) ensures concurrent mounts (e.g. React 18 StrictMode) share the same in-flight bootstrap.
- **Resolution Hierarchy:**
  1. Check IndexedDB cached channel ID ➔ `client.getEntity()`.
  2. If missing, scan user dialogs for title/tag (binds to existing channel if multiple exist).
  3. Create channel **only if 0 matches exist**, saving the ID immediately before posting/pinning config.
- **Write Coalescing:** 3-second optimistic debounce worker that calls `messages.editMessage` on the pinned config message.

---

### D. Multi-Part Upload Engine
- **Entry Point:** [`src/lib/telegram/transfer/uploader.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/transfer/uploader.ts)
- **State Owner:** `useTransferStore` (`tasks: TransferTask[]`)
- **Mechanism:** Passes native browser `File` to `client.uploadFile` with 4 concurrent worker threads.
- **Telemetry:** Sliding 500ms window measuring real instantaneous byte transfers (`MB/s` and dynamic `ETA`).
- **Post-Upload Ingestion:** Calls `client.sendFile()`, normalizes the message into a `DriveFile`, appends it to Zustand state, and saves to IndexedDB.
- **Cancellation:** Aborts via `task.abortController` and sets `progressCallback.isCanceled = true` to raise `USER_CANCELED` inside the GramJS loop.

---

### E. Parallel MTProto Download Engine
- **Entry Point:** [`src/lib/telegram/transfer/downloader.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/transfer/downloader.ts)
- **State Owner:** `useTransferStore`
- **Architecture Classification:** **Architecture B (Bounded parallel chunk network transfer + in-memory typed Blob assembly).**
- **Worker Pool:** 4 parallel workers consuming atomic indices (`nextJobIndex++`).
- **MTProto Request:** `Api.upload.GetFile({ location, offset, limit: 512 * 1024, precise: true })` over target DC sender.
- **Order Preservation:** Chunks are saved to pre-allocated `orderedChunks[jobIndex]` array.
- **Lifecycle Boundary:** Task remains `ACTIVE` throughout download, chunk verification, and Blob construction. Transitions to `COMPLETED` and shows toast **only after `link.click()` executes**.
- **Memory Cleanup:** Guaranteed URL revocation (`URL.revokeObjectURL(blobUrl)`) in `finally` block after a 10-second grace window.

---

## 3. Core Data Contracts

### `DriveFile` Representation
```typescript
interface DriveFile {
  id: string; // `${channelId}_${messageId}`
  messageId: number;
  channelId: string;
  channelTitle: string;
  name: string;
  size: number;
  date: number; // Unix timestamp
  mimeType: string;
  category: 'IMAGE' | 'VIDEO' | 'DOC' | 'ARCHIVE' | 'AUDIO' | 'OTHER';
  streamUrl?: string;
  thumbnailUrl?: string;
  accessHash?: string;
}
```

### `VaultgramCloudConfig` Payload
```typescript
interface VaultgramCloudConfig {
  version: 1;
  lastUpdated: number;
  selectedChannelIds: string[];
  pinnedFileIds: string[];
  favoriteFileIds: string[];
  customFolders: {
    id: string;
    name: string;
    fileIds: string[];
    createdAt?: number;
  }[];
  preferences: {
    defaultViewMode: 'GRID' | 'LIST';
    sortBy: 'DATE_DESC' | 'DATE_ASC' | 'SIZE_DESC' | 'NAME_ASC';
  };
}
```
