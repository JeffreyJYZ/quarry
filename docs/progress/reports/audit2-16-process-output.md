# audit2-16 process output

Scope: run_task backend + src/ui/run frontend. Read-only.

## Findings

P1. No stdin path for the child. `src-tauri/src/run_task/output_event.rs:72` sets `.stdin(Stdio::null())`; there is no `send_run_input`/`run_stdin` command anywhere in `src-tauri/src` (rg `stdin` under run_task shows only null). A program that blocks on stdin never receives input and hangs until killed. Fix: pipe stdin, store the `ChildStdin` (or a channel writer) keyed by run id, add a Tauri command `run_program_input(run_id, text)` that writes + flush, and surface an input box in RunLog.

P1. No Stop control in the run UI. `src/ui/run/RunLog.tsx` renders Re-run/Copy/Clear but no Stop; `src/ui/app/useRunControls.ts:140` exposes `stop: proc.stop` but nothing in the run panel calls it. The backend has `stop_program` (`output_event.rs:128`), so the capability exists but is unreachable from the run console. Fix: add a Stop button in RunLog's action row, disabled when `!running`, calling `onStop`.

P2. A second run can overwrite a live one without guard. `src/lib/run/useRunProcess.ts:85` `start()` clears lines/exited and sets runningRef null before awaiting `runProgram`; `useRunControls.ts:72` and `:100` guard on `running !== null`, but `proc.start` itself has no guard and listeners are filtered by `runningRef.current`, so a direct/rapid second start drops the first run's output and orphans its backend child (backend keeps it live in `Runs`). Fix: guard inside `start` (return false if runningRef.current !== null) and reject/stop the prior run before starting.

P2. Scroll stops following after the 2000-line cap. `RunLog.tsx:39-47` scrolls on `lines.length` change; `useRunProcess.ts:9-19` caps at `MAX_LINES = 2000`, so length stops changing and the panel no longer auto-scrolls while output continues. Also `stickRef` is only updated in `onScroll`, so a user who scrolls up and then new output arrives keeps stick false until they scroll back to bottom (expected), but the cap makes the "at bottom" test stale. Fix: depend scroll effect on a monotonic counter (total lines emitted) instead of `lines.length`, and recompute stick on each append.

P3. Cross-stream ordering is not preserved. `output_event.rs:95-102` spawns two independent reader threads (stdout, stderr) each emitting `run://output` with no sequence/timestamp; the frontend appends in arrival order, so stdout/stderr lines from the same moment can appear out of program order. Each stream is internally ordered. Fix: if interleaving matters, add a monotonic sequence number to the payload and sort by it on the frontend, or document that streams are not globally ordered.

P3. Exit status only renders when the exited event's runId matches runningRef. `useRunProcess.ts:65-69` filters `event.runId !== runningRef.current`; after `stop()` sets runningRef null (`:130`), a late backend `run://exited` for that id is dropped, but stop() already set `exited: { code: null, killed: true }`, so the UI still shows "stopped". Minor: if the backend's waiter emits first, the UI gets `{ code: null }` without killed and shows "terminated by signal" instead of "stopped". Fix: in onRunExited, when an exited event arrives for a run that was just stopped, keep killed true; or set exited only from the backend and remove the optimistic killed.

## Cleared

- Output is not buffered until exit: backend pumps line-by-line via `read_until` (`strip_terminator.rs:18-37`) and emits per line.
- Exit code is carried in `exited_payload` (`impl_runstate.rs:104`) as `code`, surfaced via `exitStatusText` (`exitStatus.ts`) including null/signal case.
- Stop exists at backend level (`stop_program`, `output_event.rs:128-152`) with kill+reap and waiter still reports exit.
- UI guards second run at `useRunControls.ts:72` and `:100`.
