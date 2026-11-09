# Rust git/search consts scan

## High-value find: duplicated ignore list

`src-tauri/src/search/default_max_results.rs` `replace()` walks dirs with a hardcoded match:

```
"target" | "node_modules" | "dist" | ".git" | ".quarry"
```

`src-tauri/src/ignore.rs` `DIRS` is the canonical list and contains seven entries: `target`, `node_modules`, `dist`, `.git`, `.quarry`, `.cache`, `CMakeFiles`, plus `DIR_PREFIXES = ["cmake-build-"]` and `FILES = [".DS_Store", "CMakeCache.txt", "cmake_install.cmake"]`.

So `replace()` misses `.cache`, `CMakeFiles`, `cmake-build-*` and the three ignored files. `search()` uses `ignore::ripgrep_excludes()` and is correct. The doc comment in `ignore.rs` explicitly says the two surfaces must not drift; `replace()` breaks that invariant. Move the walk to `crate::ignore::is_dir`/`is_file` (or reuse `ripgrep_excludes`).

## Timeouts / caps

- `src-tauri/src/git/bounded_run.rs`: `GIT_TIMEOUT = 30s`, `GIT_POLL_INTERVAL = 10ms`, `COMMAND_LABEL_LIMIT = 120` (truncation of command label in error). Single home, used by all git commands.
- `src-tauri/src/search/default_max_results.rs`: `DEFAULT_MAX_RESULTS = 300` (search cap). `max_results == 0` short-circuits to empty report.
- `elapsed_ms` in parse_match_line.rs uses `u64::try_from(...).unwrap_or(u64::MAX)`.

## Exit-code meanings

- search: rg exit 1 = no matches (not an error); 2+ = failure via `ripgrep_error` (search_core.rs:64-69, parse_match_line.rs:131).
- No git exit-code interpretation found; git commands go through `output_within` returning `Output` with status; callers likely check `status.success()`.

## Git flag strings

Concentrated in commit.rs / git_stage.rs / relative_path.rs: `diff --cached --quiet`, `rev-parse --short HEAD`, `checkout_argv`, `commit_argv`. No duplication across modules spotted beyond argv helpers.

## Ignore globs

Only `ignore::ripgrep_excludes()` builds `-g !name` globs; search_command uses it. The duplicated hardcoded set is only in `replace()`.

## Other notes

- `replace()` has no use of `ignore` despite `pub(crate) use crate::ignore;` at top — dead import allowed by `#![allow(unused_imports)]`.
- search `PROGRAM = "rg"`, `MISSING_PROGRAM` brew hint.
