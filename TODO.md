# Vaultgram — Prioritized Engineering Roadmap

## 1. NOW (Active Milestone)
- [x] Parallel MTProto chunk download throughput optimization (4 workers, 512 KB chunks).
- [x] Accurate download completion lifecycle (toast & state transition only after `link.click()`).
- [x] Memory-safe Blob lifecycle management (10s auto-revocation in `finally` block).
- [x] AI Context and token-efficiency subsystem implementation (`AGENTS.md`, `CURRENT_STATE.md`, etc.).

---

## 2. NEXT (Upcoming 2–5 Tasks)
1. **Direct Stream Bridge (Architecture A Exploration):**
   - Explore bridging `iterDownload` chunks directly to the `showSaveFilePicker()` WritableStream (File System Access API) for files >1.5 GB to enable zero-RAM disk writes on supported Chromium browsers.
2. **Video Audio Seek Scrubbing:**
   - Enhance the `MediaPreviewModal` video player with range-request chunk streaming so users can scrub large MP4 videos instantly without downloading the entire file.
3. **Cloudflare Pages Production Optimization:**
   - Audit and enforce strict security headers and CSP rules in `public/_headers` for the `vaultgram.pages.dev` deployment target.

---

## 3. LATER (Deferred Enhancements)
- **Folder Batch Operations:** Bulk move/delete operations for multiple selected files in the main canvas.
- **Client-Side File Encryption:** Optional user-passphrase AES-GCM encryption layer applied to chunk buffers before MTProto transmission.
- **Offline Mode Indicator:** Visual indicator when WebSocket connection drops and auto-reconnect countdown.

---

## 4. KNOWN RISKS & TECHNICAL DEBT
- **Browser Memory for >1.5 GB Single-File Downloads:** Because downloads use Architecture B (in-memory Blob assembly), files approaching 2 GB in low-RAM browser tabs may cause memory pressure.
- **GramJS Node Polyfills in Vite Build:** Vite produces build warnings for externalized Node modules (`net`, `fs`, `constants`, `vm`). These are standard for GramJS browser builds and safely polyfilled.
