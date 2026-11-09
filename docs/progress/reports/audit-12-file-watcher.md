# Audit 12 — filesystem watching

## Result

No filesystem watcher exists in the codebase. Verified by:

- rg `notify|watcher|inotify|fsevents|kqueue|RecommendedWatcher` over `/Users/jyz/.../quarry` -> only `bun.lock` fsevents (vite's optional dev dep) plus DAP "watch" variables.
- `src-tauri/Cargo.toml` has no notify/watch crate; `Cargo.lock` checked indirectly via grep.
- capabilities/default.json grants no fs/watch permission.
- src has no `setInterval` poll of the tree (only `src/lib/updates/poll.ts` for updater).
- No `didChangeWatchedFiles` / watched-files handling in `src/lib/lsp`.

Project tree is loaded imperatively: `src/ui/components/useFileTree.ts` calls `listDir` (Tauri `workspace::list_dir`) per expanded dir, caches `settled`/`promises`, refreshes only on user action or its own create/rename/delete ops.

## Findings

- **P0 — No filesystem watching at all.** `src/ui/components/useFileTree.ts:42-64`; `src-tauri/src/workspace/mod.rs:25`. External writes (git checkout, terminal, cargo build artifacts in new dirs, another editor) never reach the tree unless the user toggles/reopens a dir or runs an in-app op. Root load on mount (`useFileTree.ts:77-81`) runs once. Fix: add a watcher (e.g. `notify` crate) behind a Tauri event `fs://change`, or at minimum poll the root on window focus; debounce and ignore build output dirs (`target`, `.git`, `node_modules`) to avoid refresh storms.
- **P1 — External rename is not a first-class event.** Only in-app rename updates buffers (`AppBody.tsx:52-71`) via `onFileRenamed`. Rename from outside leaves a stale tab pointing at a missing path and an orphaned entry; delete from outside leaves a ghost entry and a buffer that only gets noticed if the user saves. Fix: when the watcher lands, route delete/rename events through `onFileDeleted`/`onFileRenamed` so buffers follow.
- **P1 — No refresh storm protection because no watcher today, but any naive watcher will flood during `cargo build`.** `target/` contains thousands of writes; plan excludes `target`, `build`, `out`, `node_modules`, `.git` and `dist`. Fix: path-filter the watcher; only refresh affected parent dirs.
- **P2 — Watcher lifecycle must tie to project root.** `useLspServers` (`src/lib/lsp/session.ts:38-61`) already stops servers on root/enable change; a future watcher must follow the same pattern (start on root set, drop on close/switch), otherwise stale watchers accumulate on project switch. Fix: own the watcher in the same effect that owns the LSP sessions and call `unwatch` in cleanup.

## Checked, no issue

- **Buffer clobber on external edit:** not possible today — no watcher pushes disk content into open buffers, so unsaved edits are preserved (at the cost of stale content). `useDocumentSync` (`src/lib/lsp/session.ts:120-199`) only sends editor text to the server, never reads disk. If a watcher is added, it must not overwrite a dirty buffer; gate refresh on `isDirty`.
- **Rename-as-delete+create losing the buffer:** manual rename already renames the buffer path and active path (`AppBody.tsx:53-61`), so in-app ops are safe. Only external renames are unsafe (see P1).

## Exhaustive verification of "no watcher"

Cargo.toml dependency list (`src-tauri/Cargo.toml:21-31`) contains no notify/fsevents/inotify/kqueue crate and no watcher feature on any dependency. The only `notify` spelling is `condvar.notify_all()` in `protocol_pipe/impl_stderrcapture.rs:34`, unrelated.

Polling loops:

- `src/lib/updates/poll.ts` — updater polling only.
- `src-tauri/src/run_task/mod.rs` polls `try_wait` for child process exit, unrelated.
- No `setInterval`/`setTimeout` loop anywhere else in the frontend: `grep setInterval` over `src` returned one hit (`poll.ts:10`).

Refresh triggers that DO exist:

- Mount/root change: `useFileTree.ts:77-81` loads root once; effect re-runs only if `root` changes.
- Dir toggle: `useFileTree.ts:83-97` loads a dir when expanded.
- In-app mutate: `useFileTree.ts:136-164` refreshes the parent after create/rename/delete.
- Git status refresh on window focus: `useGitState.ts:63-70` bumps refreshToken -> git status only, not the file tree.
  No focus, visibility or save handler re-loads the tree or an open buffer from disk.

When it can go stale: any write outside the app's own file ops — git checkout/merge, terminal commands, cargo/rust-analyzer output, a second editor, build scripts. Expanded dirs keep their cached entries; a file edited externally keeps its stale text in the CodeMirror view; no external delete/rename is noticed. Save of a stale buffer overwrites newer external content (lost update).

## Smallest correct watcher design

- Crate: none is present; add `notify = "7"` (or `tauri-plugin-fs` with watch, but that pulls a bigger plugin). `tokio` (`src-tauri/Cargo.toml:26`) is already there for the async channel/bridge.
- Placement: new `src-tauri/src/watcher/mod.rs` started in `main.rs` alongside LSP; a Tauri command `start_watch(root) -> watch_id` and `stop_watch(id)`, emitting `fs://change` with `{ root, paths: string[] }`.
- Ownership: start when `root` is set and stop on project switch/close, mirroring `useLspServers` cleanup in `src/lib/lsp/session.ts:38-61`.
- Exclude before emit (Rust side): `.git`, `target`, `build`, `out`, `dist`, `node_modules`, `.DS_Store`, lockfiles; also ignore paths matched by `crate::ignore`.
- Debounce: 250 ms window, coalesce paths into one event batch; batch per parent dir is fine at frontend scale.
- What it must NOT do: never overwrite an open buffer. Resolve dirty via `isDirty` (`src/lib/project/buffer.ts`); if dirty, mark the tab "changed on disk" instead of replacing text. Refresh directory listings only, not file contents unless the file is open, unchanged, and not dirty.

## Failure modes a naive version hits, in order

1. Refresh storm during `cargo build`: thousands of events under `target/`; excluded-dir filter fixes; without it the IPC flood freezes the UI.
2. Lost selection: rebuilding the whole `dirs` map resets expansion/selection state; diff only affected parent directories.
3. Reopened file clobbers unsaved text: a change event on an open, dirty buffer must not call the editor sync; gate on `isDirty` first.
