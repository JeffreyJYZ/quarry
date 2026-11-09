# consts-04: src/ui/components

Scope: tree, tabs, splitter, rail. Read-only scan.

## Magic numbers

- `src/ui/components/FileTreeIcons.tsx:17` — `indent(depth)` returns `paddingLeft: ${8 + depth * 12}px`. Layout fact (indent step + base). Belongs in stylesheet, not a TS constant; CSS padding-left per depth class would remove the inline style. Drift risk: high, paired with `.tree-row` padding in CSS.
- `src/ui/components/useReveal.ts:30` — `window.setTimeout(..., 1500)`. Reveal highlight duration. Candidate constant (`REVEAL_HIGHLIGHT_MS`). Drift risk: medium, UX timing.
- `src/ui/components/TreeRow.tsx:64` — `onMenu(entry, box.left + 12, box.bottom - 4)`. Keyboard menu anchor offsets. Layout-ish; better as CSS/const. Drift risk: medium.
- `src/ui/components/ContextMenu.tsx:37-39` — `window.innerWidth - box.width - 8` and `Math.max(8, ...)`. Viewport nudge margin. Drift risk: low, but duplicated literal 8.
- `src/ui/components/FileTypeIcon.tsx:22-24` — `width="12" height="12" viewBox="0 0 14 15"`. Icon geometry; belongs to SVG asset, not const. Drift risk: low.

## Repeated strings

- `src/ui/components/TreeRow.tsx:32-43` — `badgeFor` maps each git status to `"tree-badge <status>"` class; repeated `"tree-badge "` prefix. Minor; could template. Drift risk: low.
- `src/ui/components/TabStrip.tsx:50` — row class assembly `["tab", active ? "active" : "", confirming ? "confirming" : ""]`. Class-name convention; fine.
- `src/ui/components/TreeRow.tsx:67-75` — className ladder `"tree-row dir expanded"` etc. Could be a helper; not a const.

## Verdict

Nothing worth moving to `src/lib/consts` except the 1500 ms reveal delay, and even that is a UX timing, not a layout fact. The indent (`8 + depth * 12`) is a layout fact that belongs in a stylesheet, not a constant — flag for CSS, not consts. No other drift-prone magic numbers in this area.
