# Audit: keyboard-only use of the explorer (FileTree)

Scope: `src/ui/components/FileTree.tsx`, `TreeLevel.tsx`, `TreeRow.tsx`, `useFileTree.ts`, `useReveal.ts`.

## Findings

- **P1 — No arrow-key navigation.** `TreeRow.tsx` `onKeyDown` is only `openMenuFromKeyboard` (ContextMenu / Shift+F10). No `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight` anywhere in the four files; Tab moves DOM order only, no selection model. `src/ui/components/TreeRow.tsx:60-65,91`.
- **P1 — Right/Left do not expand/collapse.** Toggle is wired only to `onClick` (`TreeRow.tsx:86`); `onToggle` never invoked from keyboard. `src/ui/components/TreeRow.tsx:86`.
- **P2 — Enter/Space only work incidentally.** Rows are native `<button>` (`TreeRow.tsx:79-92`), so Enter/Space fire `onClick` (toggle/open). No explicit handling and no focus management; if focus leaves the button nothing happens. `src/ui/components/TreeRow.tsx:79-92`.
- **P2 — F2 rename not wired.** `handleAction(...,"rename")` exists (`useFileTree.ts:120-121`) but is reachable only via `TreeContextMenu` (`TreeContextMenu.tsx:44`). No keydown path calls it. `src/ui/components/useFileTree.ts:110-127`.
- **P2 — Delete not wired.** Same as F2: `handleAction(...,"delete")` -> `setDeleteConfirm` (`useFileTree.ts:122-123`) only via context menu. No Delete/Backspace keydown. `src/ui/components/useFileTree.ts:110-127`.
- **P2 — Focus does not follow selection after reveal/reload.** `useReveal.ts:34-36` calls `scrollIntoView` only, never `.focus()`. `highlightedPath` is cleared after 1500 ms (`useReveal.ts:29-32`) with no focus move, so the revealed row is scrolled into view but keyboard focus stays (or leaves the tree). `src/ui/components/useReveal.ts:29-36`.
- **P3 — No roving tabindex / focus contract.** All rows render default `tabIndex` (none set), so Tab visits every row and there is no single tab stop; `aria-expanded` is set on dirs (`TreeRow.tsx:85`) but no `aria-selected`/`aria-activedescendant`. `src/ui/components/TreeRow.tsx:79-85`.

## Cleared

- ContextMenu key (ContextMenu / Shift+F10) opens the row menu at the row edge (`TreeRow.tsx:59-65`). Enter on rename input commits (`TreeLevel.tsx:124-128`); Escape cancels.
- No wrong-row action after reload observed: reveal targets `[data-path=...]` with `CSS.escape` (`useReveal.ts:35`); paths are unique. No evidence of acting on a stale row.

## Net

Keyboard-only explorer use is effectively unsupported beyond incidental Enter/Space on a focused button. Implement roving focus + arrow/Right/Left/Enter/F2/Delete handling, and move focus in `useReveal`.
