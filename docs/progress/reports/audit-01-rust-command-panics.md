# Audit 01 — panic paths in Tauri command layer

Scope: `src-tauri/src/**/*.rs` non-test code. Read-only.

## Summary

The Rust command layer is unusually defensive: every `#[tauri::command]` returns `Result<_, String>`, IO errors are mapped with `map_err`, and `unwrap()`/`expect()`/direct indexing in non-test code are almost absent. No P0/P1 findings.

## Findings

### P3 — `new_project/create_project.rs:133` `unreachable!()`

In `create_project`, the second `match kind.as_str()` arms handle each accepted kind and falls through to `_ => unreachable!()`. The `kind` is validated earlier (lines 53-60) against the same four values, so this cannot fire on a normal call. It is, however, a hard panic if that invariant is ever broken by a refactor (e.g. a new kind added to the first match but not the second). Convert to `return Err(format!("unknown project kind \"{kind}\""))` or `debug_assert!` + error.

### P3 — `run_task/impl_runstate.rs:83` `chars.next().unwrap()`

`valid_env_name` does `let first = chars.next().unwrap();` after `if name.is_empty() { return false; }`, so it is safe. But the guard and the unwrap are separated by control flow; a future edit that removes the empty check (or reorders) reintroduces a panic on an empty env var name supplied by the user via the run-config UI. Prefer `let Some(first) = chars.next() else { return false; };`.

### P3 — `src-tauri/src/lib.rs:152` `.expect("error while building the application")`

Application-builder setup, not an IPC command; panics only at startup. Acceptable, but it is the only process-wide exit point if builder config fails. No user reachability.

## Checked, no issue

- `unwrap()` in non-test files: only the three sites above; all others are inside `#[cfg(test)]` modules.
- Direct indexing (`fields[N]`, `chunk[N]`, `bins[0]`): each is guarded by a length check immediately before (e.g. `parse_entry.rs:47/57/67`, `find_with_xcrun.rs:104,116,128`, `semantic_tokens_from` uses `as_chunks::<5>()`).
- Division: none on a variable denominator in non-test code.
- Integer casts (`as u32`/`as usize`): Rust wrapping semantics, no panic.
- File IO commands (`read_text_file`, `list_dir`, `rename_path`, `delete_path`) map errors to `String`.
- Git porcelain parsers return `Option` and reject short field lists.
- `uri_to_path` in `lsp/position.rs` bounds its slice with `index + 2 < bytes.len()`.
- `semantic_tokens_from` drops a trailing partial chunk rather than indexing out of bounds.

No P0-P2 findings. No code changed.

## Second layer — helpers, threads, Drop impls

- Spawned work: git/build/search/format commands go through `tauri::async_runtime::spawn` (blocking closures returning `Result`); no `spawn_blocking` panics observed.
- `Drop` impls: `ProcessPipe` (`impl_processpipe_1.rs:147`), LSP `Session` (`handshake_timeout.rs:142`), `PtyState` (`output_event.rs:62`), `RunState` (`impl_runstate.rs:19`), `DapState` (`impl_session.rs:162`) all use a poison-recovering `lock` helper (`mutex.lock().unwrap_or_else(|p| p.into_inner())`), and ignore kill/wait results with `let _ =`. No panic-on-unwind paths.
- Helpers audited (path joins, slice ops, parsers listed above): all guard lengths; `uri_to_path` bounds slice correctly.

## Rust test coverage gaps for panic shapes

- No fuzz/property tests for `parse_entry`, `parse_git_blame`, `parse_match_line` against arbitrary input (only fixture-shaped inputs).
- No test feeds a file whose metadata changes between the `metadata()` and `fs::read()` calls in `read_text_file` (TOCTOU) — not a panic, but an error path untested.
- `valid_env_name` empty-string guard is the only thing protecting `chars.next().unwrap()`; no regression test documents that invariant (removal would silently reintroduce the panic).

No new P0–P3 findings from the second layer.
