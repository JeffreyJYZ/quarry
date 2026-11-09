# Audit: editor keymaps and accelerators

Scope: `src/lib/consts/app.ts` (SHORTCUT_GROUPS), `src/ui/app/useClionKeymap.ts`, `src/ui/app/useKeybindings.ts`, `src/ui/app/useMetaShortcuts.ts`, `src/ui/app/useSelectionKeybindings.ts`, `src/ui/app/useTabKeybindings.ts`, `src/ui/app/useGotoLineKey.ts`, `src/ui/editor/keymap*.ts`, `src-tauri/src/menu/mod.rs`.

## Findings

### P1 — `?` shortcut sheet can never fire

- `src/ui/app/useKeybindings.ts:107-117` — the guard requires `!event.shiftKey`, but `?` is produced by `Shift+/`, so `event.shiftKey` is always true when `event.key === "?"`.
- Impact: the documented `?` entry in `SHORTCUT_GROUPS` ("Open shortcut sheet (outside editor)") is dead in every layout. Fix: drop the `!event.shiftKey` term (or test `event.key === "/" && event.shiftKey`).

### P1 — Cmd+F8 toggle-breakpoint is swallowed while debugging

- `src/ui/app/useClionKeymap.ts:85-99` — the `F7`/`F8`/`F9` step branches test only `live && event.key === "F…"`, with no modifier check, and sit _before_ the dedicated `Cmd+F8` branch at `:100-104`. While a session is live, `Cmd+F8` therefore enters the `F8` branch and runs step over (`debug.step(..., "next")`) instead of `toggleBreakpoint`.
- Impact: the documented `Cmd+F8` "Toggle breakpoint on the caret line" does nothing useful during the one moment breakpoints matter most. Fix: guard the step branches with `!event.metaKey && !event.ctrlKey && !event.altKey`, or move the `Cmd+F8` branch above them.

### P1 — native menu accelerators collide with in-app chords

- `src-tauri/src/menu/mod.rs:34` `CmdOrCtrl+N` (new project) vs `useClionKeymap.ts:125-129` `Cmd+N` (generate).
- `src-tauri/src/menu/mod.rs:37` `CmdOrCtrl+O` (open project) vs `useClionKeymap.ts:105-109` `Cmd+O` (goto class).
- `src-tauri/src/menu/mod.rs:65` `CmdOrCtrl+Alt+F` (find in project) vs `keymapLsp.ts:106-115` `Mod-Alt-f` (in-file replace).
- macOS delivers the menu accelerator at the OS level, so the editor never sees the chord; the web handler is dead whenever the project is open.
- Fix: reassign one side of each pair, or drop the menu accelerators and let the in-app handler own the chord.

### P2 — editor tab shortcuts fire while the terminal is focused

- `src/ui/app/useTabKeybindings.ts:18-39` — capture-phase handlers for `Cmd+W`, `Cmd+Shift+T` and `Ctrl+Tab` never consult `inTerminal()`, unlike `useClionKeymap.ts:46` and `useKeybindings.ts:127`.
- Impact: those chords act on the editor tab strip while focus sits in `.xterm` (already noted in `audit-21-terminal-ui.md` P1).
- Fix: import `inTerminal` from `@/ui/app/focusGuard` and early-return when it is true.

### P2 — layout toggles are disabled whenever the editor has focus

- `src/ui/app/useKeybindings.ts:123-152` — the `Cmd+B`/`Cmd+J`/`Cmd+Shift+D`/`Cmd+Shift+G` handler early-returns when `inEditor()` is true, so the documented toggles do nothing with the caret in a file even though there is no conflicting editor binding for those chords.
- Fix: drop `inEditor()` from that guard (keep `inInput()`/`inTerminal()`), or move these to `useClionKeymap` which already excludes only inputs/terminals.

### P3 — `Cmd+F8` handler condition is case-tolerant only by luck

- `src/ui/app/useClionKeymap.ts:46` sets `key = event.key.toLowerCase()` and `:100` compares `key === "f8"`. This matches today because `"F8".toLowerCase()` is `"f8"`, but the earlier `F8` step branch at `:90` uses the raw `event.key === "F8"` and runs first during a live session (see P1 above). Worth collapsing both checks onto the same casing to avoid the next edit reintroducing the ordering bug.

## Checked, no issue

- Every `MenuItemBuilder::with_id` in `src-tauri/src/menu/mod.rs` is dispatched by the shell (`src/ui/app/useShellGlue.ts`) or is a palette command — covered by `src/ui/app/nativeMenu.test.ts`.
- `Cmd+F`, `Cmd+Alt+F` etc. in the in-file search path (`keymapLsp.ts:96-115`) do not collide with each other; `Mod-f` is in-file find, `Mod-Alt-f` is in-file replace.
- `SHORTCUT_GROUPS` entries each have a handler somewhere, except the dead `?` (P1) and the live-session-shadowed `Cmd+F8` (P1).
- Step keys `F7`/`F8`/`Shift+F8`/`F9` fire while the editor has focus: `inEditableTarget()` does not treat `.cm-editor` as an editable target, so the CLion keymap reaches them.
- `src/ui/editor/keymapDebug.ts` does not exist in this tree; keymap wiring lives in `keymap{Completion,Editing,Lsp}.ts` plus the window-level hooks audited above.
- Menu items without accelerators (`build`, `run`, `stop-run`, `toggle-terminal`, `toggle-blame`, `refresh-git`) are intended to be driven from the palette/toolbar and from `useClionKeymap`, so their absence from the native menu is by design.
