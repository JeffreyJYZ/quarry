# Crash log

One append-only file records what quarry was doing and what broke. It exists because the in-app
crash panel shows a stack once and a window reload discards it — without a file, a crash left nothing
to report.

## Where it is

| Platform | Path                                     |
| -------- | ---------------------------------------- |
| macOS    | `~/Library/Logs/quarry/quarry.log`       |
| Windows  | `%LOCALAPPDATA%\quarry\logs\quarry.log`  |
| Linux    | `$XDG_STATE_HOME/quarry/logs/quarry.log` |

On Linux, with `$XDG_STATE_HOME` unset, the file is `~/.local/state/quarry/logs/quarry.log`. On
Windows with `%LOCALAPPDATA%` unset, `%USERPROFILE%\AppData\Local\quarry\logs\quarry.log`.

The crash panel prints the path under its message, so the user never has to look it up. `log_path`
answers the same path from the renderer.

The file rotates once it would pass 2 MB: the previous content moves to `quarry.log.1`, which is
replaced on the next rotation, so disk use stays bounded at roughly 4 MB. Every line is flushed as
it is written, so a crash keeps everything up to the line that killed it.

## What a line looks like

```
2026-11-14T09:12:33Z ERROR [panic] panic at src/ui/app.rs:41:9: index out of bounds
    backtrace:
    ...
```

Timestamp (UTC), level (`INFO` or `ERROR`), target, message. A multi-line message — a stack, a
component stack, a backtrace — keeps its newlines and indents its continuation lines, so a line that
begins with a timestamp is always a new entry.

## What is logged

- **`app`** — version, OS and architecture, once at start.
- **`project`** — the resolved root and detected kind on open, and the error when opening fails.
- **`lsp`** — server and session id on start, and the session id with its status on exit.
- **`dap`** — session id and program on launch, the attach target on attach, and the id on exit.
- **`panic`** — every panic: message, file/line/column, and a backtrace when `RUST_BACKTRACE` is set.
- **`ui`** — an error caught in the renderer: name, message, the Error's stack, React's component
  stack when a boundary saw it, and the editor's document length. The `caught by` line names the
  hook — `boundary`, `window.error` or `unhandledrejection`.

That is the whole list. This is a crash log, not a tracing framework: adding a line here should
answer "which line would a bug report need", and anything else belongs in a debugger.

## Which hook sees a CodeMirror crash

A React error boundary only catches a throw during render or a lifecycle method. CodeMirror builds
and reads its transaction inside an input handler, so a range error from an editor extension is
uncaught as far as React is concerned and reaches `window.error` instead. `src/ui/main.tsx` installs
that listener plus `unhandledrejection` before the first render; both report through the same
`log_ui_error` command as the boundary, so there is one entry shape whichever hook fires.

The entry carries the editor's document length, read from `src/lib/editor/liveDocument.ts`: it
records the length each view last committed, on mount and on every update. A failing transaction
never reaches its own update listener, so the number reported is the document the broken changeset
was built from — not the length the changeset in the message reports, which is a different number and
is why both are kept.

## Why not `tauri-plugin-log`

It is not a dependency, and the whole requirement is a header line, a rotation at 2 MB, and a flush
per write. A `Mutex<File>` in `src-tauri/src/logging/` does that without adding a crate to the tree
or to the bundle. The module is split by responsibility — `paths`, `sink`, `line`, `stamp`,
`panic_hook`, `breadcrumbs`, `commands` — so each piece stays small and testable on its own.
