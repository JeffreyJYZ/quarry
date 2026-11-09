# Audit 34 — docs claims vs code

Area: truthfulness of README.md, website/content/docs/* and docs/plans/001-clion-parity.md.

## Findings

### P0 — Expression evaluation documented as broken while it works

- README.md:150-155 — "Still missing" section lists "Expression evaluation works, within measured limits" as if it were missing, even though its own bullet describes it working. Code: `src/lib/debug/useEvaluate.ts`, `src/ui/debug/dock/EvaluateField.tsx`, `src-tauri/src/lib.rs:92` (`dap::dap_evaluate`), `src/lib/project/api/dap.ts:77`. Move it into the working list or delete the "Still missing" entry.
- website/content/docs/language-servers.mdx:65 — "Known limits: `evaluate` is still broken for Rust through `lldb-dap`". False: evaluate works with a `frameId`. Same code as above.
- src/ui/debug/WatchSections.tsx:44 and :80 — UI strings "Expression evaluation is unavailable for Rust…" and "Evaluate is unavailable for Rust, so no watch expressions." False; an Evaluate field ships in the dock.
- docs/plans/001-clion-parity.md:133-134 and :142-143 — "evaluate is unusable for Rust" and risk "Rust expression evaluation … measured broken". Stale; the spike result was superseded.
- AGENTS.md:52 and :79 — same stale claim ("evaluate is broken for Rust", "DAP evaluate probe is expected to fail"). Notes only, but contradicts shipped behaviour.

### P1 — Install page claims no Windows/Linux builds

- website/content/docs/install.mdx — "There is no Windows or Linux build yet." False for beta/stable: `.github/workflows/release.yml:75-85` builds macOS, Ubuntu (AppImage) and Windows (nsis) for `quarry-beta*` and `v*` tags. Alphas (release-local) are macOS-only. Reword to "alphas ship macOS-only; beta/stable ship all three platforms."

## Checked, no issue

- Breakpoints conditional/log/data: `dap::dap_set_breakpoints_ex`, `dap::dap_set_data_breakpoints` registered (`lib.rs:83-85,96-97`); tests in `dap/tests_2.rs`.
- Memory pane and disassembly: `dap_read_memory`, `dap_disassemble` registered (`lib.rs:93,95`).
- Watchpoints, frames, scopes, variables, set variable, write memory: registered (`lib.rs:87-94`).
- Exception breakpoints filters: `dap_exception_filters`, `dap_set_exception_breakpoints` (`lib.rs:98-99`).
- Pinned variables: `src/lib/debug/usePins.ts`, `WatchSections.tsx`.
- Call hierarchy and type hierarchy: `lsp_call_hierarchy_*`, `lsp_prepare_type_hierarchy` (`lib.rs:70-74`).
- CMake build path: `build_task::run_cmake_build` (`build_task/absolute_path.rs:82`).
- Plain clang build: `run_plain_clang_build` in `build_task.rs`.
- LSP served-file gate: `src/lib/lsp/served.ts`.
- Inlay hints, document highlights, rename, code actions: registered (`lib.rs:56-69`).
- Quick open ranking, project search replace, git blame: present.
