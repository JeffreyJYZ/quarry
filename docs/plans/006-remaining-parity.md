# Remaining parity work

Status: plan document. It follows `005-dap-client.md` and closes the parent plan's slice list
(`001-clion-parity.md`, §8 and §9). Estimates are rough and labelled as such.

## 1. Status of the daily loop

Each line names the command or component that proves the capability, taken from
`src-tauri/src/lib.rs` and `src/`.

| Area     | State                                                                                                                                                                                                                                                      | Proof                                                                                                                                                                                                                                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project  | open folder, detect cargo / CMakeLists.txt / compile_commands.json, report toolchains, lazy tree, tabs, save, restore last project                                                                                                                         | `project::open_project`, `workspace::list_dir`, `workspace::read_text_file`, `workspace::write_text_file`, `toolchain::toolchains`; `src/project/*`, `src/components/FileTree.tsx`, `src/components/TabStrip.tsx`                                                                                                     |
| Editing  | CodeMirror 6 with Rust/C++ highlighting, breakpoint gutter, diagnostics squiggles and gutter markers, format on save and on demand                                                                                                                         | `format::format_document`, `format::formatter_for`; `src/editor/*`                                                                                                                                                                                                                                                    |
| Insight  | one LSP per project root (rust-analyzer / clangd), full-document sync, hover, definition, references, completion, symbols; Problems dock grouped by file                                                                                                   | `lsp::start_lsp`, `lsp::lsp_open_document`, `lsp::lsp_change_document`, `lsp::lsp_hover`, `lsp::lsp_definition`, `lsp::lsp_references`, `lsp::lsp_completion`, `lsp::lsp_symbols`; `src/lsp/*`, `src/problems/ProblemsPanel.tsx`                                                                                      |
| Build    | `cargo build --message-format=json`, diagnostics merged into Problems dock; C/C++ without cmake via clang (`run_plain_n_build`)                                                                                                                            | `build_task::build_project`; `src/problems/*`; `src-tauri/src/build_task.rs`                                                                                                                                                                                                                                          |
| Run      | `run_program` / `stop_program` stream `run://output` and `run://exited`; backend and event contract only, no run panel UI                                                                                                                                  | `run_task::run_program`, `run_task::stop_program`; `src/run/RunLog.tsx`                                                                                                                                                                                                                                               |
| Debug    | lldb-dap launch from `.quarry/launch.json`, composed preset for unconfigured Cargo, attach by pid; line breakpoints (verified/pending), conditional and hit-count, threads, frames, scopes, variables, hardware watchpoints, paged hex memory, disassembly | `dap::dap_launch`, `dap::dap_attach`, `dap::dap_set_breakpoints`, `dap::dap_set_breakpoints_ex`, `dap::dap_threads`, `dap::dap_stack_trace`, `dap::dap_scopes`, `dap::dap_variables`, `dap::dap_read_memory`, `dap::dap_disassemble`, `dap::dap_data_breakpoint_info`, `dap::dap_set_data_breakpoints`; `src/debug/*` |
| Memory   | paged hex memory pane over `dap_read_memory`; variable values editable via `dap_set_variable`, memory cells via `dap_write_memory`                                                                                                                         | `dap::dap_read_memory`, `dap::dap_write_memory`, `dap::dap_set_variable`; `src/debug/memory/*`                                                                                                                                                                                                                        |
| Terminal | embedded terminal on `portable-pty` (`pty_open`/`pty_write`/`pty_resize`/`pty_close`); backend and component present                                                                                                                                       | `pty::pty_open`, `pty::pty_write`, `pty::pty_resize`, `pty::pty_close`; `src/terminal/Terminal.tsx`                                                                                                                                                                                                                   |
| Search   | rg-backed palette, grouped by file, keyboard navigation, truncation cap                                                                                                                                                                                    | `search::search_project`; `src/search/SearchPalette.tsx`                                                                                                                                                                                                                                                              |
| Tests    | `list_tests` and `run_test` feed a Tests dock with pass/fail                                                                                                                                                                                               | `test_task::list_tests`, `test_task::run_test`; `src/tests/*`                                                                                                                                                                                                                                                         |
| VCS      | Git view with status, per-file diff, open-in-editor; staging/unstaging and commit; file-tree git badges                                                                                                                                                    | `git::git_status`, `git::git_file_diff`, `git::git_stage`, `git::git_unstage`, `git::git_commit`; `src/git/*`, `src/components/FileTree.tsx`                                                                                                                                                                          |
| Calls    | call hierarchy prepare and traversal wired; panel in `src/calls/CallsPanel.tsx`                                                                                                                                                                            | `lsp::lsp_call_hierarchy_prepare`, `lsp::lsp_call_hierarchy_calls`; `src/calls/CallsPanel.tsx`                                                                                                                                                                                                                        |
| Palette  | command palette                                                                                                                                                                                                                                            | `src/palette/CommandPalette.tsx`                                                                                                                                                                                                                                                                                      |
| Inlay    | inlay hints rendered in editor                                                                                                                                                                                                                             | `lsp::lsp_inlay_hints`; `src/editor/inlayHints.ts`                                                                                                                                                                                                                                                                    |
| Sig help | signature help renders as tooltip                                                                                                                                                                                                                          | `lsp::lsp_signature_help`; `src/editor/Editor.tsx`                                                                                                                                                                                                                                                                    |
| Process  | attach by process pick                                                                                                                                                                                                                                     | `processes::list_processes`; `src/debug/ProcessPicker.tsx`                                                                                                                                                                                                                                                            |
| Layout   | layout persistence via settings                                                                                                                                                                                                                            | `settings::read_settings`, `settings::write_settings`                                                                                                                                                                                                                                                                 |

