# Audit 50 — formatting dispatch (format-on-save, code actions)

Read-only. Files inspected: `src/ui/app/useSaveBuffers.ts`, `src/ui/editor/useFormatDocument.ts`, `src/lib/project/save.ts`, `src-tauri/src/format/{max_input_bytes,parse_edition_value,run}.rs`.

## Findings

- P1 `src/ui/app/useSaveBuffers.ts:76-108` — format-on-save snapshots `buffer = found` before awaiting `formatterFor`/`formatText`, then writes that snapshot. A concurrent edit during the await is overwritten by the stale `buffer` (and the `setBuffers` replace), so the save lands pre-edit text. Fix: re-read the latest buffer entry right before `saveBuffer`, or abort when `found` no longer matches `buffersRef.current`.
- P2 `src/ui/app/useSaveBuffers.ts:85` — format-on-save runs on every `saveActive` (Cmd+S) with no dirty check; even an unmodified file is reformatted and `saveBuffer` always calls `writeTextFile`, so a no-op save still rewrites disk. Fix: skip the format + write when the buffer is not dirty and `formatted === buffer.text`.
- P2 `src-tauri/src/format/parse_edition_value.rs:86` — `clang_style` derives the style from `nearest_clang_format(path)`, walking parents of the _source file_. For a file outside the project root this can pick up an unrelated ancestor `.clang-format` (or none) instead of the project's; `root` is not consulted for clang. Fix: search from the project root downward for `.clang-format` first, falling back to the file's ancestors only when root has none.
- P3 `src-tauri/src/format/max_input_bytes.rs:38-43` — `format_document` returns `Ok(text)` for `Formatter::None`, a silent no-op that looks like success; the frontend already guards via `formatterFor`, but any direct caller gets unchanged text with no error. Fix: return `Err("no formatter for this file type")` for `None`, or keep `Ok` but document it; align with `useFormatDocument`'s `no formatter for .ext` notice.
- Checked OK: JSON path keeps indent + trailing newline and leaves invalid JSON untouched (`save.ts:28-70`, `useFormatDocument.ts:33-40`); TOML missing taplo yields `no formatter for .toml: install taplo-cli` (`run.rs:123`); YAML has no formatter and reports `no formatter for .yaml` (`useFormatDocument.ts:49-51`); Rust sets `current_dir(root)` for rustfmt (`run.rs:39-41`); clang-format failures surface stderr via `stderr_detail` (`run.rs:93-99`).
- Checked OK: `formatText` returning null on error notifies via `onNotice` (`useFormatDocument.ts:36-38,55-57`); saveBuffer records a warning on format failure (`save.ts:98-101`).

## Checked, no issue

- YAML/TOML/JSON dispatch branches all exist and match docs.
- `MAX_INPUT_BYTES` guard rejects oversized input by name (`max_input_bytes.rs:78-85`).
- `run` uses bounded 30s wait and does not write to disk (`run.rs:62-80`).
