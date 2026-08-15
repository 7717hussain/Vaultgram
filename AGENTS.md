# Vaultgram — Permanent Agent Directives

## 1. Project Identity & Purpose
**Vaultgram** is a browser-native, zero-backend personal cloud storage dashboard powered directly by Telegram's MTProto API over WebSockets.

---

## 2. Technology Stack
- **Framework & Core:** React 18+ (Strict TypeScript), Vite
- **Styling:** Tailwind CSS v3.4 (Standard v3 config), `tailwindcss-animate`
- **UI Primitives:** Radix UI primitives (`shadcn/ui` aesthetic), `lucide-react`
- **Typography:** `Geist Sans` & `Geist Mono`
- **State Management:** Zustand 5 (Modular stores)
- **Persistence:** IndexedDB (`idb-keyval`) for session, channels, and file indexes
- **Telegram Engine:** GramJS MTProto client (`telegram` npm package) over WebSocket (`ConnectionWebSocketObfuscated`)
- **Hosting Target:** Cloudflare Pages (Static SPA)

---

## 3. Architectural Constraints
- **Zero Backend:** All execution happens 100% client-side in the browser. Never introduce an intermediary server or database.
- **Telegram as Media Engine:** Files and metadata are stored on Telegram channels/chats. No bot-token architecture is used—everything runs via user MTProto sessions.
- **MTProto Browser Compatibility:** Maintain browser-compatible imports and polyfills (`Buffer`, `crypto`, `stream`). Never import raw Node.js runtime bindings.

---

## 4. Security & Safety Rules
- **No Unsafe Execution:** No `eval()`, `Function()`, or `dangerouslySetInnerHTML`.
- **Media Preview Sandboxing:** Untrusted SVG, HTML, or code previews must be rendered in sandboxed iframes or isolated text components.
- **Blob Lifecycle Management:** Always revoke generated Blob URLs with `URL.revokeObjectURL(url)` in a `finally` block or delayed cleanup to prevent memory leaks.
- **Memory Safety:** Avoid monolithic `ArrayBuffer` allocations for gigabyte-scale files. Use bounded chunk streaming (`512 KB` MTProto chunks).
- **Strict Content Security Policy:** Preserve headers and security isolation required for Cloudflare Pages (`public/_headers`).

---

## 5. Development & Git Guardrails
- **Localhost Only:** Run and test exclusively on `http://localhost:5173/`.
- **CRITICAL GIT RULE:** **NEVER execute `git commit`, `git push`, or trigger CI/CD autonomously** unless the user explicitly requests it with exact command syntax in prompt text.

---

## 6. Monochrome Industrial Design System
- **Surfaces & Depth:** `bg-zinc-950` / `bg-black` base with subtle radial vignettes and `bg-zinc-900/40` card surfaces.
- **Borders & Radii:** Hairline borders (`border-zinc-800/80`, `border-white/[0.08]`). Micro-radii strictly (`rounded-sm` [2px] to `rounded-md` [6px] max). Never use bubble/toy `rounded-2xl` or `rounded-3xl` corners.
- **Typography & Data:** High information density, `Geist Sans` for UI copy, `Geist Mono` for telemetry, sizes, hashes, and timestamps.

---

## 7. Engineering Standards
- **Strict Typing:** Never use `any` to silence TypeScript errors. Use narrow types, interfaces, or adapter mappers.
- **Verified APIs:** Check installed library versions (`node_modules/`) rather than guessing APIs.
- **Accurate Lifecycles:** Distinguish network completion from browser completion (e.g. MTProto transfer complete vs `link.click()` browser download trigger).
- **Accurate Classification:** Distinguish bounded chunked transfer from true streaming.
- **Resilience:** Handle `FLOOD_WAIT_X`, cancellations (`AbortController`), and network timeouts gracefully.

---

## 8. AI Context & Operating Policy
- **Context is a scarce engineering resource:** Prefer retrieving 5 relevant files over dumping 100 irrelevant files. Prefer repository state over conversation history. Prefer summaries for historical information and exact source text for code that will be modified.
- **Reading Order for New Sessions:**
  1. Read `AGENTS.md` (this file).
  2. Read `CURRENT_STATE.md` for active milestones and verification state.
  3. Read `ARCHITECTURE.md` when working across subsystems.
  4. Read `DECISIONS.md` before making architectural changes.
- **Source of Truth:** Treat source code as the implementation truth.
- **Targeted Retrieval:** Use symbol searches and targeted `grep` calls instead of loading entire directories.
- **Maintenance:** Update `CURRENT_STATE.md` after major milestones; add an ADR to `DECISIONS.md` when durable architectural decisions are made.
