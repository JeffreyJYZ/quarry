# Temp files outside the settings writer — audit

Scope: Rust/Tauri backend of `/Users/jyz/dev/monorepos/quarry`. Frontend (`src/`) has no temp-file writes.

## Findings

### P1 — `git/build_hunk_patch.rs:112` predictable temp patch path, not cleaned on spawn failure

```rust
let tmp = std::env::temp_dir().join(format!("quarry-hunk-{}.patch", id));
std::fs::write(&tmp, patch.as_bytes())...?;
...
let output = Command::new(&program).args(&args)...output()
    .map_err(|e| ...)?;          // propagates before remove_file
let _ = std::fs::remove_file(&tmp);
```

- Name is predictable (`quarry-hunk-<id>.patch`) in the shared OS temp dir. `id` is a hunk id, not a secret, so an attacker in a shared `/tmp` can pre-create a symlink at that path and redirect the write (and the subsequent `git apply` reads that file). Write is `fs::write` (truncate, follows symlink), no `create_new`.
- Cleanup: `remove_file` runs only when `Command::output()` succeeds; on spawn failure the `?` skips it and the file survives. On the `git apply` failure path cleanup does run.
- Mode: default umask, no explicit `0o600`.
- Fix: generate a unique name (pid + counter or `tempfile` crate, already in `Cargo.lock`), open with `OpenOptions::create_new(true)`, set mode `0o600`, and remove in a scope guard (or `Drop`) so every exit path cleans up. Better: pipe the patch to `git apply` via stdin and drop the temp file entirely.

### P2 — `run_config/launch_dir.rs:52` writes `launch.json` with truncating `fs::write`, not atomically

```rust
fs::write(&path, json).map_err(...)?;
```

- Inconsistent with the settings writer (`settings_core.rs:100` `write_atomic`), which uses sibling temp + rename + sync. A crash or full disk mid-write leaves a truncated `launch.json`, and the next launch reads a parse error.
- Fix: route through the same `write_atomic` helper (it is `pub(crate)` in `settings`), or replicate the sibling-temp + rename + sync pattern here.

### P2 — `search/default_max_results.rs:103` bulk-replaces files with `fs::write` (truncate)

```rust
match fs::write(&path, &new_text) { ... }
```

- Each matched file is truncated in place; an interrupted run leaves a half-written source file. The change is not atomic.
- Fix: write to a sibling temp + rename per file, reusing `write_atomic` semantics, or document that the operation is best-effort and re-run on failure.

### P3 — `settings/settings_core.rs:100` atomic writer uses a predictable sibling temp name without `create_new`

```rust
let temp = path.with_file_name(format!("{}.tmp", path.file_name()...));
let mut file = fs::File::create(&temp)...;
```

- Sibling temp name is fixed (`settings.json.tmp`), so `File::create` truncates a pre-existing one rather than failing; in a directory another user can write, this is a mild TOCTOU. Cleanup only on the rename-failure branch; `write_all`/`sync_all` failures leave the temp behind.
- The task excludes the settings writer as the reference implementation, so this is a hardening note rather than a required fix. Fix: `OpenOptions::create_new(true)`, mode `0o600`, and remove the temp on every error path.

## Cleared

- `workspace/tests_1.rs` `write_text_file`: sibling temp with pid+counter, `create_new(true)`, mode preserved, `remove_file` on both rename failure and write failure, sync. This is the reference implementation and is sound.
- `new_project/create_project.rs`: writes into a freshly created project directory owned by the user; not a temp file and not in a shared dir.
- `build_task/collect_plain_clang_sources.rs`: only creates `<root>/.quarry/build` (project-local build output), expected.
- `dap/`, `format/run.rs`, `format/tool_search.rs`: no filesystem writes of temp/generated files (stdin/stdout only; tests use temp dirs).
- No lock files found in production code.
- Frontend has no temp-file writes.
