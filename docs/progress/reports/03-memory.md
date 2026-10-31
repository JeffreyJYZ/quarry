# Memory pane fixes

Scope: `src/ui/debug/memory/**`, `src/lib/debug/memory/**`. CSS under `src/ui/debug/memory/`.

## Changes

- Range selection + Copy + value strip (`MemoryCell.tsx`, `useMemoryEdit.ts`, `useMemoryClipboard.ts`, `MemoryPane.tsx`, `MemoryValueView.tsx`).
    - `useMemoryEdit.select` already supported shift-click via `useMemoryRange`; added drag: mousedown starts a range, mouseenter while pressed extends it, so dragging across bytes selects a contiguous range (`onRangeStart`/`onRangeExtend` in `useMemoryEdit`).
    - `useMemoryClipboard.copyHex` now copies the selected range bytes as space-separated hex when a range is selected, otherwise the whole page (prior behaviour).
    - `MemoryPane` interprets the range start in the value strip when no single byte is selected (`interpreted` useMemo).
- Address history dropdown (`useMemoryHistory.ts`, `AddressFields.tsx`, `MemoryToolbar.tsx`, `MemoryPane.tsx`).
    - `recordVisit` now dedups a re-visited address anywhere in the list (not only the tail) before appending, capped at 20.
    - `AddressFields` renders a "recent…" `<select>` populated from `history`, picking an entry navigates directly.
- Persist row width / page size within the session (`parts.ts`, `MemoryPane.tsx`).
    - `storedRowWidth`/`storeRowWidth` and `storedPageSize`/`storePageSize` backed by `sessionStorage`, mirroring the problems pane pattern. `MemoryPane` initialises from them and writes on change, so a tab switch or stop no longer resets the choice.

## Rejected

- Disassembly double-click → memory pane: no clean seam. The disassembly is an editor split (`EditorStage`) while the memory pane lives in the debug dock; wiring it needs app-shell edits outside this area. Implemented only the in-pane part: `DisasmList` scrolls the active row into view so the current instruction stays visible.
- Drag without mousedown anchor tracking across rows relied on `onMouseEnter`; cells already render as buttons, so no new DOM needed.

## Verification

- `bun check`
- `bun test src/lib/debug`
- `bun run scripts/unstyled-classes.ts` (0)
