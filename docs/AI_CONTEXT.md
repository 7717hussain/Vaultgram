# AI Context Optimization & pxpipe Evaluation

This document outlines the context compression mechanisms, evaluation of external tooling (such as `pxpipe`), and targeted retrieval practices for Vaultgram.

---

## 1. Evaluation of `pxpipe`

### A. What is `pxpipe`?
`pxpipe` (by Team Chong: https://github.com/teamchong/pxpipe) is an open-source local proxy tool that compresses verbose textual context into rendered image pages before forwarding requests to LLM provider APIs (Anthropic Messages API, OpenAI/Google-compatible endpoints). It leverages multimodal vision processing to achieve 30–70% input token reductions on large reference payloads.

### B. Compatibility with Antigravity
- **Transport Architecture:** Antigravity operates as an agentic IDE/CLI communicating directly through DeepMind / Google internal tool execution protocols.
- **Proxy Injection:** Antigravity manages its own API transport and credentials internally. Inserting an arbitrary local HTTP proxy into the CLI transport path requires manual transport interception that is not natively exposed by default Antigravity settings.
- **Precision Requirements:** `pxpipe` employs lossy visual rendering. While suitable for large unstructured text logs or broad documentation, it carries potential lossiness for:
  - Exact file paths and line number references (`src/lib/telegram/client.ts#L230`)
  - MTProto method names and TL schema definitions (`Api.upload.GetFile`)
  - Binary hashes and numeric DC credentials
- **Verdict:** **Requires Manual Opt-In (Developer Discretion)**. For typical Antigravity turns, Vaultgram's file-based persistent memory (`AGENTS.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`) combined with targeted tool calls (`grep_search`, `view_file` with precise line ranges) provides a faster, 100% lossless, and zero-overhead token reduction.

---

## 2. Best Practices for Targeted Retrieval

To minimize token consumption without external proxies:

1. **Symbol & Grep Queries:** Use `grep_search` with exact query strings and file extensions (e.g. `Includes: ["*.ts", "*.tsx"]`) rather than listing or reading full directories.
2. **Precise Slice Reading:** Use `view_file` with `StartLine` and `EndLine` to read only the target method or component (max 40–80 lines) rather than dumping 500+ lines.
3. **No Redundant Repetition:** Rely on `CURRENT_STATE.md` and `ARCHITECTURE.md` as shared state rather than repeating architectural summaries in prompts.
4. **Local Snapshot:** Run `npm run ai:context` to generate a compact, secret-free metadata snapshot of the repository when onboarding a fresh agent.