## 2. Remaining gaps

1. **Rust expression evaluation.** `evaluate` returns nothing usable across `repl`/`watch`/`hover`; `settings set target.language rust` changes nothing; `setExpression` kills the adapter. Escape hatches that work: `variables` (default or `filter: "named"`) and `readMemory` from a pointer found in `variables`. See `docs/spikes/dap.md`. Estimate: unknown.
2. **Remote development.** Explicit non-goal per `001-clion-parity.md` §8. Do not schedule.
3. **Embedded targets.** Explicit non-goal. Do not schedule.
4. **Profiler.** Explicit non-goal. Do not schedule.
5. **Plugin API.** Explicit non-goal. Do not schedule.
6. **Run panel UI.** Backend and event contract only; no panel in the UI yet. Estimate: 1 day.
7. **Watch-expression pane.** Blocked on item 1; can only offer variables-tree watching and memory views until a different adapter or toolchain is measured. Estimate: unknown.

## 3. Definition of done for the daily loop at parity

A future agent ticks each item without judgement. All must hold on a Cargo project on this machine.
- [ ] Open a folder containing `Cargo.toml`; the project kind reports `cargo` and toolchains list `cargo`, `rust-analyzer`, `rustfmt`, `lldb-dap`.
- [ ] Open a Rust source file; hover, go-to-definition, references and completion return results from `rust-analyzer`; verified by `bun run scripts/lsp-ux-smoke.ts`.
- [ ] `lsp_symbols` returns a document outline; the outline panel renders it.
- [ ] Save a file with a formatting error fixed by `rustfmt`; format-on-save applies it; a missing formatter surfaces a warning, not a silent no-op.
- [ ] `build_project` runs `cargo build --message-format=json`; its diagnostics appear in the Problems dock.
- [ ] A failing test shows as failed in the Tests dock via `list_tests` and `run_test`.
- [ ] A launch from `.quarry/launch.json` starts under `lldb-dap`; a line breakpoint verifies; variables, scopes and frames populate; memory and disassembly panes render.
- [ ] A hardware watchpoint set via `dap_set_data_breakpoints` fires and stops the process.
- [ ] Rust `Vec` and `String` render pretty-printed, proving `initCommands` loaded `lldb_lookup.py`.
- [ ] `search_project` returns grouped results with a visible truncation cap when exceeded.
- [ ] Git status and per-file diff render in the Source Control view.
- [ ] `bun run check` passes.
- [ ] `cd src-tauri && cargo test` passes.

## 4. How to verify

Smoke scripts:
- `bun run scripts/lsp-smoke.ts` — initialize handshake against a language server.
- `bun run scripts/lsp-ux-smoke.ts` — navigation response shapes (hover, completion, definition, references).
- `bun run scripts/dap-spike.ts` — debugger capabilities, memory, breakpoints and formatters.
- `bun run scripts/dap-eval-probe.ts` — Rust evaluate attempts.
- `bun run scripts/cxx-smoke.ts` — clang diagnostic shape and the missing-cmake path.

Gates:
- `bun check`
- `bunx biome check .`
- `cd src-tauri && cargo test`
- `bun run scripts/*.ts`

## 5. Risks that could silently regress

- **rust-analyzer formatter component.** `format::formatter_for` depends on `rustfmt` on `PATH`; a GUI launch carries launchd's `PATH`, so rustfmt may be missing even when it exists in a terminal. Symptom: format on save silently no-ops or warns. Mitigation: probe via `xcrun` fallback and surface the warning.
- **cmake absence.** `cmake` and `ninja` are not installed on this machine. Any C/C++ build path that assumes them fails at runtime. Mitigation: detect and report missing toolchains; do not assume presence.
- **evaluate fallback.** `evaluate` falls back to Objective-C++ and errors on Rust syntax. A watch pane built on it would look implemented but return errors. Mitigation: gate the feature behind a measured workaround.
- **Crate-wide `cargo fmt` rewriting `lsp.rs`.** `src-tauri/src/lsp.rs` is not rustfmt-clean; a crate-wide format adds an out-of-unit diff. Mitigation: format only the file being edited, e.g. `rustfmt --edition 2024 src/dap.rs`.

## 6. Reading order

This document is the capstone after `005-dap-client.md`. Non-goals from `001-clion-parity.md` §8 remain
non-goals and are not scheduled here.
