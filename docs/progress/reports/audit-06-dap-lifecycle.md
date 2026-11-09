# Audit 06 — debugger (DAP) lifecycle and robustness

Read-only audit of `src-tauri/src/dap/`. Spike doc `docs/spikes/dap.md` is measured truth; items it already records as limitations are not re-reported here.

## P1 — debuggee can survive a stop or failed launch

- `impl_session.rs:137-152` `Session::shutdown` sends `disconnect { terminateDebuggee: true }` then immediately `pipe.kill()`. The adapter is SIGKILLed before it can process the disconnect, so lldb-dap never terminates the inferior; on macOS the debuggee is left running after Stop/Restart-failure. Fix: write the disconnect request, poll `child.try_wait()` for a short bounded window (e.g. 2s), then SIGKILL only on timeout.
- `impl_dapstate.rs:48-65` `dap_launch`: on handshake failure it does `_ = pipe.kill()` with no prior disconnect. When the failure is a timeout _after_ `launch` was accepted but before `initialized`, the inferior is already running and gets orphaned. Fix: attempt a best-effort `disconnect` write before kill (ignore errors).

## P2 — restart drops non-line breakpoints and loses the old session on failure

- `dap_restart.rs:30-31` + `useRestart.ts:70-88`: only line breakpoints are re-pushed after restart; data breakpoints (`dap_set_data_breakpoints`) and other adapter state are never re-applied, so watchpoints silently vanish. Fix: re-send data breakpoints too, or document that restart cannot restore them.
- `dap_restart.rs:38-70`: old session removed from the map and shut down _before_ relaunch; if `handshake_launch` fails, the frontend's `sessionRef` points at a dead id with no recovery path. Fix: on relaunch failure, return the old id alongside the error (or restore the entry) so the UI can keep showing "stopped".

## P2 — state/idempotency gaps

- `dap_configuration_done.rs:26-61` `register_session`: pump thread spawned _before_ session inserted into the map; a pump that exits immediately leaves a half-registered/half-dead session. Fix: insert into the map first (Arc), then spawn the pump over a cloned Arc; rollback removes the just-inserted entry.
- `impl_session.rs:75-113` `Session::request`: no readiness gate; a command during the handshake window sends into a pipe whose adapter is not configured. Fix: add an `AtomicBool initialized` flipped true after `dap_configuration_done` succeeds; `request` returns "session not ready" when false.

## P3 — thread id 0 default

- `impl_session.rs:34,51` `stopped_thread` defaults to `0`; `select_thread` (`dap_configuration_done.rs:176-179`) returns `0` with no recorded stop, sending an invalid `threadId: 0`. Fix: make `select_thread` return `Result<u32>` (or use `Option<u32>`) so the command fails instead of sending 0.

## P3 — fixed handshake timeout

- `initialize.rs:146` `REQUEST_TIMEOUT` is 20s for every `pump_until`; a slow first launch that exceeds 20s aborts. Not a correctness bug, but allow caller override rather than hard-code.

## Checked, no issue

- `Session::resolve` matches by `request_seq`; `Pump::request_inner` filters by its own seq and defers others, so no cross-talk between pump-initiated and user-initiated requests.
- Failed `dap_launch`/`dap_attach` kill the pipe and return before registration; no orphaned session entries.
- `dap_stop` (`dap_stack_trace.rs:144`) removes from map then shuts down; idempotent.
- `shutdown_all` drains and shuts down every session on exit.
- `real_directory` canonicalizes cwd before launch, avoiding the `/var` → `/private/var` breakpoint mismatch documented in the spike.
- Backend does not persist breakpoints by design; frontend re-pushes on restart/launch, consistent with comments.

## Second layer (deeper pass)

### Orphaned-debuggee reproduction

