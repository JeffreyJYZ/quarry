# Audit: WorkspaceEdit application (rename / code action / refactor)

Area audited: `src/lib/refactor/apply.ts` plus backing Rust commands (`src-tauri/src/lsp/lsp_rename.rs::parse_workspace_edit`, `src-tauri/src/workspace/tests_1.rs::write_text_file`, `src-tauri/src/workspace/max_text_bytes.rs::read_text_file`).

## Findings

### P0 — Open/dirty buffer is never compared to the edit's baseline

- File: `src/lib/refactor/apply.ts:44-49`
- What: when a buffer exists it edits `buffer.text` directly and never compares `buffer.loaded` (the on-disk snapshot) to what the edit assumed. `isDirty` (`src/lib/project/buffer.ts:11-12`) is not consulted, so a user's unsaved in-memory changes get the WorkspaceEdit applied on top without consent or version check.
- Why: rename after typing can corrupt an unsaved buffer; the edit's ranges were computed against a different text.
- Fix: require `!isDirty(buffer)` or rebase the edit onto `buffer.text` by matching ranges, and surface a conflict when the baseline differs.

### P0 — Offsets recomputed after every edit, so later (higher) edits are measured against already-mutated text

- File: `src/lib/refactor/apply.ts:27-34`
- What: `applyEdits` loops descending and recomputes `toOffset(result,...)` after each replacement, but the descending start sort (`src/lib/refactor/apply.ts:18-26`) keeps positions only when no replacement crosses an earlier range; ties resolve to `0`, leaving equal-start edits in insertion order.
- Why: two edits that share a start, or an edit whose replacement contains newlines, shift every range computed later.
- Fix: collect original spans, map them through one offset table, or apply all edits against the original string in one pass.

### P1 — No version field is parsed or checked

- File: `src-tauri/src/lsp/lsp_rename.rs:91-94,126-130`; `src/lib/project/api/lsp-types.ts:50-51`; `src/lib/refactor/apply.ts:37-38`
- What: `documentChanges[].textDocument.version` is ignored; `FileEdit` has no `version`; `applyFileEdits` never receives one.
- Why: a stale rename can overwrite text written since the request, because nothing rejects a mismatched document version.
- Fix: carry `version` through `FileEdit`, and in `applyFileEdits` skip/refresh when `buffer.version !== edit.version` (or read fresh from disk and rebase).

### P1 — Partial failure across files leaves an inconsistent tree

- File: `src/lib/refactor/apply.ts:43-61`
- What: each file is processed in sequence; a read/write error pushes to `failed` and the loop continues with already-applied siblings. There is no rollback or transactional check.
- Why: a rename that fails mid-way leaves some files renamed and others not, with no recovery hint.
- Fix: pre-validate all paths, apply in a staged batch, and on first error either roll back written files or report which remain.

### P2 — CRLF/encoding conversion risk on write

- File: `src/lib/refactor/apply.ts:5-15,53-55`; `src-tauri/src/workspace/max_text_bytes.rs:77-78`; `src-tauri/src/workspace/tests_1.rs:81-94`
- What: `toOffset` always splits on `"\n"`, so `\r` becomes part of the line length; `newText` from the LSP is typically LF, and `writeTextFile` writes whatever string it gets as UTF-8 with no BOM or line-ending preservation.
- Why: a CRLF file can become mixed LF/CRLF and a BOM can be dropped or duplicated.
- Fix: split lines on `/\r?\n/` and track the terminator per line, or route text edits through the buffer's recorded line-ending and encoding.

### P2 — Buffer case leaves no disk write, so "applied" is not durable until save

- File: `src/lib/refactor/apply.ts:44-50`
- What: open files are only mutated in memory; closed files are written to disk. A crash before save loses the rename for open tabs, while the closed-file half is already on disk.
- Why: after a rename, the persistent state differs by tab state.
- Fix: persist open-buffer edits to disk as part of apply, then reconcile `loaded`/`markSaved`, or clearly mark affected buffers dirty.

## Cleared / not found

- No use of byte offsets or UTF-16 conversion issues beyond the documented LSP character counting; `toOffset` uses JS code unit lengths, which matches LSP UTF-16 in principle.
- Sort is descending by start line, which is the conventional safe direction for non-overlapping edits.
- Empty `edits` arrays are filtered on the Rust side before `FileEdit` is pushed, so no empty files are written.

Report: docs/progress/reports/audit2-14-workspace-edit.md
