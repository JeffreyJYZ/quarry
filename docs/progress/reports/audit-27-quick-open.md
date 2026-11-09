# Audit 27 — quick open (Cmd+P)

## P1 — stale file index after create/rename/delete

`src/ui/quickopen/useQuickOpen.ts:52-75` caches the file list in a module-level `Map` (`parts.ts:5`) for `STALE_MS = 30_000` (`src/lib/consts/quickopen.ts:3`). `fetchFiles(true)` exists and the refresh button calls it (`QuickOpen.tsx:68`), but nothing invalidates the cache when the file tree creates/renames/deletes a file (`src/ui/components/useFileTree.ts:136-168` calls `refreshDir` only). So a newly created file is invisible in quick-open for up to 30 s, and a deleted file can still be picked until the cache expires. Fix: call `fetchFiles(true)` (or invalidate `cache` for `root`) from the tree's `commitEdit`/`confirmDelete` paths, or drop the cache and re-list on open.

## P1 — active index not clamped when results change

`useQuickOpen.ts:144-148` scrolls the active row but never resets/clamps `active` when `displayList` shrinks (fetch, refresh, or typing that filters). `move` wraps with modulo, but a stale `active` can point past the end until the user moves; `submit` then reads `displayList[active]` = undefined and no-ops (`:155-157`). The only reset is `setQuery` → `setActive(0)` in `QuickOpen.tsx:30`, which misses refresh and external fetch. Fix: add `useEffect` that clamps `active` to `displayList.length - 1` (or 0) whenever `displayList` changes.

## P2 — duplicate ignore list drifts from Rust

`src-tauri/src/ignore.rs:10-25` is the shared list (target, node_modules, dist, .git, .quarry, .cache, CMakeFiles, cmake-build-*, CMakeCache.txt, …). But `src/lib/lsp/rootSignals.ts:6` keeps its own `SKIP_DIRS = new Set(["target", "node_modules", ".git", "build", "out"])` — a second copy that omits `.quarry`, `.cache`, `CMakeFiles`, `cmake-build-*`, `dist`, and adds `build`/`out`. A C++ project's generated CMake/clangd output is filtered by Rust's list for quick-open/search but still walked by `rootSignals` (and vice versa for `build/`/`out/`). Fix: import one list; either expose the Rust list to TS via a command or define the TS set from the same source of truth.

## P2 — recents hold deleted paths

`parts.ts:6` keeps `recent` as a module array (capped at 200, `:14`) and `recordRecent` never removes entries. Display filters with `files.includes(path)` (`useQuickOpen.ts:120,133-134,141,168`), so deleted files disappear from the list — but they remain in `recentSet` used by `rankFiles` (`rank.ts:89`) and in the array, so a recreated file is treated as recent with no re-check, and the array grows. Fix: prune `recent` against the latest file list inside `fetchFiles` after `setFiles`, and in `recordRecent` drop paths not present.

## P3 — basename vs path ranking ambiguity

`rank.ts:108-129`: a basename subsequence match is tier 3, while a plain path substring is tier 4, so any fuzzy basename match outranks a direct path substring (e.g. query "src" matches path substring in `foo/src/bar.rs` only at tier 4, while a file literally named with the letters ranks higher). The comment says "File-name matches always rank above path-only matches", which is the stated intent, but there is no test pinning tier boundaries. Low risk; document or add a test.

## Checked, no issue

- `cache`/`recent` are module-scoped, shared across mounts; no per-root leak found.
- Keyboard `ArrowUp/Down/Tab/Home/End/Enter` handled in `QuickOpen.tsx:32-62`; Escape/Cmd+P handled in `useQuickOpen.ts:93-111`. No selection-loss-on-results bug beyond the clamp above.
- `matchPositions` boundary scoring and case-insensitivity look consistent with comment.
- `ignore::is_dir`/`is_file` used by both `collect` (quick-open) and search, so Rust surfaces share one list.
