# Audit 28 — file tree ops

Scope: `src/ui/components/{useFileTree,TreeLevel,FileTree}.tsx`, `src/ui/app/AppBody.tsx`, `src-tauri/src/files/{rename_path,max_files}.rs`.

## Findings

### P1 — Renaming a folder does not update open buffers under it

- `src/ui/app/AppBody.tsx:52-61`: `onFileRenamed` only remaps buffers where `buffer.path === oldPath` and sets `activePath` only if `model.activePath === oldPath`. A directory rename leaves every open file whose path starts with `oldPath + "/"` pointing at the old location, and `activePath` unchanged when the active file lives inside the renamed folder.
- What the user sees: tabs keep the old names; saving or running reports a missing file / write error; the buffer is effectively orphaned. Only an exact-file rename updates state.
- Fix: map buffers with `path === oldPath || path.startsWith(oldPath + "/")`, rewriting the prefix to `newPath`; set `activePath` the same way when it is inside the renamed tree.

### P2 — A rename/edit in a collapsed (or never-expanded) folder leaves a stale cached listing

- `src/ui/components/useFileTree.ts:66-75` (`refreshDir`) clears `settled`/`promises` and calls `load(parent)` immediately, which marks that directory `settled`. When the user later expands it, `toggle` (`:83-100`) sees `settled.current.has(path)` and `load` returns without re-reading disk, so the renamed row is never shown.
- What the user sees: rename a file inside a folder, collapse it, expand it again — the old name reappears until a manual refresh.
- Fix: in `toggle`, when opening a dir, clear its `settled`/`promises` entry before `load`, or make `load` accept a `force` flag and pass it on expand. Keep `refreshDir` for expanded dirs.

### P3 — Delete/refresh failure surfaces a notice but the stale row can linger

- `src/ui/components/useFileTree.ts:157-168` (`confirmDelete`) and `:129-153` (`commitEdit`): on a failed backend call a notice is shown and `editing` cleared, but the directory is not re-read; if a partial/late refresh already happened the deleted/renamed row can reappear until the next toggle.
- What the user sees: an error toast plus a row that looks unchanged; expanding/collapsing clears it.
- Fix: call `refreshDir(parent)` in the `catch` as well (best-effort, swallowed), so the tree reflects disk truth after a failure.

## Checked, no issue

- Drag-and-drop: not implemented anywhere in `src/ui/components`; no drag handlers to audit.
- Delete confirmation: every delete goes through `setDeleteConfirm` + the inline `delete …?` prompt in `TreeLevel.tsx:136-145` before `confirmDelete` runs; Rust `delete_path` removes directories recursively. No silent delete path found.
- Create expands its parent: `handleAction` (`useFileTree.ts:112-119`) adds `entry.path` to `expanded` and calls `load` before opening the create input.
- Backend rename/create/delete validate names and stay within root (`validate_name`, `ensure_within` in `max_files.rs`).
- Exact-file rename keeps the buffer and active path in sync (`AppBody.tsx:52-61`).
- Error reporting is not swallowed silently: backend errors reach `onNotice` via `describeError`.
