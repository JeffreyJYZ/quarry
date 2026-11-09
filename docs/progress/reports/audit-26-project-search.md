# Audit: project search (find-in-files)

Scope: Rust command `search_project` + frontend search palette.

## Findings

### P1 — result click opens the file but never reveals the matched line/column

- `src/ui/search/SearchResults.tsx:33` — `onClick={() => onOpen(row.match.path)}` passes only the path.
- `src/ui/search/useSearchQuery.ts:175` — `submit` likewise `onOpen(row.match.path)`.
- `src/ui/app/useFileNavigation.ts:31-36` — `openMatch(path)` only opens the file and never calls `setRevealTarget`/`setRevealToken`, unlike `selectProblem` and `navigate`.
- Editor reveal (`src/ui/editor/useEditorEffects.ts:87-92`) expects 0-based `line`/`character`; `SearchMatch` carries 1-based `line`/`column` (`src-tauri/src/types/toolsource.rs:124-127`), so a fix must subtract 1.

Impact: clicking a search hit lands at the top of the file instead of the match. Fix: widen `onOpen`/`openMatch` to accept `(path, line, column)`, call `setRevealTarget({ line: line - 1, character: column - 1 })` + bump token, and pass `row.match.line`/`row.match.column` from both click and submit.

### P2 — stale query keeps its ripgrep process running

- `src/ui/search/useSearchQuery.ts:74-126` — `run` increments `sequence` and ignores a late result, but never aborts the in-flight `searchProject` invoke.
- `src-tauri/src/search/search_core.rs:46-59` — the child is only killed when `truncated` (cap hit); a normal or cancelled run is awaited to completion.

Impact: fast typing spawns several `rg` processes; on a large tree they contend and the last one wins only by sequence guard. Fix: expose a cancel token / `kill` on the Tauri side, or track and kill the previous child handle when a new query starts.

### P3 — backend relies on ripgrep's implicit .gitignore handling

- `src-tauri/src/search/search_core.rs:101-103` applies only the static `ignore::ripgrep_excludes()` globs (`!target`, `!node_modules`, `!dist`, `!.git`, etc.).
- ripgrep honours `.gitignore` by default, so this is not currently broken, but the ignore set is not asserted anywhere in the search tests and a future `--no-ignore` would silently regress it.

Impact: low today; add a regression test pinning that a `.gitignore`d path is excluded.

## Checked, no issue

- Deleted-file results: `rg` reads the filesystem at query time; there is no stale index, so a deleted file cannot appear.
- Case sensitivity / regex: `search_command` uses `--case-sensitive` or `--smart-case`, plus `--fixed-strings` when not regex (`src-tauri/src/search/search_core.rs:92-99`); invalid regex surfaces as an rg status-2 error.
- Column parsing: `parse_match_line` takes the first submatch `start` (0-based byte offset) and adds 1 (`src-tauri/src/search/parse_match_line.rs:45-55`), matching the documented 1-based column.
- `.gitignore` and heavy dirs: static excludes cover `target`, `node_modules`, `dist`, `.git`, `.cache`, `CMakeFiles`, `cmake-build-*` (`src-tauri/src/ignore.rs:11-22`).
- Stale results in UI: sequence-ticket guard prevents an older run from overwriting a newer one (`src/ui/search/useSearchQuery.ts:108-125`).
