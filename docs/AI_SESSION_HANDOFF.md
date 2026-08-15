# Session Handoff & Continuity Guide

This document enables future AI coding sessions to resume engineering without needing to reconstruct context from truncated historical logs.

---

## 1. Session Continuity Template

When completing a major task or preparing for a context reset, verify the state against this template:

### Current Task
*Brief 1-sentence summary of the task just addressed.*

### What Changed
*Concise bullet points of engineering modifications.*

### Files Modified
*Explicit list of file paths.*

### Verification
- `npx tsc --noEmit` result (PASS/FAIL)
- `npm run build` result (PASS/FAIL)
- Local runtime verification on `http://localhost:5173/`

### Remaining Issues / Next Step
*Specific, actionable item from `TODO.md`.*

---

## 2. Fast-Start Guide for New AI Sessions

For any new agent turn:
1. **Read Rules:** Read [`AGENTS.md`](file:///home/hussain/Frontend%20JEE/AGENTS.md) for non-negotiable project guardrails (no git commits, monochrome UI, zero-backend).
2. **Read State:** Read [`CURRENT_STATE.md`](file:///home/hussain/Frontend%20JEE/CURRENT_STATE.md) for the active milestone and file ownership map.
3. **Execute Targeted Search:** Use symbol queries or ripgrep (`grep_search`) rather than reading broad directory trees.
4. **Compile Check:** Always run `npx tsc --noEmit` and `npm run build` before finalizing any modification.
