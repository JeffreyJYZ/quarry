# Audit 22: debugger UI

Scope: frames, variables, breakpoints, stepping, console, and their wiring to DAP commands. Read `docs/spikes/dap.md` first; evaluate/watch limitations there are documented, not bugs.

## Findings

### P1 — Step buttons can fire twice before the first request lands

- File: `src/ui/debug/dock/TransportRail.tsx:143-166`, `src/lib/debug/useTransport.ts:74-87`
- What: `Step Over/Into/Out` are `disabled={!stopped}`. `step()` awaits `dapStepOn` and only then calls `setStopView(null)`, so `status` stays `"stopped"` for the whole await and the button stays enabled. A second click before the adapter answers sends a second step request.
- Why: double step on one user action; adapter may step twice or error.
- Fix: add an in-flight ref/guard in `step()` (and `continueRun()`), or disable the rail while a transport request is pending.

### P1 — Manual stop leaves temporary (run-to-cursor) breakpoints in the map

- File: `src/lib/debug/useTransport.ts:89-113`
- What: `stop()` clears `stopView`, children, pins, etc., but never removes entries with `temporary === true`. `useStopSnapshot` removes them on a stopped event, and `useDebugEvents.handleTerminated` removes them on termination, but a manual stop that does not emit a stopped event keeps them.
- Why: a run-to-cursor breakpoint can survive a stop and be re-sent on the next launch.
- Fix: in `stop()`, rebuild `breakpointMap` without temporary entries and `commitMap` it before clearing session state.

### P2 — Transport requests do not clear the variable tree before the adapter answers

- File: `src/lib/debug/useTransport.ts:62-87`
- What: `continueRun()` and `step()` set `stopView` to null only. `children`, `expanded`, and `selectedVariable` remain until the next stop lands.
- Why: stale rows can briefly survive a continue/step, and a stop that never arrives leaves them.
- Fix: clear `children`, `expanded`, and `selectedVariable` alongside `stopView` in both functions.

### P2 — "Edit configurations…" is enabled while a session is live

- File: `src/ui/debug/dock/DebugMenu.tsx:95-101`
- What: the button has no `disabled` rule, so it opens `PresetsEditor` during a live session, which writes `launch.json` and calls `refreshPresets()` mid-run.
- Why: config edits during a session are not applied to it and read as a dead control.
- Fix: `disabled={session !== null}` (or disable only while editing).

### P3 — Breakpoints set in a file that is not open do not decorate until it is opened

- File: `src/ui/app/useEditorActions.ts:43-53`, `src/ui/editor/useBreakpointGutter.ts`
- What: `breakpointLines` is derived only for `activePath`; breakpoints in other paths stay in `breakpointsByPath` and render when that file opens. This is by design, not a defect.
- Fix: none; document. If gutter marks are wanted for closed files, drive them from the open editor's path change only.

## Checked, no issue

- `TransportRail` continue/step/restart/stop disabled rules match session state (`src/ui/debug/dock/TransportRail.tsx:129-187`).
- `stop()` clears children, expanded, selectedVariable, watchPoints, pins, pinResults, exception filters and checked set (`src/lib/debug/useTransport.ts:89-113`).
- `handleStop` clears and reloads variables on every stop (`src/lib/debug/useStopSnapshot.ts:79-90`).
- `handleTerminated` clears temporary breakpoints and all live rows (`src/lib/debug/useDebugEvents.ts:64-99`).
- `EvaluateField` is disabled unless stopped (`src/ui/debug/dock/EvaluateField.tsx:32`).
- Watch/pin buttons are disabled unless stopped (`src/ui/debug/VariablesTree.tsx:161-170`).
- Variables tree expansion keys are derived from parent row keys, so nested children expand and collapse correctly (`src/ui/debug/VariablesTree.tsx:177-187`, `src/lib/debug/useVariables.ts:96-128`).
- No empty `onClick`/`run` handlers found in the debug UI; all buttons call a real `DebugController` method.