- Start adapter + inferior such that `launch` is accepted but `initialized` never arrives (or inject a delay past 20s), e.g. point at `scripts/dap-cpp-probe.ts` only as a reference for the raw launch frame shape; the probe itself does not reproduce. The minimal repro is a DAP client that sends `initialize` (seq 1) then `launch` (seq 2) with `stopOnEntry: false` against a binary whose `initCommands` blocks, and never receives `initialized`. `dap_launch` (`impl_dapstate.rs:59`) calls `handshake_launch` (`handshake_launch.rs:51`) which blocks in `pump_until` until `REQUEST_TIMEOUT` (20s), then `dap_launch` runs `_ = pipe.kill()` (`impl_dapstate.rs:62`) without any `disconnect` write. Because `Session` is never constructed (registration happens only after handshake success, `impl_dapstate.rs:67-74`), `shutdown()` is never called, so no `terminateDebuggee` is ever sent — the inferior is killed only if lldb-dap propagates SIGKILL to its child, which is not guaranteed. Confirm orphan with `ps` for the inferior binary after the timeout.
- For the stop path: call `dap_stop` (`dap_stack_trace.rs:144-151`) → `session.shutdown()` (`impl_session.rs:137-152`) writes `disconnect` then immediately `pipe.kill()`; reproduce by launching a no-stopOnEntry binary, then `dap_stop`, and observe the inferior survive. Shortest order: `dap_launch` → `dap_configuration_done` → continue → `dap_stop` during run.

### DAP request sequences and legality before configurationDone

- Launch: `initialize`(1) → `launch`(2) → (adapter `initialized` event) → `setBreakpoints` (N, allowed pre-configurationDone) → `exceptionBreakpoints`? → `configurationDone` (only then run). Legal before configurationDone: `setBreakpoints`, `setExceptionBreakpoints`. Not legal: `continue`, `next`/`step*`, `threads` (may answer but semantically premature), `stackTrace` unless stopped.
- Attach: `initialize`(1) → `attach`(2) (no `initialized` event promised) → `setBreakpoints` → `configurationDone`.
- Restart: `dap_restart` removes + `shutdown`s old session → spawns new adapter → repeat full Launch sequence → re-apply `setExceptionBreakpoints` (`dap_restart.rs:74-82`) → frontend re-pushes `setBreakpoints` → `configurationDone`.
- Stop: local `disconnect` ( terminateDebuggee:true) then `kill` (`impl_session.rs:137-152`); no DAP `terminate` (adapter advertises `supportsTerminateRequest: no` per spike).

### Session state inventory (cleared or not)

State fields in `Session` (`impl_session.rs:26-43`): `pipe`, `pending`, `seq`, `stopped_thread`, `alive`, `launch_config`, `exception_filters`, `exception_breakpoint_filters`.

- On successful `dap_stop`: session removed from map (`dap_stack_trace.rs:146`) + `shutdown` sets `alive=false`, takes pipe, kills, fails_pending, `stopped_thread` left stale but irrelevant (map entry gone).
- On failed `dap_launch`/`dap_attach`: session never created; no map entry; pipe killed locally (`impl_dapstate.rs:62`, `:105`). `launch_config` never set (OK). Frontend keeps none if it surfaces the error (useLaunch catches and returns before setting sessionRef — `useLaunch.ts:94-97`).
- On failed `dap_restart`: old removed+shutdown before relaunch (`dap_restart.rs:38-50`); new pipe killed on handshake failure (`dap_restart.rs:64-69`); new id never registered. Frontend `sessionRef.current` is still the old id until `dapRestart` resolves, so it becomes a dead id (`useRestart.ts:58`). No map entry under old or new id after failure → every later command returns "no debug session".
- On successful `dap_restart`: new map entry inserted (`dap_restart.rs:72`); `stopped_thread` resets to 0 (new Session, `impl_session.rs:51`), `exception_filters` mutated post-registration (`dap_restart.rs:77`), `exception_breakpoint_filters` from init capture. Frontend re-pushes breakpoints and conditionally `configurationDone`.
- `launch_config` survives restart (cloned into new session, `dap_restart.rs:72`), but is lost if an attach-based session is restarted (restart errors "no launch config").
- `pending` requests: cleared by `fail_pending` on pump exit/death; NOT cleared on a successful `dap_stop` because pump thread exits via pipe kill and runs `fail_pending` itself — so callers get "stopped answering", acceptable.
- `seq` counter never resets; harmless.
- `exception_filters` (UI ticks) is preserved across restart (`dap_restart.rs:47-48`, `:77`); cleared to `[]` on frontend `setExceptionFilters` only after the async dapRestart returns (`useRestart.ts:68`).
