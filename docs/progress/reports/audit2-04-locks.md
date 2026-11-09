# Audit 2.04 — mutex discipline (`src-tauri/src`)

## Scope

All `Mutex`/`RwLock` and `.lock()` sites in `src-tauri/src`. No `RwLock` found; only `std::sync::Mutex` (plus one `Condvar`). No guard is held across an `.await` (LSP `send_request` drops the session guard before awaiting). No recursive same-lock re-entry found.

## Findings

### P1 — `pty_write` holds the global sessions lock across a blocking pipe write

- `src-tauri/src/pty/output_event.rs:143-157` — `pty_write` does `let mut sessions = lock(&state.sessions);`, then `session.writer.write_all(...)` and `flush(...)` while the guard is live.
- Why it matters: `PtyState.sessions` is one mutex for every PTY. A slow terminal (backpressure, a process not reading) blocks `pty_open`, `pty_resize`, `pty_close` and `pty_write` for all terminals, not just the target one. Worst-case ordering: terminal A stalls on output → terminal B's keystrokes queue behind it → UI appears hung.
- Fix: take only the writer out under the lock (clone or `Arc<Mutex<Box<dyn Write>>>` per session), drop the sessions guard, then do the I/O; or add a per-session writer mutex and lock that instead.

### P2 — `pty_resize` holds the same global lock across `master.resize`

- `src-tauri/src/pty/validate_cwd.rs:42-61` — `let sessions = lock(&state.sessions);` then `session.master.resize(...)` under the guard.
- Why it matters: same serialization as above; resize is a syscall that can stall.
- Fix: resolve the `Arc`/session handle under the lock, drop it, then call `resize` on the cloned handle (or per-session lock).

### P2 — `discard` waits on the child while holding that run's entry lock

- `src-tauri/src/run_task/strip_terminator.rs:125-133` — `if let Some(mut child) = lock(&entry).take() { child.kill(); child.wait(); }`.
- Why it matters: the entry mutex is held for the whole `wait()`; any reader of that same `Arc<Mutex<Option<Child>>>` (e.g. the waiter thread in `reap`) blocks. Narrower than P1 (one run, not global), but still a lock held across a blocking reap.
- Fix: take the child out under the lock, drop the guard, then `kill`/`wait`.

### P3 — `kill_spawned` holds the child lock across `kill` + `wait`

- `src-tauri/src/pty/spawned_child.rs:8-13` — `lock(child).take()` then `spawned.kill()` and `spawned.wait()` while... actually the guard is dropped by the `if let` binding? The guard temporary lives for the `take()` expression, then dropped; the `Some(mut spawned)` owns the child. So this is fine. (Cleared.)

## Poisoned-lock policy

All production helpers (`dap/session_for.rs:27`, `lsp/lsp_close_document.rs:73`, `pty/validate_cwd.rs:36`, `run_task/strip_terminator.rs:136`, `protocol_pipe` sites) recover via `into_inner()`. Good. No `.unwrap()` on a production mutex found except `test_support`.

## Cleared

- No guard held across `.await` (LSP `send_request` scopes guard to a block; DAP `request` releases between lock calls).
- No recursive lock on the same mutex in one call path.
- No `RwLock` at all.
- `Condvar::wait_timeout` in `protocol_pipe/impl_stderrcapture.rs:45-63` correctly drops/re-acquires via the returned guard; no lock held during the wait beyond condvar protocol.
- DAP `shutdown` takes pipe lock only around `.take()`, releases before `kill`.
