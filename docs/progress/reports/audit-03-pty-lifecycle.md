# Audit: PTY and process lifecycle (`src-tauri/src/pty/`)

Scope read: `pty/mod.rs`, `pty/output_event.rs`, `pty/validate_cwd.rs`, `pty/utf8_stream.rs`, `src/lib/project/api/terminal.ts`, `src/ui/terminal/useTerminalSessions.ts`. No source changed.

## Findings

### P0 — `pty_open` leaks a spawned shell when `take_writer` or `try_clone_reader` fails

- `src-tauri/src/pty/output_event.rs:108-121` spawns `child` via `pair.slave.spawn_command(cmd)` before assigning it to the shared `Arc`, then calls `pair.master.take_writer()` (114-117) and `pair.master.try_clone_reader()` (118-121). If either returns `Err`, the function returns immediately with the error string. The `child` `Arc` has not yet been stored in a `Session` or inserted into `PtyState`; its `Drop` does not kill the OS process (portable-pty's Unix child is `std::process::Child`, which does not signal on drop). The PTY master/slave are dropped at function exit, but the shell can keep running (or hang waiting on a closed PTY) instead of being reaped. Repeated failed opens therefore leave orphaned shells.
- Why it matters: resource leak and possible background processes after the window closes; the failures are invisible to the UI beyond the returned error string.
- Fix: wrap the post-spawn setup in a closure/try block. On any error after `spawn_command`, call `child.kill()` + `child.wait()` (and drop the pair) before returning; only insert into `PtyState` after reader setup succeeds. The existing failure path for `thread::spawn` at lines 139-146 shows the intended cleanup pattern — apply it to all post-spawn failures.

### P1 — Natural exits leave the session (and its master/writer FDs) in `PtyState.sessions`

- `src-tauri/src/pty/validate_cwd.rs:94-130` (`pump`) reads until EOF, then waits on the child and emits `pty://exited`. It never removes the entry from `PtyState.sessions` (`src-tauri/src/pty/output_event.rs:27`, `HashMap<String, Session>`). `Session` holds `master: Box<dyn MasterPty>` and `writer: Box<dyn Write>`, so every exited terminal keeps its PTY descriptors until the frontend calls `pty_close` or the app exits.
- Why it matters: long-running app sessions with many terminal tabs accumulate FDs and memory; writes/resizes can still be issued against a dead session and surface as `unknown pty session`/I/O errors only after the map is inconsistent.
- Fix: give `pump` access to `PtyState` (or an `Arc<Mutex<HashMap<...>>>` plus the id) and remove the id on exit, dropping master/writer there. Keep `pty_close` idempotent so a later explicit close is a no-op. Frontend already handles `pty://exited`, so removing the Rust-side session does not change the visible terminal.

### P2 — `shutdown_all` and `Drop` hold the sessions lock while killing/waiting children

- `src-tauri/src/pty/output_event.rs:50-71`: both `shutdown_all` and `Drop` iterate `sessions.values()` under one `Mutex` guard and call `child.kill()` then `child.wait()` per session. A hung child blocks the lock and therefore blocks every other PTY command and app teardown.
- Why it matters: a non-terminating PTY turns "quit the app" into a hang; there is no timeout around `wait`.
- Fix: collect the `Arc<Mutex<Option<child>>>` handles, drop the sessions lock, then kill/wait outside it; add a bounded wait (or move waits to the reader threads) so one stuck process cannot freeze teardown. `pty_close` at `src-tauri/src/pty/validate_cwd.rs:64-75` has the same unbounded `child.wait()` and should be fixed the same way.

### P2 — Only the direct shell is signaled; descendant processes can survive

- `portable_pty`'s Unix `Child::kill` sends `SIGHUP` to the shell PID only (`~/.cargo/registry/.../portable-pty-0.8.1/src/lib.rs:312-322`). `shutdown_all`/`pty_close` never kill a process group, so a command still running under the shell (e.g. `sleep`, `cargo`, a dev server) can keep its PTY/slave side alive and hold descriptors. On `shutdown_all`, the reader thread may then never see EOF.
- Why it matters: dead-tabombie processes and "app still running in background" symptoms; directly supports the comment in `lib.rs:155-158`.
- Fix: spawn with `setsid`/a new process group and kill the whole group (`killpg`) in `pty_close`/`shutdown_all`/`Drop`; or set up `portable_pty`'s `CommandBuilder` to use a wrapper. Document if group kill is intentionally left to the shell's SIGHUP handling.

### P3 — Race window between `pty_close` and the reader thread's `child.wait()`

- `pty_close` takes the child out of the mutex first, then drops `writer`/`master`. `pump` (`validate_cwd.rs:120-127`) takes the same child and calls `c.wait()`. The ordering is safe for avoiding a double `wait`, but because `pty_close` does not set any "closed" flag, a `pty_write`/`pty_resize` arriving between close and thread exit can touch a session whose master is already dropped and report a confusing error; more importantly, `pty_close` returns `Ok(())` even when it never observed the child exit.
- Why it matters: cosmetic ordering, but it is the reason tests cannot assert teardown determinism.
- Fix: `pty_close` already removes from the map, so late commands get "unknown pty session"; keep that contract documented. Optionally emit `pty://exited` only from `pump` and have `pty_close` signal the master before returning, which the current drop already does.

## Checked, no issue

- Spawn/insert ordering around reader thread start is cleaned up: `pty_open` removes the session and kills the child if `thread::spawn` fails (`output_event.rs:139-146`).
- `pty_open` IDs are monotonic and start at 1 (`next_id` in `validate_cwd.rs:32-33`); verified by `pty_ids_count_from_one`.
- `pty_close` is idempotent for an unknown id (returns `Ok`) and removes before killing, preventing a second kill from a concurrent call.
- UTF-8 chunk decoder handles split characters correctly and is covered by `utf8_stream.rs` tests; not part of this lifecycle audit.
- Frontend removes the Rust PTY on tab close and on unmount (`useTerminalSessions.ts:91-109`, `:162-171`), and guards `ptyOpen` against a tab that was closed during the open await (`:72-76`).
- `validate_cwd` (lines 17-30) is purely a validation, no process side effects.

## Second pass: exhaustive lifecycle trace

### Map operation ledger

- insert: `pty_open` at output_event.rs:130, after session construction and before reader thread spawn.
- remove: `pty_close` at validate_cwd.rs:65, on explicit tab close.
- remove: frontend-triggered `pty_close` only when Terminal is mounted: openSession abort path (useTerminalSessions.ts:73-75) and unmount cleanup (useTerminalSessions.ts:164-169).
- no remove on natural EOF: `pump` emits exited but leaves the map entry (validate_cwd.rs:128-129).
- no remove in `shutdown_all` or `Drop`: they take child handles but keep sessions in the map, which is fine only because the process is exiting.

### Exact leak sequence: lingering exited session

1. Frontend calls `ptyOpen` and receives an id.
2. Shell exits (user types `exit`, process crashes, or shell hits EOF).
3. Reader thread `pump` breaks from `reader.read` (Ok(0) or Err), emits final output, calls `child.wait()`, emits `pty://exited`.
4. `Session` stays in `PtyState.sessions` with `master` and `writer` alive; frontend marks the tab `exited` but leaves it in `sessions`.
5. FDs are released only when `closeSession` runs `ptyClose` (useTerminalSessions.ts:91-97) or the component unmounts (useTerminalSessions.ts:162-171). If a terminal is opened and its shell exits while the panel stays open, the Rust entry persists indefinitely.

### Exact leak sequence: post-spawn open failure

1. `openpty` succeeds, `spawn_command` succeeds.
2. `take_writer` or `try_clone_reader` returns `Err`.
3. Function returns before `lock(&state.sessions).insert(...)` only if take_writer fails; if try_clone_reader fails, insert has already happened at output_event.rs:130, so a session entry exists without a reader thread. Wait: order is validate_cwd, openpty, spawn, pid, child, take_writer, try_clone_reader, then id and insert. Thus if take_writer fails, no insert; if try_clone_reader fails, no insert yet because id/insert occur after line 121. Correct: both failures happen before insert. So no map leak, but the spawned child is not killed.
4. `child` Arc drops without kill/wait; `pair` drops and closes PTY. Shell may linger.

### Race traces

- Resize then write after exit: `pty_resize` acquires the read-only session lock and calls `master.resize`; a shell that has exited returns `Err` from portable-pty, so the frontend sees resize failure. `pty_write` then takes the lock and `write_all` returns `Err` (broken pipe), reported via the one-shot `onNotice` in useTerminalSessions.ts:174-181.
- Write EPIPE: `pty_write` holds the sessions lock across `write_all`+`flush` (output_event.rs:153-165), so a blocked write stalls every terminal command during that interval; on EPIPE it returns an error but leaves the session in the map.
- App exit with N open sessions: `RunEvent::Exit` calls `shutdown_all` (lib.rs:162), which kills and waits each child while holding the sessions lock, then `Drop` runs over the same map with child handles already taken. Reader threads may still be alive when teardown returns because master drop happens in Drop after shutdown_all; if a child did not exit, `wait` blocks the whole exit.

### Error-path pairing check

- `openpty` failure: no child, no insert. Paired.
- `spawn_command` failure: no child, no insert; pair dropped. Paired.
- `take_writer` failure: child spawned but not killed; no insert. Unpaired (P0).
- `try_clone_reader` failure: child spawned but not killed; writer dropped; no insert. Unpaired (P0).
- reader thread spawn failure: child killed and waited, session removed. Paired (output_event.rs:139-146).
- `pty_close` with unknown id: returns Ok, no mutation. Intentionally permissive.
- `pty_close` races with `pump`: both take the same `Arc<Mutex<Option<child>>>`; exactly one gets the child, the other gets None. No double wait. Paired.
