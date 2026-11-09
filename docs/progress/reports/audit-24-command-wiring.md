# Audit 24 — command wiring

Scope: `src/ui/app/commandList.ts`, `lspPaletteCommand.ts`, `navigationCommands.ts`, `shellCommands.ts`, `useShellGlue.ts`, `useNativeMenu.ts`, `src/lib/consts/app.ts`, `src-tauri/src/menu/mod.rs`, `src-tauri/src/lib.rs`.

## Findings

None. Every command row in the palette resolves to a real handler, every native menu id is either a palette command or the shell's own `open-settings` case, and every Rust command registered in `generate_handler!` is invoked by frontend code.

## Checked, no issue

- `run: () => {}` / empty handlers: none in `commandList.ts`, `lspPaletteCommand.ts`, or `navigationCommands.ts` (grep across `src` for `run: () => {}` returned no command rows).
- Command ids with no implementation: all 29 ids (`open-project`, `build`, `run`, `debug`, `stop-run`, `toggle-debug`, `show-disassembly`, `toggle-source-control`, `save`, `save-all`, `format`, `find-in-project`, `toggle-rail`, `toggle-dock`, `toggle-terminal`, `reveal-active-file`, `quick-open`, `run-to-cursor`, `show-shortcuts`, `refresh-git`, `toggle-blame`, `new-project`, `check-updates`, `restart-lsp`, `workspace-symbol`, `release-notes`, `goto-implementation`, `goto-type-definition`, `quick-doc`) map to a non-noop callback in `shellCommands.ts`/`lspCommandHandlers.ts`.
- Native menu ids vs handlers: `src-tauri/src/menu/mod.rs` emits 21 ids; all are in `MENU_COMMAND_IDS` (`src/lib/consts/app.ts`) and handled in `useShellGlue.ts` dispatch (open-settings specially, the rest via `commands.find`).
- Shell-only ids: `open-settings` is the only shell-only id and it is emitted by the native menu, so no handler listens for an event that never arrives.
- Rust dead surface: scanned all `invoke("...")` string literals across `src` (99 unique) against the 98 names in `generate_handler!`; every registered command is invoked, including the indirect ones (`create_file`/`create_dir`/`rename_path`/`delete_path` via `fileOps.ts`, `git_stage_hunk`/`git_unstage_hunk` via `DiffView.tsx`, `lsp_prepare_type_hierarchy`/`lsp_type_hierarchy` via `useHierarchy.ts`).
- Forward direction (invoked → registered) is guarded by `src/lib/project/api/commands.test.ts`, which asserts every wrapper name exists in `lib.rs`.
- Keybinding-only commands (`format` via `Cmd+Alt+L`, `restart-lsp` via `Cmd+Shift+R`, `goto-implementation`/`goto-type-definition`/`quick-doc` via `useClionKeymap`, `workspace-symbol` via `Cmd+O`) each call the same handler the palette row uses, so the two paths cannot drift.
- `show-disassembly` and `release-notes` are palette-only (no menu entry or accelerator); both resolve to real handlers (`openDisassembly` → `EditorColumn`'s registered opener; `openNotes` → `overlays.setNotesOpen`).
