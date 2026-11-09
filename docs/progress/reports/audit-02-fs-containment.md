# Audit 02 — filesystem path containment

Scope: every Rust command that reads or writes a path coming from the frontend. Checked against `src-tauri/src/files/max_files.rs::ensure_within`.

## Summary

Only the `files::*` commands (`create_file`, `create_dir`, `rename_path`, `delete_path`) call `ensure_within`. Every other path-touching command below does not, and several hand an arbitrary frontend string straight to `std::fs` / `Command`.

## Findings

### P0 — `workspace::read_text_file` / `write_text_file` bypass containment entirely

- `src-tauri/src/workspace/max_text_bytes.rs:64` `read_text_file(path)` calls `fs::metadata(file)` / `fs::read(file)` on the raw `path` with no root and no containment check.
- `src-tauri/src/workspace/tests_1.rs:21` `write_text_file(path, text)` calls `fs::write` on the raw `path` after only `is_absolute()`.
- Escape: frontend sends `path = "/etc/passwd"` or `../../../etc/passwd` resolved absolute; reads or overwrites any file the process user can touch. No project boundary exists at all for the editor I/O.
- Fix: accept a `root` argument and run every target through `ensure_within(&root, path)` before metadata/read/write; reject outside paths.

### P1 — `workspace::list_dir` enumerates arbitrary directories

- `src-tauri/src/workspace/max_text_bytes.rs:25` `list_dir(path)` canonicalises the raw `path` and reads it; no root.
- Escape: directory traversal UI can list `/`, `/Users`, any readable directory, leaking names.
- Fix: require and contain against a project root (or restrict to known roots).

### P1 — `search::replace_project` writes files with no per-file containment and follows symlinks

- `src-tauri/src/search/default_max_results.rs:31` takes `root`, only checks `Path::new(&root).is_dir()`, then walks with `fs::read_dir`, pushes symlink paths, and `fs::write(&path, …)` at line 103. Root is `absolute_root`-canonicalised only later inside `replace` (line 59).
- Escape: a symlinked directory inside the project whose target is outside makes `stack.push(path)` then writes through the link; `root/evil-link/secret.txt` lands outside the project.
- Fix: canonicalise `root`, skip symlinked entries (use `symlink_metadata`), and call `ensure_within(&root_real, &path)` before every `fs::write`.

### P2 — `search::search_project` reads through symlink escapes

- `src-tauri/src/search/default_max_results.rs:120` hands `root` to `rg` after only `is_dir()`; rg follows directory symlinks depending on flags, reading files outside the project.
- Fix: canonicalise root and pass `--no-follow` / reject symlinked roots.

### P2 — `format::format_document` walks parents past project root

- `src-tauri/src/format/run.rs:14` `nearest_clang_format` does `dir.parent()` in a loop to the filesystem root, reading `.clang-format` from any ancestor. `format_document` (max_input_bytes.rs:38) takes `root` and `path` but never checks `path` against `root`.
- Escape: low-impact (read-only config, returns formatted text), but a shared ancestor `.clang-format` outside the project silently changes formatting; `root`/`path` mismatch is not rejected.
- Fix: bound the upward walk at the project root and validate `path` with `ensure_within`.

### P3 — other path-touching commands with no contain check (lower risk)

- `settings::read_project_settings` / `write_project_settings` (`settings/settings_core.rs:109,121`): write `<root>/.quarry/settings.json`; `root` checked only for `is_dir`/absolute, no canonicalise or contain.
- `run_config::read/write_launch_config` (`run_config/launch_dir.rs`): root canonicalised via `absolute_root` but no `ensure_within`; writes `<root>/.quarry/launch.json`. Relative preset `program`/`cwd` may resolve outside project by design (intended).
- `new_project::create_project` (`new_project/create_project.rs:10`): creates a project under an arbitrary `parent` — intended; no containment concept.
- `pty::pty_open` (`pty/validate_cwd.rs`): spawns shell with arbitrary `cwd` — by design; sandboxing is separate.
- `files::list_files` (`files/max_files.rs:13`): lists any directory passed as `root`; read-only.
- `format::run::run`: rustfmt spawned with `current_dir(root)` on frontend-supplied root; clang-format args include `path`. No containment.

