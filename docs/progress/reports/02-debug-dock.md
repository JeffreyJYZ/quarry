# Debug dock: resizable columns + frame keyboard nav

## Changes

- `src/ui/debug/dock/DebugDockBody.tsx`: replaced the fixed `dock-debug-grid` (CSS grid `34px 25% minmax(0,1fr) 24%`) with a flex row: 34px transport rail, Frames column (width state), `Splitter` (axis="x"), Variables column (flex:1), `Splitter` (axis="x", invert), Breakpoints column (width state). Widths held in a module-level store (`dock/dockWidths.ts`) so a tab switch keeps them.
- `src/ui/debug/dock/dockWidths.ts` (new): module-scoped frames/breakpoints widths + `useDebugDockWidths` hook, initialised once and persisted across remounts.
- `src/ui/debug/dock/dock-debug.css`: `.dock-debug-grid` now `display: flex` (was grid); rail pinned `flex: 0 0 34px`.
- `src/ui/debug/CallStackList.tsx`: ArrowUp/ArrowDown move focus and select the frame; Enter selects + opens the source line (preventDefault so the button click does not double-fire). Button refs tracked per index; active frame focused on stop change.

## Why

Fixed grid prevented resizing Frames/Variables/Breakpoints; frame list had no keyboard path. Splitter is the existing primitive, so reuse it. Widths in state (module-level because DebugDockBody unmounts on tab switch) avoids losing the user's layout. Enter preventDefault avoids the synthetic click that would re-run select+navigate.

## Verification

- `bun check` (typecheck)
- `bun test src/lib/debug`
- `bun run scripts/unstyled-classes.ts` (0)

## Left out

- Persisting widths to settings/preferences (not requested; state only).
- Watch sub-section resizing (only the three main columns).
- Focus ring styling beyond existing `.active`.
