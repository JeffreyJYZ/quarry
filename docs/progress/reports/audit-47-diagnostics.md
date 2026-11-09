# Audit 47: diagnosability

## P0

1. `src-tauri/Cargo.toml:43-46` — release profile sets `panic = "abort"` and `strip = true`. A panic in a shipped build aborts with no backtrace and no symbols, so a crash is invisible. Fix: keep `panic = "unwind"` for alpha builds and drop `strip`, or install a `std::panic::set_hook` that writes the payload + backtrace to a known log file before aborting.

## P1

2. `src-tauri/src/lib.rs:34-38` + `Cargo.toml` — no logging plugin (`tauri-plugin-log`/`env_logger`) is wired. Rust command failures reach the UI only as `Result<_, String>` invoke payloads; a failure before UI or in a background task leaves nothing. Fix: add `tauri-plugin-log` writing to the app data dir and surface that path in settings/About.

3. `src-tauri/src/main.rs:3` — `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` hides the console in release. Combined with (2) there is no diagnostic surface at all. Fix: gate the attribute on a debug flag or keep a log file; at minimum document the log path.

4. `src/ui/app/AppErrorBoundary.tsx:17-25` — `componentDidCatch` stores the stack in state but never persists it; in a shipped build the CrashPanel is the only surface and is lost on reload. Fix: also write `message`+`stack` to a durable location (localStorage or the Rust log) so a crash survives a restart.

## P2

5. `src/ui/terminal/useTerminalSessions.ts:74,96,167` — `ptyClose(...).catch(() => undefined)` swallows close failures silently. Fix: route through `onNotice` when a session is still tracked, at least once per session.

6. `src/lib/project/errors.ts:1-16` — `describeError` returns `"Unknown error"` for anything that is not a string/Error/message object, dropping the cause. Fix: append `typeof`/constructor name (e.g. `Unknown error (object)`).

7. `src/ui/components/useFileTree.ts:78-80,93-95` — root/toggle load failures are swallowed with comments; the tree shows an error state but no notice is raised. Fix: call `onNotice?.(describeError(error))` in those catches.

## P3

8. `src-tauri/Cargo.toml:43` — `lto = true` + `codegen-units = 1` plus strip makes release builds slow to debug; acceptable, but note that alpha releases cannot be symbolicated. Keep for shipping, disable for local alpha debug builds.

## Checked, no issue

- `src/ui/app/AppErrorBoundary.tsx` renders a CrashPanel instead of blanking the window.
- `src/lib/debug/useLaunch.ts` and `useStopSnapshot.ts` surface errors via `setError` with `describeError`.
- `src-tauri/src/format/run.rs` maps formatter failures to stderr-detail messages including binary name and path.
- No `unwrap()` in non-test Rust production code (only test_support and tests).
- No `console.error` anywhere in frontend; errors are surfaced through `onNotice`/`setError` rather than dropped.
