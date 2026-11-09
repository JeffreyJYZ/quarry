# Audit 15 — Tauri shell

Scope: `src-tauri/src/lib.rs`, `main.rs`, `menu/mod.rs`, `capabilities/default.json`, `tauri.conf.json`. Read-only.

## Ranked findings

### P1 — children are only killed on app exit, not on window close

- `src-tauri/src/lib.rs:153-167`: the `.run(...)` closure shuts down `LspState`, `DapState`, `PtyState` and `RunState` only on `RunEvent::ExitRequested` / `RunEvent::Exit`.
- The comment above it says a live shell/server/adapter/program keeps the process group alive after the window is gone, which is exactly the failure mode. On macOS, closing the window does not necessarily make the app exit first; the children can keep the process alive, so `ExitRequested` may never arrive and the shutdown never runs.
- Fix: also handle `RunEvent::WindowEvent { event: WindowEvent::Destroyed, .. }` (or `CloseRequested`) and run the same four `shutdown_all()` calls there, so LSP/DAP/PTY/run children die with the window. Keep the exit-path calls as a backstop.

### P2 — CSP disabled

- `src-tauri/tauri.conf.json:26`: `"csp": null`.
- The webview therefore runs with no content security policy. The app loads only local assets and terminal links open in the OS browser, so the blast radius is limited, but a null CSP removes the last line of defence if an XSS lands in rendered content (terminal output, diagnostics, hover markdown).
- Fix: set a restrictive CSP (`default-src 'self'; ...`) and adjust only for the dev URL / asset scheme Tauri needs, then verify `bun run tauri dev` and a production build.

### P3 — a build in flight is not tracked or killed on exit

- `src-tauri/src/build_task/default_cargo.rs:123`: `command.output()` blocks a `spawn_blocking` thread on `cargo`/`cmake`. The child is not stored in any managed state, so `shutdown_all()` on `ExitRequested`/`Exit` does not kill it.
- If the app is closed mid-build, the cargo/cmake process can outlive the window as an orphan.
- Fix: track the build child in a managed state (or kill the process group on window destroy alongside the P1 change) and reap it on shutdown. At minimum, document that builds are not cancellable.

## Checked, no issue

- Menu ids: every id in `src-tauri/src/menu/mod.rs:170-192` (`on_menu_event`'s `custom` list) is present in `src/lib/consts/app.ts:105-127` (`MENU_COMMAND_IDS`) and has a command in `src/ui/app/commandList.ts`; no `run: () => {}` empty handlers found.
- Command registration: every `invoke("...")` in `src/lib/project/api/*.ts` (collected) has a matching last path segment in `tauri::generate_handler![...]` at `src-tauri/src/lib.rs:43-142`; `src/lib/project/api/commands.test.ts` enforces this and passes conceptually.
- Capabilities: `src-tauri/capabilities/default.json` grants exactly the plugin permissions the frontend uses — `opener:default` (`src/ui/terminal/terminalLinks.ts`), `dialog:default` (`src/ui/app/useWorkspace.ts`, `src/ui/projects/useScaffold.ts`), `updater:allow-check/download/install` and `process:allow-restart` (`src/lib/updates/store.ts` and deps). No unused grant and no missing grant found.
- Shutdown methods exist for all four managed states: `LspState::shutdown_all` (`src-tauri/src/lsp/impl_lspstate.rs:27`), `DapState::shutdown_all` (`src-tauri/src/dap/impl_dapstate.rs:30`), `PtyState::shutdown_all` (`src-tauri/src/pty/output_event.rs:50`), `RunState::shutdown_all` (`src-tauri/src/run_task/output_event.rs:117`).
- Startup path: `menu::build_menu` and `app.set_menu` errors propagate via `?` in `.setup` and `.build(...).expect(...)` panics on failure; no silently swallowed startup error found in `lib.rs`.