## Checked, no issue

- `files::ensure_within` canonicalises the existing prefix of the target (symlink-safe) and rejects outside paths; `create_file`, `create_dir`, `rename_path`, `delete_path` use it twice (parent then target).
- `workspace::write_text_file` refuses non-absolute paths and never creates parent directories.
- `validate_name` rejects path separators and `.`/`..` names.

## Layer 2 — coverage and frontend drivers

### Frontend call sites for uncontained commands

- `workspace::read_text_file` / `write_text_file` — `src/lib/project/api/backend.ts:68,72`; wrapper takes `path: string`. Value originates from tree selection / open tabs and persisted `open_files` in `settings.json`; a stale session or crafted settings can hand an absolute path. Hostile project: a symlinked working copy whose file entry paths resolve outside root; but because no root is passed, any tab path is honored.
- `workspace::list_dir` — `backend.ts:64`; path from folder tree expand. A symlinked directory node passes its real target string; arbitrary dir listing possible even without crafting.
- `search::replace_project` / `search_project` — `src/lib/project/api/search.ts:25,45`; `root` from project store. Escape requires a symlink inside the project (hostile clone) since root itself is chosen by user.
- `format::format_document` — `backend.ts:84`; `root`+`path` from editor tab. Path need not be under root; `nearest_clang_format` walks ancestors to `/`.
- `settings::read/write_project_settings` — `src/lib/project/api/settings.ts:47,51`; root from project store; writes `<root>/.quarry/settings.json` without canonicalising; a symlink root redirects.
- `run_config::{read,write,resolve}_launch_config` — `src/lib/project/api/run.ts:38-46`; root from project. `resolve_against` returns absolute `program`/`cwd` verbatim (intended for binaries), but root only absolute-rooted.
- `files::list_files` — `backend.ts:76`; read-only listing of arbitrary root.
- `new_project::create_project` — `backend.ts:60`; `parent` from dialog; directory creation anywhere writable is intended.
- `pty::pty_open` — `src/lib/project/api/terminal.ts:9`; arbitrary `cwd` by design.
- `open_project` — `backend.ts:45`; probes ancestors above root up to `/` looking for manifests, which can load a project from an unexpected ancestor.

### Complete command inventory (from `generate_handler!`, lib.rs:43–142)

Contained (ensure_within): files::create_file, create_dir, rename_path, delete_path.

Uncontained but path-taking: workspace::list_dir, read_text_file, write_text_file; files::list_files; project::open_project; new_project::create_project; search::search_project, replace_project; format::format_document, formatter_for (classifier only); settings::read_project_settings, write_project_settings; run_config::read_launch_config, write_launch_config, resolve_launch_config; terminal pty_open (cwd); git::* (repo root passed throughout, git constrains); build/run/test config command roots.

Path-adjacent, no fs writes: toolchain::toolchains, launch::_, run_task::_, test_task::_, dap::_ (binary paths from user but exec under launch), lsp::* (path is session-keyed), settings::read/write_settings (app config dir only).

Not path-taking: version, processes::list_processes, menu handlers.

### Smallest correct fixes

- workspace read/write/list: add `root` param (frontend contract change) + `ensure_within` at boundary; if root cannot be threaded, confine to a stored root from settings — but frontend change is required because there is no root today.
- search: canonicalise root first and skip symlinks + `ensure_within` per file.
- format: bound `nearest_clang_format` at root and validate path with `ensure_within`.
- settings/run_config: canonicalise root (already partly) and optionally `ensure_within` against itself — no-op conceptually; fix is reject symlink roots.
- git: already repo-scoped by git; add canonical root check before spawning.

Commands requiring frontend contract change: `workspace::{list_dir,read_text_file,write_text_file}` must gain `root`; all others keep signatures.
