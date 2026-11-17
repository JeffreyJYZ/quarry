# New Window: shared brief

Emergency feature. The user wants a **New Window** command reachable from three places:

1. the macOS menu bar (File ▸ New Window, Cmd+Shift+N);
2. right-clicking the Dock icon;
3. in-app (command palette row).

A new window is the _same app frontend_, not a second process: quarry is one process, one set of
managed states (LSP/DAP/PTY/run/build), several windows.

## House rules (non-negotiable)

- No file over 200 lines, tests included. Split by responsibility; never trim comments or tests.
- Tabs 4 wide, print width 100. `bun fmt` before reporting, then `bun fmt --check`.
- `rg` / `fd` / `bun`. Never `grep`/`find`, never npm.
- Never use `agent-desktop`, never move the user's cursor, never synthesize input on their screen.
- Never launch the GUI app to verify (no `bun run tauri dev`, no `open`). Compile, unit-test, and say
  plainly what only a launch can prove.
- One worktree, no new worktrees, no push, no tag, no release, no PR, no `bun run gate`.
  Commit on your branch and report.
- Windows and Linux builds must stay green: any macOS-only code is `#[cfg(target_os = "macos")]`
  with a non-macOS fallback that compiles.

## Contracts the lanes share

- Rust: `crate::windows::new_window(app: &AppHandle) -> Result<String, String>` creates a window,
  returns its label, and is registered as the Tauri command `new_window`.
- The dock lane takes a callback instead of calling that function directly, so it compiles alone.
- The menu item id is `new-window` and it is handled **in Rust**, not forwarded to the frontend:
  window creation must work even when a webview is busy.
