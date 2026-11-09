# Audit 29 — build/run output panel

## Findings

### P1 — Cancel can report "stopped" while the process keeps running

- `src/lib/run/useRunProcess.ts:127-138` `stop` sets `runningRef.current = null`, `setRunning(null)` and `setExited({ code: null, killed: true })` **before** awaiting `stopProgram(id)`.
- `src-tauri/src/run_task/output_event.rs:129-146` `stop_program` returns `Err` and puts the child back when `child.kill()` fails (only `InvalidInput`/`NotFound` are ignored).
- On that error path the UI has already flipped to "stopped/killed", so the panel lies and the run keeps going. Fix: await `stopProgram` first; on success set killed; on failure keep `running` and surface the error.

### P1 — C/C++ diagnostic path is resolved against the build dir, not the source dir

- `src-tauri/src/build_task/split_severity.rs:84-92` `absolute_text_path` joins a relative compiler path to `build_root`.
- `src-tauri/src/build_task/absolute_path.rs:78-121` `run_cmake_build` calls `parse_text_diagnostics(&text, Path::new(build_root))`, so `build_root` is what gets passed.
- clang/cmake print paths relative to the source tree (or the compile working dir), so joining them to the build dir yields a non-existent file and the click opens the wrong path. Fix: resolve against `source_root` (the `-S` argument), or make the compiler emit absolute paths; keep `build_root` only for cargo.

### P2 — Build output is not streamed

- `src/ui/app/useBuild.ts:42-55` awaits `buildProject` (Rust `n`) and only then calls `onDiagnostics`/`onNotice`; there is no incremental output channel for a build, so a long build shows nothing until it ends. Fix: stream stdout/stderr lines into the run console like `run://output`, or at least pump them to the panel.

### P2 — Second build can start while one is already running

- `src/ui/app/useBuild.ts:42` guards only the local `building` flag of one `useBuild` instance; `src/lib/run/useRunLauncher.ts:44` guards `inFlight` per instance. There is no shared build lock, so the toolbar Build button and a Run/Debug launch (each of which calls `buildProject`) can build concurrently. Fix: a single shared "building" flag in app state, or disable all build entry points while one runs.

### P3 — Autoscroll can fight a user scrolling up

- `src/ui/run/RunLog.tsx:39-56`: the effect runs on every `lines.length` change and scrolls to bottom whenever `stickRef.current` is true; `stickRef` is only cleared when the user is more than 24px from the bottom. A user hovering just above the bottom gets snapped down. Fix: raise the "at bottom" tolerance or set `stickRef` false on any upward wheel/scroll gesture.

### Checked, no issue

- `src/lib/run/useRunProcess.ts:52-83` listeners are registered once and filtered by `runId`, so events from older runs do not pollute the current log.
- `src/ui/run/RunLog.tsx:49-56` scroll handler correctly derives `stickRef` from `scrollHeight - scrollTop - clientHeight`.
- `src/lib/run/useRunControls.ts:72` and `:100` guard `run`/`runConfig` against `running !== null`, so a second run cannot start while one is running.
