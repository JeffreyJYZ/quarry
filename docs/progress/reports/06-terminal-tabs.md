# Terminal tabs: rename by double-click

Added a user-controlled tab title. `Session` now carries `title: string | null` (null means "show the directory"), and `tabLabel(session)` returns `title ?? shortCwd(cwd)`. `emptySession` initialises it to null, so existing callers keep working.

`TerminalHeader` renders `tabLabel(s)` for the tab label, its `title` attribute and the close button's aria-label. Double-clicking a tab label swaps it for `TabRename`, an input holding the current label with the text selected. Enter commits, Escape cancels, blur commits. A 300 ms guard after close prevents the trailing click of the same gesture from reopening rename. Only one tab renames at a time via `editingId` state. Committing an empty string or the directory's short form stores `title: null`. All writes go through the existing `updateSession`.

CSS: `.terminal-tab-rename` matches the label's font, transparent background, accent bottom border, no outline, min-width 8ch.

Verified: `bun check` (no type errors), `bun test` (487 pass, 0 fail), `bunx biome lint src/ui/terminal src/lib/terminal` (no errors). Files kept at or under 200 lines.
