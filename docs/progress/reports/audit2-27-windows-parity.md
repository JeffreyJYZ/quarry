# Audit 27 — Windows and Linux parity

Scope: `src-tauri` Rust + `src` TS. Static read only, no builds.

## P0

### PTY shell hardcoded to Unix paths

`src-tauri/src/pty/output_event.rs:89` `std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())`; `:165` `CommandBuilder::new("/bin/sh")`. Both runtime failures on Windows (`/bin/zsh` absent) and on Linux where `/bin/zsh` often absent. `/bin/sh` exists on most Linux but not Windows. No fallback to `cmd.exe`/`powershell.exe`. Compile OK. Runtime.

## P1

### Frontend path handling assumes `/`

Many TS call sites split/join on `"/"`: `src/lib/terminal/sessions.ts:58,64,66` (`dirOf`, `shortCwd`), `src/ui/components/useFileTree.ts:144,162`, `src/ui/components/Welcome.tsx:14`, `src/ui/components/revealTarget.ts:15`, `src/ui/breadcrumb/Breadcrumb.tsx:80`, `src/ui/components/FileTree.tsx:42`, `src/ui/lsp/HierarchyNode.tsx:41`, `src/ui/calls/CallsPanel.tsx:127`. On Windows backend returns `\` paths, so tab labels, breadcrumbs, parent-dir refresh and reveal break at runtime. Compile OK.

### Toolchain search dirs are macOS/Linux only

`src-tauri/src/resolve/source.rs:39-41`, `src-tauri/src/resolve/child_path.rs:35-38`, `src-tauri/src/format/tool_search.rs:42` hardcode `/opt/homebrew/...`, `/usr/local/bin`, `/usr/bin`. On Windows none resolve; tools (clangd, rust-analyzer, taplo) never found. `xcrun` fallback (`src-tauri/src/resolve/source.rs:114`, `launch/find_with_xcrun.rs:14`) also macOS-only. Runtime failure, not compile.

### `buildCommand.ts` Linux shell assumption

`src/lib/debug/buildCommand.ts:28-30` picks `/bin/zsh` on non-Windows. On Linux without zsh, runtime failure. Compile OK.

### Executable detection omits Windows noise

`src-tauri/src/build_task/newest_executable.rs:22` `NOT_PROGRAMS` excludes `.dylib/.so/.a/.o/.d` but not `.pdb`/`.dll`; `is_executable` on non-unix (`:98`) returns any file. Could select a non-runnable artifact on Windows. Runtime.

## P2

### `spawned_child` test Unix-only

`src-tauri/src/pty/spawned_child.rs:19-44` guarded with `#[cfg(unix)]`; compiles on Windows, test skipped. Fine.

### `std::os::unix` usages all guarded

All `PermissionsExt`/`symlink`/`MetadataExt` sites behind `#[cfg(unix)]` (verified `workspace/mod.rs:14`, `search/parse_match_line.rs:115`, `launch/default_cargo.rs:113`, `resolve/child_path.rs:57`, `build_task/newest_executable.rs:89`, `format/tool_search.rs:67`, `settings/tests_atomic_write.rs:76`). Compile OK on Windows.

### `libc::kill` in test

`src-tauri/src/pty/spawned_child.rs:35,39` inside `#[cfg(unix)]` test. Fine.

## Cleared

- No unguarded `std::os::unix` import.
- No `Command::new("zsh")` in Rust (only `/bin/zsh` in PTY).
- No direct `PermissionsExt::from_mode` outside guarded blocks.
- CI release workflow builds Windows (`release.yml:83`).
- Frontend `buildCommand.ts` already branches on Windows for shell.
