# Audit: terminal panel (`src/ui/terminal`, `src-tauri/src/pty`)

Scope read: `src/ui/terminal/{useXterm,useTerminalSessions,Terminal,TerminalScreen,focusTarget,useTerminalKeys,useTerminalRestart}.ts(x)`, `src/lib/terminal/{sessions,ptyBuffer}.ts`, `src/lib/project/api/terminal.ts`, `src-tauri/src/pty/{mod,output_event,validate_cwd,utf8_stream}.rs`, `src/ui/app/{useTabKeybindings,useKeybindings,useMetaShortcuts,focusGuard}.ts`. No source changed.

## Findings

### P1 — Cmd+W / Ctrl+Tab / Cmd+Shift+T are swallowed while the terminal is focused

- `src/ui/app/useTabKeybindings.ts:18-39`
- The capture-phase listeners never consult `inTerminal()`, so Cmd+W fires `closeActiveTab()`, Cmd+Shift+T fires `reopenClosedTab()`, and Ctrl+Tab fires `cycleTab()` even when focus sits in `.xterm`. They run alongside `useTerminalKeys` (`src/ui/terminal/useTerminalKeys.ts:32`, capture), so one Cmd+W closes both an editor tab and the terminal tab. Terminal-focused chords must not drive the editor tab strip.
- Fix: import `inTerminal` from `@/ui/app/focusGuard` and early-return at the top of the handler when `inTerminal()` is true, mirroring `useClionKeymap.ts:46` and `useKeybindings.ts:127`.

### P2 — `pending` bytes survive a tab/mount cycle and can land in the next shell

- `src/ui/terminal/useXterm.ts:68-69,125,154-156`
- `pending` is a component-level ref (`useRef("")`) that accumulates output arriving before the emulator exists (`write` at 159-166). The effect cleanup disposes the term and clears the timer but never resets `pending.current`, so bytes captured for a disposed tab are flushed into the next `Terminal` instance created under the same component. In a reopen cycle this reads as "handshake output replayed twice" or stale prompt text in a fresh shell.
- Fix: set `pending.current = ""` in the cleanup (line 145-156) and at effect entry before creating the term, so no leftover bytes cross a mount.

### P3 — Terminal sessions are not torn down when the project root changes, only on unmount

- `src/ui/terminal/useTerminalSessions.ts:162-171`
- The cleanup effect has `[]` deps and closes every `ptyId` only when the `Terminal` component unmounts. When the project switches without `panels.terminalOpen` going false, the component stays mounted with a new `root` prop, so the previous project's shells keep running and `openSession` starts new ones alongside them. Root changes that unmount do clean up (project becomes null, CanvasPanels/AppBody condition `project !== null` drops the panel).
- Fix: depend the cleanup on `root` (re-run close-then-reopen on root change) or add an effect that closes all sessions when `root` changes before the next `openSession`.

### P3 — `FitAddon` is created per emulator and never disposed

- `src/ui/terminal/useXterm.ts:130,145-156`
- `fit` is loaded into the term and discarded with the term's disposal, but the addon instance itself is not explicitly disposed before `term.dispose()`. On rapid tab switches this leaks one addon per reopen; no crash today, but each reopen leaves a dangling addon registered with xterm internals. Minor.
- Fix: call `fitRef.current?.dispose?.()` in the cleanup before `term.dispose()`.

## Checked, no issue

- `useXterm` does dispose the terminal (`term.dispose()`, `data.dispose()`, `links.dispose()`) and disconnects the `ResizeObserver` on unmount/ptyId change (`src/ui/terminal/useXterm.ts:145-156`); the per-reopen leak above is not the emulator instance itself.
- `applySize` does call `ptyResize(id, term.rows, term.cols)` after `fit()` (`src/ui/terminal/useXterm.ts:72-83`), so a settled resize does reach the PTY; hidden/zero-width hosts are the only paths that defer it.
- The raw subscription in `Terminal.tsx` (`useEffect` at 87-95) returns `subscribeRaw`'s unsubscribe, which deletes the handler from `rawHandlers`; teardown is wired correctly there.
- `PtyBuffer.take` clears the chunks before replay (`src/lib/terminal/ptyBuffer.ts:54-57`), so a given handshake chunk is not reapplied from the buffer itself more than once.
- `focusTarget.shouldFocusTerminal` returns true for non-control targets (`src/ui/terminal/focusTarget.ts:10-14`) and has tests at `src/ui/terminal/focusTarget.test.ts:9-24`; nothing in that helper blocks terminal focus.
