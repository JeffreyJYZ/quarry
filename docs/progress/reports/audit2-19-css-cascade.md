# Audit: CSS cascade (src/ui)

## P1 — `.notice` is redefined across three sheets; only the last one's layout wins

- `src/ui/styles/1-root.css:140` defines `.notice` as in-flow (display flex, padding 5px 14px 5px 82px, border-bottom, background panel).
- `src/ui/styles/11-recent-trigger.css:162` redefines `.notice { flex: 0 0 auto; }`.
- `src/ui/styles/13-refs-row.css:44` redefines `.notice` as `position: absolute; top: 38px; left/right 0; z-index 40; margin 0; padding 6px 14px 6px 82px; …`.

Cascade order in `src/ui/styles.css` puts 13 last, so the floating/absolute behaviour wins and the 1-root in-flow padding (5px) is silently dropped in favour of 6px. The absolute positioning is intended (13's comment), but the same selector carrying three different roles across three sheets means a reorder or removal of 13 reverts notices to in-flow with no compile-time signal. Consolidate `.notice` into one owner (13) and delete the 1-root/11 fragments, keeping only the delta that is genuinely shared.

## P2 — `.titlebar`, `.shell`, `.editor-pane`, `.statusbar`, `.status-left` each split across sheets; cascade order is load-bearing

Same pattern, smaller blast radius:

- `.titlebar`: `1-root.css:87` (base) + `10-debug-var-indent.css:173` (`flex: 0 0 auto`). 10 is imported after 1-root, so titlebar gets the flex guard; reordering breaks the layout guard.
- `.shell`: `1-root.css:77` (flex column) + `13-refs-row.css:40` (`position: relative`). 13 must stay after 1-root.
- `.editor-pane`: `4-tab-confirm-name.css:70` (row, flex 1 1 auto) + `11-recent-trigger.css:170` (flex 1 1 auto, min-height 0). 11 must stay after 4.
- `.statusbar`: `4-tab-confirm-name.css:165` (grid) + `11-recent-trigger.css:166` (flex 0 0 auto). 11 must stay after 4.
- `.status-left`: `4-tab-confirm-name.css:180` (white-space nowrap) + `5-status-project.css:139` (min-width 0, overflow, ellipsis, nowrap). 5 must stay after 4.

None of these collide on the same property except `.notice` padding and `.status-left` white-space (same value), so they mostly compose; but the ordering is implicit and undocumented beyond the header comment. Recommend merging each pair into its later sheet or annotating the dependency.

## P3 — redundant duplicate blocks inside one sheet

- `src/ui/styles/6-problems.css:16` and `:40`: two identical `.problems-head` blocks (same 17 declarations). The second is a no-op duplicate; harmless but drift-prone. Delete one.
- `src/ui/styles/6-problems.css:129` and `:143`: `.problems-file-copy` split across two blocks (base vs opacity/transition). Intentional layering, not a bug, but the split is what makes the cascade scan noisy.

## Inline style

- `src/ui/settings/TerminalSection.tsx:166` and `src/ui/settings/UpdatesSection.tsx:35` set `style={{ color: "var(--muted)" }}` on elements whose class (`.settings-hint` / none) already resolves to `--muted` (`1-settings-backdrop.css:124`). Redundant; the inline wins by specificity but changes nothing. Remove the inline to let the theme own it. Other inline styles in the tree (BranchBar `position: relative`, EditorSurface `position: relative`, dock widths) set properties no class defines, so they are not overrides.

## Cleared

- No `!important` anywhere under `src/ui` (rg'd the whole tree): no specificity wars to report.
- No stylesheet defines the same selector with _conflicting_ values except `.notice` padding (6px vs 5px) and `.status-left` white-space (identical). All other duplicate selectors compose on disjoint properties.
- No inline `style` was found that overrides a themed property with a different value; the only themed-property inline (color) duplicates the class value.
- The 20-menubar nested sheets (`20-menubar/1-titlebar-nodrag.css`, `2-titlebar-branch.css`-style files) contain no duplicate selectors across the cascade.
