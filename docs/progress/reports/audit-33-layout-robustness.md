# Audit 33 — Layout Robustness

## P1: `.body` has no minimum width, so rail + canvas + terminal can squeeze the editor below 200 px

`src/ui/styles/1-root.css:178` `.body { flex: 1 1 auto; min-width: 0; }`. With `--rail-width` 160–560 and `--terminal-width` 240–900 both flexing, the canvas `min-width: 0` (`src/ui/styles/3-tree-badge.css:73`) lets the editor column collapse to 0. Add `min-width: 900px` (or `min-width: calc(160px + 200px + 240px)`) to `.body`, or enforce `min-width` on `.canvas`.

## P2: Fixed 380 px titlebar region overflows below ~1000 px windows

`src/ui/styles/20-menubar/1-titlebar-nodrag.css:108` `width: 380px;`. On a 900 px window this leaves < 200 px for the editor. Change to `max-width: 380px` with `flex: 0 1 380px` and `min-width: 0`, or hide it under a media query.

## P2: `.recent-list` min-width 260 px can overflow a narrow window

`src/ui/styles/11-recent-trigger.css:10` `min-width: 260px;` on an absolutely positioned list. Below ~300 px it spills past the viewport. Change to `min(260px, calc(100vw - 16px))` or add `max-width: 100vw`.

## P3: scrollbar hidden on `.tabstrip` / `.breadcrumb`

`src/ui/styles/3-tree-badge.css:90-92,111-113` set `::-webkit-scrollbar { height: 0; }`. Horizontal overflow is real (tabstrip can hold many tabs) but invisible. Either keep hidden intentionally and document, or expose a 6 px scrollbar.

## P3: dock collapsed state stored as `null` "follow default", so a restored `false` is indistinguishable from unset

`src/ui/app/usePanels.ts:15` `panelOpen` starts `null`; restore sets it from `settings.dockExpanded ?? null` (`useSessionPersistence.ts:58`). A saved `dockExpanded: false` round-trips to `false` (fine), but `true` is applied. No observed break, but the ternary `panels.panelOpen ?? false` (`useShell.ts:130`) means an explicit `false` and an unset value render identically. Consider a tri-state with a separate "hasStored" flag if the distinction matters.

## Checked, no issue

- Dock splitter enforces `min={120}` (`BottomDock.tsx:45`), so it cannot be dragged to zero; reopen path exists via `onToggleExpanded`.
- Rail width clamped 160–560 (`AppBody.tsx:83-84`); terminal 240–900; outline 80–600. All via `clampPanel`.
- `.canvas` uses `min-width: 0` and `flex: 1 1 auto`, so it shrinks rather than pushing layout.
- `railCollapsed` and `gitOpen` restore and write back through `sessionSettings.ts`.
