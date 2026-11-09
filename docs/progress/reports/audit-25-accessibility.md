# Audit 25 — accessibility in src/ui

## Findings

### P1 — Editor tab strip has no tab semantics

- `src/ui/components/TabStrip.tsx:45` container is `<div className="tabstrip">`; rows are `<div className="tab">` (`:55`). No `role="tablist"`/`role="tab"`, no `aria-selected`, no arrow-key navigation. Screen readers see a list of divs.
- Fix: add `role="tablist"` on the container, `role="tab"` + `aria-selected={active}` on each row, plus arrow-key handling like `TerminalHeader`.

### P1 — Git panel tab strip has no tab semantics

- `src/ui/git/Tabs.tsx:14` `<div className="git-tabs">` with three `<button className="git-tab">`. No `role="tablist"`/`role="tab"`, no `aria-selected` (active state is only a CSS class).
- Fix: add roles + `aria-selected={tab === …}`.

### P1 — Focus outline removed with no replacement (goto input)

- `src/ui/goto/goto.css:65-67`: `.goto-input:focus-visible { outline: none; }` with no border/background change, so keyboard focus is invisible.
- Fix: add `outline: 1px solid var(--accent)` or a focus ring.

### P1 — Focus outline removed with no replacement (splitter)

- `src/ui/layout/layout.css:49-51`: `.splitter:focus-visible { outline: none; }` with no replacement.
- Fix: add a visible focus indicator (box-shadow or border).

### P2 — Focus outline removed with no replacement (problems list root)

- `src/ui/problems/problems.css:48-53`: `.problems-list-root:focus-visible` and base both `outline: none;`, no replacement.
- Fix: add focus ring.

### P2 — Dialogs lack focus trap and focus restore

- `src/ui/projects/NewProject.tsx:43-54`: panel has `role="dialog"` and Escape handling but no focus trap (Tab leaves the dialog) and no restore of the opener's focus on close.
- `src/ui/generate/Generate.tsx:36-67`, `src/ui/goto/Goto.tsx:131`, `src/ui/goto/LinePrompt.tsx:35`, `src/ui/quickopen/QuickOpen.tsx:17`, `src/ui/palette/CommandPalette.tsx:130`, `src/ui/updates/ReleaseNotes.tsx:63-67`: same gap (focus input on mount only; no trap/restore). Only `SettingsPage` (`src/ui/settings/SettingsPage.tsx:93-118`) implements a trap.
- Fix: extract the SettingsPage trap into a shared hook and apply to all dialogs; save/restore `document.activeElement`.

### P2 — No live region for build/debug status

- `src/ui/components/StatusBarIcons.tsx:183-189` build button label flips between "Build"/"Building…" but nothing carries `role="status"`/`aria-live`; `src/ui/app/AppView.tsx:31` notice has `role="status"` but build progress itself does not.
- Fix: add `aria-live="polite"` status span for build/debug state.

### P3 — Terminal tab rows are divs with role="tab" but no keyboard activation

- `src/ui/terminal/TerminalHeader.tsx:83-89`: `<div role="tab" tabIndex=...>` relies on inner `<button>` for click; Enter/Space on the tab div does nothing. Arrow handling exists on the container but activation is mouse-only.
- Fix: move onClick/activation to the tab element or add keydown Enter/Space.

## Checked, no issue

- Icon-only buttons: all examined carry `aria-label` and `title` (IconRail, StatusBarIcons, RunDebugWidget, TerminalHeader, TransportRail).
- Dialogs carry `role="dialog"` + `aria-modal` where modal (SettingsPage, Goto, Generate, NewProject, LinePrompt, QuickOpen, CommandPalette, ReleaseNotes, ProjectSwitcher).
- Context menu has `role="menu"`/`role="menuitem"` and Escape close.
- `outline: none` in inputs is paired with `border-color: var(--accent)` in most cases (dock-eval, debug, run-form, project-search, run-debug-target, git-commit, settings search); only splitter, goto-input, problems-list-root lack a replacement (listed above).
- Live regions exist for search states (`QuickOpen`, `SearchPalette`), errors (`role="alert"`), and notices (`role="status"`).
