# Async/Blocking Audit

## P1 — `processes::list_processes` runs `ps` with blocking `.output()` inside an async command

- `src-tauri/src/processes.rs:83` `pub async fn list_processes()` calls `Command::new(&ps.path).args(...).output()` at line 85-88 with no `spawn_blocking`.
- `ps -ax` over the whole process table can stall the async runtime and freezes every other IPC call until it finishes. Even on a healthy machine it is unbounded by number of processes.
- Fix: wrap the `Command::output()` call (and the `resolve::resolve("ps")` probe) in `tauri::async_runtime::spawn_blocking`, or make the command sync. Add a timeout or cap capture.

## P1 — `start_lsp_session` busy-waits with `thread::sleep` on the async executor

- `src-tauri/src/lsp/start_lsp.rs:73-93` loops and calls `thread::sleep(Duration::from_millis(10))` at line 92 inside `pub async fn start_lsp_session`, while holding no await point between iterations except the sleep itself blocking the runtime thread.
- Also calls synchronous `open_project` (line 102), `resolve_server`/`Command::new`/`ProcessPipe::spawn_with_stderr` (lines 107-120) on the same async path.
- Under contention (two concurrent LSP starts for one root) this pins an async worker 10 ms at a time and delays unrelated IPC.
- Fix: replace the sleep loop with `tokio::time::sleep(...).await`; move the blocking spawn/probe behind `spawn_blocking` or make `start_lsp` sync.

## P1 — `stop_program` calls `child.wait()` on the async runtime

- `src-tauri/src/run_task/output_event.rs:129` `pub async fn stop_program` calls `child.wait()` at lines 148-151 with no timeout.
- A child that ignores `kill()`/does not exit keeps the command pending indefinitely and holds an async worker.
- Fix: do the wait on a blocking thread with a bounded deadline, then force-kill; or expose a kill-and-return path and reap later.

## P2 — `run_config` read/write/preset resolution use sync `fs::*` inside async commands

- `src-tauri/src/run_config/launch_dir.rs:15-28` three `#[tauri::command] pub async fn` functions (`read_launch_config`, `write_launch_config`, `resolve_launch_config`) call sync `fs::read_to_string`, `fs::create_dir_all`, `fs::write` (lines 41, 52, 99).
- Small files but still blocking I/O on the async executor; a slow disk or a very large `.quarry/launch.json` stalls all IPC.
- Fix: `spawn_blocking` around `read`/`write`/`resolve`, or convert these commands to sync (Tauri runs sync commands on its blocking pool).

## P2 — `pty_open` spawns a shell and opens a PTY synchronously in an async command

- `src-tauri/src/pty/output_event.rs:87` `pub async fn pty_open` runs `native_pty_system().openpty`, `pair.slave.spawn_command`, and `take_writer`/`try_clone_reader` (lines 96-121) on the async runtime; `validate_cwd` also shells out.
- A slow PTY allocation or hung shell spawn freezes IPC for the window.
- Fix: move PTY allocation + `spawn_command` into `spawn_blocking`, keep only state insertion + reader-thread spawn outside.

## P2 — `dap_launch`/`dap_attach` spawn the debug adapter synchronously on the async path

- `src-tauri/src/dap/impl_dapstate.rs:42` `dap_launch` and line 89 `dap_attach` build `Command::new(&adapter)` and call `ProcessPipe::spawn_with_stderr` (implied around lines 53/96) inside async commands with no `spawn_blocking`.
- A slow adapter (lldb-dap startup / missing binary fallback) stalls the runtime.
- Fix: spawn + handshake initial bytes in `spawn_blocking`, return the pipe handle.

## P3 — `start_lsp` busy-wait holds 10 ms slices; `stop_program` waits again after 20 ms intervals

- Secondary: `run_task` uses `WAIT_INTERVAL = 20 ms` in `spawn_waiter`; only the exit-reap on `stop_program` is on the async path (see P1).
- Fix: reap via the waiter thread and signal completion with a oneshot instead of blocking `wait()`.

## Checked, no issue

- Git commands (`git_*`) use `tauri::async_runtime::spawn_blocking` consistently.
- `list_files`, `search_project`, `replace_project`, `build_project`, `format_document`, `list_tests`, `run_test`, `default_launch_config`, `list_run_targets`, `resolve_run_target` are wrapped in `spawn_blocking`.
- No `std::net`/HTTP clients are used in `src-tauri/src` at all (no network fetches).
- Sync commands (`toolchain::toolchains`, `project::open_project`, `workspace::*`, `settings::*`, `new_project::create_project`) are not async, so they run on Tauri's blocking pool.

## Runtime configuration

- `src-tauri/Cargo.toml:26` enables Tokio features `sync` and `time` only; Tauri's own `Builder::default()` (`src-tauri/src/lib.rs:34`) supplies the async runtime. No `.plugin` or custom thread pool sizes are configured, so the default Tokio runtime applies.
- `tauri::async_runtime::spawn_blocking` is used only in the command sites listed in "Checked, no issue". Everywhere else, blocking calls run on async worker threads.
- No explicit `max_blocking_threads` or worker count is set in repo code.

## Mutexes held across await

- `src-tauri/src/lsp/start_lsp.rs:73-93` holds `state.sessions`/`state.in_flight` locks only inside inner scopes; no lock is held across the loop's sleep, but the sleep itself still blocks an async worker.
- `src-tauri/src/pty/output_event.rs:153-165` (`pty_write`) takes `lock(&state.sessions)` and does blocking `write_all`/`flush` while holding it.
- `src-tauri/src/run_task/output_event.rs:129-152` (`stop_program`) takes `lock(&state.runs)` then `entry`, then calls `child.kill()` and `child.wait()` while at least one state lock is held.
- `src-tauri/src/run_config` async commands do not hold cross-await locks, but do blocking fs.

## User-visible freeze sequences

- Attach-picker open (`list_processes`): frontend waits for `list_processes`; UI freezes until `ps` returns; no client timeout is visible.
- Starting rust-analyzer/clangd under load: two concurrent starts for one root spin on `thread::sleep(10ms)` before either proceeds; cancellation is not possible.
- Stop run button: `stop_program` does not return until child exits (or kill succeeds + reap), so stop action appears hung for a non-exiting child.
