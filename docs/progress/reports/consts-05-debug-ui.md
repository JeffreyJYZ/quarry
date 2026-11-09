# consts-05: `src/ui/debug/**`

## Findings

- `src/ui/debug/memory/parts.ts:1-57` plus `src/lib/consts/memory.ts:4-22`: memory module already centralised (`ROW_BYTES`, `DEFAULT_PAGE`, `PAGE_SIZES`). Keep.
- `src/ui/debug/dock/dockWidths.ts:4-5`: module-scoped editor layout mutables (`framesWidth = 260`, `breakpointsWidth = 240`) — UI detail; fine as-is, keep the explanatory comment.
- `src/ui/debug/VariablesTree.tsx:98`: indent step `row.depth * 10` (px) — UI detail, belongs with theme/CSS, not data.
- `src/ui/debug/ProcessPicker.tsx:9`: `CACHE_MS = 10_000` — UI detail (process list cache), keep local.
- `src/ui/debug/ProcessPicker.tsx:73,111,175`: `setTimeout(..., 0)` attach race + `120` ms close delay — UI detail; the `120` could be named (`BLUR_CLOSE_MS`).
- `src/ui/debug/memory/useMemoryClipboard.ts:26`: `2000` ms copied timer — UI detail.
- `src/ui/debug/dock/TransportRail.tsx:147-163`: step kind literals `"next"`, `"stepIn"`, `"stepOut"` — protocol-ish but already typed as `StepKind` in `src/lib/debug/sessionTypes.ts:14` and `src/lib/project/api/dap.ts:57`; UI only consumes. No duplication.
- `src/ui/debug/memory/MemoryPane.tsx` uses `CHUNK_BYTES = 256` (`src/lib/consts/memory.ts:13`) — adapter chunk geometry, already named.
- `src/ui/debug/DebugDockBody.tsx:29`: `view.frames[0]` as default top frame — default-thread/frame convention is DAP protocol territory and belongs next to DAP types in `src/lib/debug` or `src/lib/project/api/dap-types.ts`, not in the dock component.
- No repeated hex/label strings or DAP thread/frame default numbers elsewhere in `src/ui/debug`; labels are copy, not protocol.

## Verdict

Mostly already centralised; only incidental UI detail (indent `10`, close delay `120`, clipboard `2000`, module-scoped widths) remains. No protocol constants live in `src/ui/debug`. Nothing worth moving beyond optionally naming the 120 ms blur delay.
