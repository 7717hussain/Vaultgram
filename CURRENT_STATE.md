# Vaultgram — Current State & Active Milestone

## 1. Active Milestone
**Milestone:** Complete Client-Side Drive Infrastructure Hardening & AI Context System.
**Active Focus:** Parallel MTProto chunk download throughput, memory safety, and persistent repository context.

---

## 2. Completed Features & Subsystems

| Subsystem | Status | Key Components / Ownership |
| :--- | :--- | :--- |
| **Auth Portal (Stage 1)** | Verified | QR code instant login, Phone + OTP + SRP 2FA (`TwoFaDialog`), StringSession import, IndexedDB session caching (`session.ts`, `auth-store.ts`, `auth-portal.tsx`). |
| **Channel Wizard (Stage 2)** | Verified | Multi-channel selection, Saved Messages support, uniform channel rows, search filter, rate-limit recovery (`channel-wizard-store.ts`, `channel-wizard.tsx`). |
| **Dual-Zone Drive (Stage 3)** | Verified | Zone A (Top 25% horizontal carousel + Unified View), Zone B (Bottom 75% categories, quick access, custom folders), Main Canvas (Grid/List views, context menu, preview lightbox) (`sidebar.tsx`, `drive-canvas.tsx`, `drive-toolbar.tsx`, `drive-store.ts`). |
| **Deep Media Indexer** | Verified | Non-blocking iterative `offsetId` pagination loop (100 batch size), incremental top-sync (`minId`), 10k+ file windowing (`pageSize: 60`), IndexedDB file caching (`indexer.ts`). |
| **Zero-Backend Cloud Sync** | Verified | Automatic discovery/creation of private Telegram config channel (`[VAULTGRAM_CONFIG_V1]`), singleton promise mutex, 3-step idempotent resolution, 3s debounced optimistic write (`syncStore.ts`). |
| **Chunked Multi-Part Uploader** | Verified | Native browser `File` ingestion with 4 GramJS workers, sliding-window speed/ETA telemetry, full-window `DropzoneOverlay`, and `FLOOD_WAIT` countdown (`uploader.ts`, `dropzone-overlay.tsx`). |
| **Parallel Chunk Downloader** | Verified | 4-worker bounded MTProto pool (`Api.upload.GetFile`, 512 KB chunks), index-based ordered chunk storage, accurate `link.click()` lifecycle completion, and 10s auto-revoking Blob cleanup (`downloader.ts`). |
| **Transfer Queue Dock** | Verified | Floating dock with active task counters, aggregate progress bar, speed/ETA in Geist Mono, and per-task abort/cancel (`transfer-dock.tsx`, `transfer-store.ts`). |

---

## 3. Important Architectural Files

- [`src/lib/telegram/client.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/client.ts): MTProto WebSocket client, DC connection gateways, QR/Phone auth state machine.
- [`src/lib/telegram/session.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/session.ts): Typed IndexedDB persistence for sessions, config, channels, and batch file caches.
- [`src/lib/telegram/indexer.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/indexer.ts): Iterative media indexer with non-blocking delays and `DriveFile` normalizer.
- [`src/lib/telegram/syncStore.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/syncStore.ts): Zero-backend cloud config sync using private Telegram system channel.
- [`src/lib/telegram/transfer/uploader.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/transfer/uploader.ts): 4-worker MTProto chunked file uploader with cancellation and live progress.
- [`src/lib/telegram/transfer/downloader.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/transfer/downloader.ts): 4-worker parallel MTProto chunk downloader with ordered assembly.
- [`src/lib/stores/drive-store.ts`](file:///home/hussain/Frontend%20JEE/src/lib/stores/drive-store.ts): Global drive state (channels, filtering, sorting, virtual folders, progressive pagination).
- [`src/lib/stores/transfer-store.ts`](file:///home/hussain/Frontend%20JEE/src/lib/stores/transfer-store.ts): Transfer queue manager with concurrency limiting and task lifecycle state.

---

## 4. Current Verification State

- **TypeScript Typecheck (`npx tsc --noEmit`):** Clean (0 errors, exit code 0).
- **Production Build (`npm run build`):** Clean (Built in ~8.9s, output in `dist/`).
- **Known Vite Notices:** Standard browser-externalization warnings for `net`, `fs`, `constants`, `vm` originating from GramJS internal polyfills (safely handled by `vite-plugin-node-polyfills`).
- **Runtime Environment:** Dev server running on `http://localhost:5173/`.

---

## 5. Last Significant Changes
1. **Parallel Downloader Hardening:** Replaced serial `iterDownload` with 4-worker parallel `Api.upload.GetFile` requests (512 KB chunks). Fixed premature completion bug so the task transitions to `COMPLETED` and emits a toast **only after `link.click()` executes**.
2. **Idempotent Cloud Sync:** Fixed duplicate system channel creation by adding an in-memory mutex (`initPromise`) and a prioritized 3-step resolution order (IndexedDB ➔ Dialog Scan ➔ Auto-Create).
3. **Decoupled Session Auth:** MTProto session check is the single source of truth for login. Background sync and indexing errors no longer cause false logouts.
