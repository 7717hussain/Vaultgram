# Vaultgram — Current State & Active Milestone

## 1. Active Milestone
**Milestone:** Pure Client-Side MTProto + MSE Streaming Pipeline (Zero Backend & Daemon Deprecation).
**Active Focus:** Browser-native MP4Box demuxing, MediaSource segmenting, random keyframe seeking, and live stream telemetry.

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
| **Pure-Browser MSE Video Player** | Verified | Direct browser-native streaming over WebSockets via `TelegramRangeReader`, progressive ISO-BMFF fragmentation via `Mp4DemuxSegmenter`, serialized SourceBuffer append queue via `MseStreamController`, and live diagnostic HUD (`video-player-modal.tsx`). |
| **Transfer Queue Dock** | Verified | Floating dock with active task counters, aggregate progress bar, speed/ETA in Geist Mono, and per-task abort/cancel (`transfer-dock.tsx`, `transfer-store.ts`). |

---

## 3. Important Architectural Files

- [`src/lib/telegram/client.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/client.ts): MTProto WebSocket client, DC connection gateways, QR/Phone auth state machine.
- [`src/lib/telegram/session.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/session.ts): Typed IndexedDB persistence for sessions, config, channels, and batch file caches.
- [`src/lib/telegram/indexer.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/indexer.ts): Iterative media indexer with non-blocking delays and `DriveFile` normalizer.
- [`src/lib/telegram/syncStore.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/syncStore.ts): Zero-backend cloud config sync using private Telegram system channel.
- [`src/lib/telegram/transfer/uploader.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/transfer/uploader.ts): 4-worker MTProto chunked file uploader with cancellation and live progress.
- [`src/lib/telegram/transfer/downloader.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/transfer/downloader.ts): 4-worker parallel MTProto chunk downloader with ordered assembly.
- [`src/lib/telegram/streaming/telegram-range-reader.ts`](file:///home/hussain/Frontend%20JEE/src/lib/telegram/streaming/telegram-range-reader.ts): 4KB-aligned MTProto range transport with multi-DC pooling and token auto-refresh.
- [`src/lib/streaming/mp4-demux-segmenter.ts`](file:///home/hussain/Frontend%20JEE/src/lib/streaming/mp4-demux-segmenter.ts): In-browser ISO-BMFF box parser, moov header probe, and sample segmenter.
- [`src/lib/streaming/mse-stream-controller.ts`](file:///home/hussain/Frontend%20JEE/src/lib/streaming/mse-stream-controller.ts): MediaSource/SourceBuffer controller with serialized appends and backpressure loop.
- [`src/components/drive/video-player-modal.tsx`](file:///home/hussain/Frontend%20JEE/src/components/drive/video-player-modal.tsx): Pure-browser video preview modal with telemetry HUD, custom controls, and download fallback.

---

## 4. Current Verification State

- **Daemon Status:** Completely eliminated from runtime application. Zero backend dependencies.
- **TypeScript Typecheck (`npx tsc --noEmit`):** Clean (0 errors, exit code 0).
- **Production Build (`npm run build`):** Clean (Built in ~10.8s, output in `dist/`).
- **Runtime Environment:** Dev server running on `http://localhost:5173/`.

---

## 5. Last Significant Changes
1. **Pure-Browser MSE Streaming Engine:** Completely replaced the local Node.js daemon with in-browser `TelegramRangeReader`, `Mp4DemuxSegmenter`, and `MseStreamController`.
2. **In-Flight Token Auto-Healing:** Added automatic `FILE_REFERENCE_EXPIRED` recovery directly inside the browser transport layer, seamlessly re-fetching message locations without interrupting the playback stream.
3. **Live Stream Telemetry HUD:** Integrated real-time network throughput, forward buffer seconds, active MTProto requests, and MIME/codec indicators into the video preview modal.
