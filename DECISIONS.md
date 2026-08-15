# Vaultgram — Architecture Decision Records (ADR)

This log records significant, durable architectural and engineering decisions made for Vaultgram.

---

## ADR-001: Zero-Backend Client-Side Execution
- **Context:** Cloud storage applications typically require an intermediary backend (Node.js/Go) to authenticate users and coordinate file storage.
- **Decision:** Execute 100% in the browser over secure WebSockets directly to Telegram MTProto gateways.
- **Consequences:** Eliminates server hosting and maintenance costs; guarantees total user privacy since keys and session tokens never leave the client device; requires browser polyfills for Node crypto/streams.

---

## ADR-002: Tailwind CSS v3.4 instead of Tailwind v4
- **Context:** Tailwind v4 introduced breaking configuration changes (`@theme` syntax) that caused compatibility quirks with standard Radix / `shadcn/ui` primitives and CSS variable tokens.
- **Decision:** Lock to Tailwind CSS v3.4.17 with PostCSS and `tailwindcss-animate`.
- **Consequences:** Rock-solid stability for dark-mode CSS variables, custom micro-radii tokens (`sm: 2px`, `DEFAULT: 4px`, `md: 6px`), and standard animation utilities.

---

## ADR-003: Multi-DC WebSocket Gateway Routing
- **Context:** Telegram uses 5 distinct Data Centers (DCs) globally. Connecting to an incorrect DC results in `MIGRATE_X` errors.
- **Decision:** Implement `TelegramBrowserWebSocket` with an explicit lookup map for official Telegram Web WSS endpoints (`pluto`, `venus`, `aurora`, `vesta`, `flora.web.telegram.org/apiws`) and pre-assign DC 4 for unauthenticated connections.
- **Consequences:** Instantaneous QR handshake without hanging connection timeouts.

---

## ADR-004: Dual-Zone Navigation with Unified Channel Aggregation
- **Context:** Users store files across multiple channels and their personal Saved Messages.
- **Decision:** Implement a dual-zone sidebar (Top 25% Zone A horizontal channel carousel; Bottom 75% Zone B category and folder tree) with a special `'UNIFIED'` view mode that aggregates files across all selected channels.
- **Consequences:** Gives users a single "Drive" experience while preserving granular per-channel access.

---

## ADR-005: Telegram Private System Channel for Zero-Backend Sync
- **Context:** Custom folders, favorites, pinned items, and sort preferences needed to persist across different devices/browsers without a database.
- **Decision:** Auto-discover or create a private broadcast channel (`"Vaultgram Vault (Do Not Delete)"`) tagged with `[VAULTGRAM_CONFIG_V1]` and store state in a pinned JSON configuration message with 3-second optimistic write debouncing.
- **Consequences:** True cross-device state synchronization with zero server dependencies.

---

## ADR-006: Mutex-Locked Idempotent Channel Discovery
- **Context:** React 18 StrictMode double-mounting in development created duplicate system channels when loading the app.
- **Decision:** Guard `initSystemChannel()` with a singleton in-memory promise lock (`initPromise`) and enforce a strict 3-step resolution order: (1) IndexedDB ID lookup ➔ (2) Dialog scan for title/tag ➔ (3) Create channel only if 0 matches exist.
- **Consequences:** Eliminates duplicate channel generation and survives hot-reloads seamlessly.

---

## ADR-007: Bounded Parallel MTProto Chunk Downloading (Architecture B)
- **Context:** Sequential single-worker chunking resulted in low throughput (~40 KB/s for video, ~300 KB/s for docs).
- **Decision:** Implement a bounded 4-worker parallel pool querying 512 KB chunks via `Api.upload.GetFile` with index-based array assembly (`orderedChunks[jobIndex]`), followed by typed `Blob` construction and delayed URL revocation (Architecture B).
- **Consequences:** Drastically increases download throughput to the network/DC limit while maintaining byte order and memory safety.
