# Audit 2.09 — replace-in-files correctness

Scope: `src/lib/search/model.ts`, `src/ui/search/useReplace.ts`, `src/ui/editor/useEditorSearch.ts`, `src-tauri/src/search/default_max_results.rs` (replace), `src-tauri/src/search/parse_match_line.rs`.

## P0

- `src-tauri/src/search/default_max_results.rs:94-109` — `replace()` walks the tree and calls `fs::write` per file with no transaction. A write failure (line 108) is pushed to `errors` and the loop continues, so files already written stay changed while later files abort. No rollback, no temp+rename. Fix: stage all new contents in memory, write via temp file + atomic rename, and on any failure restore originals (or fail before touching disk).
- `src-tauri/src/search/default_max_results.rs:94` — `fs::read_to_string` then `fs::write` of a `String` treats the file as UTF-8 text. For CRLF files, regex `.` matches `\r` (Rust regex `.` excludes only `\n`), so a pattern like `.*` consumes the trailing `\r` and `replace_all` drops it, rewriting CRLF as LF on any matched line. Fix: operate on bytes or strip/restore `\r\n` around the match; simpler, read bytes, decode, run regex on `\n`-split lines and rejoin with original line endings.

## P1

- `src-tauri/src/search/default_max_results.rs:102` — `re.replace_all(&text, replacement)` always interprets `$1`, `${name}`, `$&` in `replacement`, even when `fixed_strings` is true. A literal replacement containing `$` (e.g. prices) is silently rewritten. Fix: when `fixed_strings`, escape `$` in replacement (`$$`) or use `replace_all` with a closure returning the literal.
- `src/lib/search/model.ts:138-149` — regex mode builds `repl = replacement.replace(/\$\{(\w+)\}/g, "$<$1>")` then `line.replace(re, repl)`. JS `String.replace` also interprets `$&`, `$'`, `` $` `` and numbered groups; a replacement containing those (or a lone `$`) is not inserted verbatim. Fix: pass a function replacer `() => replacement` and handle capture refs manually, or document/escape.
- `src-tauri/src/search/default_max_results.rs:94-109` — replace reads from disk and writes back even when the file is open with unsaved changes in the editor. The in-memory buffer is neither consulted nor updated, so the on-disk rewrite either clobbers pending edits or is immediately stale. Fix: either skip files with open dirty buffers (report them) or push the new text into the editor buffer; at minimum report skipped paths.

## P2

- `src/lib/search/model.ts:25-27` — `revealTarget` subtracts 1 from `column` treating the backend's byte offset as a character index. ripgrep's `submatches[].start` is a byte offset (`parse_match_line.rs:46-50`), so for any match after a multi-byte character the reveal lands too far right (or splits a code point when sliced). Fix: convert byte offset to a UTF-16/CodeMirror position using the matched line's text, or have the backend emit character offsets.
- `src/ui/editor/useEditorSearch.ts:125-135` — `replaceAll` maps matches to `{from,to,insert: replacement}` with the literal replacement. For regex queries it inserts the literal replacement instead of expanding capture groups, and it does not recompute matches after. Fix: compute the expanded replacement per match using the match text, and re-run `recompute` after dispatch.

## Cleared

- `parse_match_line.rs:77-81` `strip_trailing_newline` handles both `\r\n` and `\n`, so line text is not corrupted on parse.
- Frontend `applyReplacement` literal path (`model.ts:151-159`) uses a function replacer, so literal replacement is inserted verbatim there.
- Backend replace counts matches with `re.find_iter` independently of `replace_all`, so the reported count matches even when replacement contains `$` (count unaffected).
- No second writer on the same file in the audited paths beyond the ones noted.
