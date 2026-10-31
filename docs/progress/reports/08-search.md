# 08-search

## Scope

Area only: src/ui/search/**, src/lib/search/**, src/ui/quickopen/**, src/lib/quickopen/**, src/ui/palette/**, src/ui/calls/**, src/ui/goto/**. No edits outside.

## Gaps picked

### Gap A — Quick open ranking + focus restore

- src/lib/quickopen/rank.ts: rankFiles gained optional context (recent paths + current file) so recently-opened and same-directory files rise. Backward compatible: rankFiles(paths, query) still works.
- src/ui/quickopen/useQuickOpen.ts: accept openPaths; pass recent + currentPath to rankFiles; save opener on mount and restore focus on unmount (Escape restores editor focus).
- src/ui/quickopen/QuickOpen.tsx: pass openPaths through.

### Gap B — Command palette disabled reason + recent dedup

- src/ui/palette/CommandPalette.tsx: Command gains disabledReason?: string; shown as hint/title; recents deduped in ordered useMemo and runCommand.

### Gap C — Search regex validation + keyboard consistency

- src/lib/search/model.ts: invalidQuery? Actually in parts.ts? Add regex validation in useSearchQuery? We'll add invalid handling for regex toggle. Also invalidQuery in parts.ts extended to validate regex when regex toggle on.
- Keyboard: Tab/Shift+Tab move in SearchHead, QuickOpen, Goto, CommandPalette; scroll into view already.

## Verification

- bun check
- bun test src/lib/search src/lib/quickopen
- bun run scripts/unstyled-classes.ts (0)

## Rejected ideas

- Auto-re-run search on toggle change: would spam backend; keep Enter to run, toggles persisted.
- Global recent store across quick open: already module-level recent array.
