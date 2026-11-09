# Audit: backend wait bounds (quarry)

Scope: Rust Tauri backend (`src-tauri/src`). Every place that waits on an external process/pipe/channel/server and whether it is bounded.

## P0 — unbounded waits

- `src-tauri/src/run_task/strip_terminator.rs:84-93` `wait_for_exit` loops `reap` + `thread::sleep(WAIT_INTERVAL)` with no deadline. If the child never exits and `stop_program` does not take it (e.g. a process ignoring SIGTERM, or a detached grandchild), the waiter thread spins forever and the run panel never emits `exited`. User sees "running" forever. Fix: add a deadline (e.g. 30s) then `child.kill()` + `child.wait()` and emit a synthetic exit.
- `src-tauri/src/pty/spawned_child.rs:8-12` `kill_spawned` calls `spawned.kill()` then `spawned.wait()` with no timeout. If `kill` does not reap (zombie, stuck process), the call hangs; callers (pty_open error paths, shutdown_all) block the command thread. Fix: bounded reap (poll `try_wait` with sleep) then drop the handle.
- `src-tauri/src/dap/impl_pump_1.rs:50` `self.frames.recv()` (blocking) in `Pump::next`. If the adapter stays alive but stops emitting frames, the pump thread blocks forever and `server_gone`/`fail_pending` never fire, so every in-flight DAP request hangs until `REQUEST_TIMEOUT` (20s) each. Fix: use `recv_timeout` with a watchdog (e.g. 60s) then treat as adapter death.
- Git commands across `src-tauri/src/git/*.rs` (e.g. `git_stage.rs:44`, `commit.rs:24/37/52/111`, `parse_git_blame.rs:116/133`, `build_hunk_patch.rs:119`, `discard_restore_argv.rs:51/65`) call `Command::new(...).output()` with no timeout. A hung git (credential prompt, index lock) blocks the Tauri command thread forever; UI shows spinner with no escape. Fix: run on a thread with a deadline and kill the child, or use `wait-timeout` crate.
- `src-tauri/src/processes.rs:85-88` `Command::new("ps").output()` no timeout; same hang risk (ps normally fast, but unbounded).
- `src-tauri/src/search/search_core.rs:57-59` `child.wait()` after `read_matches`. If ripgrep ignores SIGKILL? kill is sent only when truncated; otherwise waits for natural exit. rg usually exits, but no outer bound. Low risk but unbounded. Fix: deadline around wait.

## P1 — timeout on one leg only

- `src-tauri/src/format/run.rs:62-80` bounds `child.try_wait()` at 30s and kills, but the writer thread `stdin.write_all` (line 56-59) has no bound; a formatter that never reads stdin makes `write_all` block forever even after kill. Also `read_to_end` on stdout/stderr (lines 86-91) after exit is unbounded if pipes never EOF (rare). Fix: join writer with timeout or drop stdin; ensure pipes closed.
- `src-tauri/src/lsp/pump.rs:121` `for frame in frames` blocks on `recv()` (unbounded). If server stays silent but alive, pump thread hangs; but LSP requests use `recv_timeout(REQUEST_TIMEOUT)` on a _separate_ channel, so callers fail at 20s while pump stays stuck. User sees "language server stopped responding" eventually via request timeout, but pump never marks session dead. Fix: watchdog or rely on reader EOF; at minimum document.
- `src-tauri/src/dap/impl_pump_1.rs:138` pump's own `request_inner` uses `recv_timeout(REQUEST_TIMEOUT)` (bounded, 20s) — good, but `next()` at line 50 is unbounded, so a silent adapter stalls pump.
- `src-tauri/src/lib/updates/deps.ts:20-35` `fetchGithub` uses `fetch` with no timeout/AbortController. If GitHub hangs, the update panel's "Loading…" never resolves (unlike `notes.ts` which has `withTimeout`). Fix: wrap in `withTimeout` or AbortController like notes.

## P2 — bounded but possibly too long / no user feedback

- `src-tauri/src/test_task/default_cargo.rs` LIST_TIMEOUT 120s, RUN_TIMEOUT 300s. Long but bounded; user sees "running tests" with no progress. Acceptable.
- `src-tauri/src/lsp/handshake_timeout.rs` HANDSHAKE_TIMEOUT 20s, REQUEST_TIMEOUT 20s, STDERR_WAIT 500ms — bounded.
- `src-tauri/src/dap/adapter.rs` REQUEST_TIMEOUT 20s — bounded.

## P3 — expected/unbounded by design

- PTY reader thread (`pty/output_event.rs` pump) reads until EOF; correct for interactive shell. Killed via `kill_spawned` on close.
- `protocol_pipe` reader thread reads frames until EOF; correct.

## Cleared

- LSP handshake (`lsp/pump.rs:51-93`) bounded by HANDSHAKE_TIMEOUT.
- DAP request (`dap/impl_session.rs:98`) bounded by REQUEST_TIMEOUT with cleanup.
- DAP handshake (`dap/initialize.rs:146`) bounded.
- Formatter (`format/run.rs`) bounded at 30s for process exit.
- Test runner (`test_task/capture.rs`) bounded by timeout param.
- Release notes fetch (`updates/notes.ts`) bounded by withTimeout.
