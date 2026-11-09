# audit2-08-large-files

Scope: `MAX_TEXT_BYTES` (2 MiB) and every file-read path. Read-only audit.

## Constants

- `src-tauri/src/workspace/max_text_bytes.rs:16` `MAX_TEXT_BYTES = 2 * 1024 * 1024` (2,097,152).
- `src-tauri/src/format/max_input_bytes.rs:13` `MAX_INPUT_BYTES = 4 * 1024 * 1024` (4,194,304).

## Read path

- `src-tauri/src/workspace/max_text_bytes.rs:64-79` `read_text_file`: `fs::metadata` size check (`> MAX_TEXT_BYTES` → error), then `fs::read`, then `String::from_utf8`. Error string includes byte count. No binary sniff; invalid UTF-8 → "not valid UTF-8".
- Frontend `src/ui/app/useWorkspace.ts:101` awaits `readTextFile`; on throw shows `Could not open <name>: <error>` notice. User is told.
- `src/ui/app/useSessionPersistence.ts:76` reads each `openFiles` entry in a loop and swallows errors with `/* skip unreadable file */` — no notice. A file over the cap or non-UTF-8 silently disappears from the restored tab set.

## Write path

- `src-tauri/src/workspace/tests_1.rs:21-31` `write_text_file`: `text.len()` (bytes) checked against `MAX_TEXT_BYTES`; oversized write refused before touching disk. Cap matches read cap.

## LSP

- `src-tauri/src/lsp/impl_lspstate.rs:60-77` `lsp_open_document` stores full `text` and sends `textDocument/didOpen` with `"text": text`. No size cap.
- `src-tauri/src/lsp/impl_lspstate.rs:96-149` `lsp_change_document` stores full text and sends full or incremental change; allocates `Vec<u16>` over both old and new text. No cap.
- Frontend `src/lib/lsp/session.ts:141-143` opens with `latest.current.text` (the whole buffer) whenever a server is ready. For a 2 MiB file that is a 2 MiB JSON-RPC payload to rust-analyzer/clangd, plus semantic tokens back.

## Format

- `format_document` (`src-tauri/src/format/max_input_bytes.rs:38-49`) checks `text.len()` against 4 MiB, but editor content is already capped at 2 MiB, so this limit is unreachable from the editor and only guards direct callers. Mismatched constants, minor.

## Findings

### P1 — LSP receives whole documents with no size cap (`src-tauri/src/lsp/impl_lspstate.rs:60, 96`)

A 2 MiB file that opens successfully is handed in full to rust-analyzer/clangd on open and on every keystroke (incremental diff still builds two `Vec<u16>` of the whole document). There is no guard. Impact: UI and language server can stall; memory doubles. Fix: skip LSP sync above a threshold (e.g. 256 KiB or reuse MAX_TEXT_BYTES with a lower LSP-specific cap) in `useDocumentSync`/`serverKindForPath` path, or add a size check in `lsp_open_document`.

### P2 — Restored session silently drops oversized/non-UTF-8 files (`src/ui/app/useSessionPersistence.ts:76-85`)

The `catch {}` discards them with no notice. A user reopening a project with a large generated file in `openFiles` loses that tab silently. Fix: surface a one-line notice per skipped file, or filter `openFiles` at save time.

### P2 — No binary sniff; relies on UTF-8 decode (`src-tauri/src/workspace/max_text_bytes.rs:78`)

`String::from_utf8` rejects invalid bytes, so no mangle occurs, but a UTF-8-looking binary (e.g. a minified bundle that happens to be valid UTF-8) opens as text and the editor/highlighter attempt to render 2 MiB. No freeze guard in CodeMirror or semantic tokens. Fix: optional NUL-byte check before decode; consider disabling syntax highlighting/semantic tokens above a size threshold. (No measured freeze reproduced; report as potential.)

### P3 — Format cap (4 MiB) exceeds editor read cap (2 MiB) (`src-tauri/src/format/max_input_bytes.rs:13` vs `src-tauri/src/workspace/max_text_bytes.rs:16`)

Unreachable from editor content; harmless but inconsistent. Fix: align or document.

## What a 3 MiB file experiences

1. Click in file tree → `openPath` → `readTextFile` → backend returns error "… 3145728 bytes exceeds the 2097152 byte limit".
2. Frontend shows notice `Could not open <name>: …`. File is not added as a tab. No mangle.
3. If the path was in persisted `openFiles`, session restore skips it silently (P2).
4. LSP is never invoked for it.

## Cleared

- Binary files are not decoded/mangled: `String::from_utf8` rejects invalid UTF-8 (`max_text_bytes.rs:78`).
- Exact 2 MiB boundary is allowed (`>` check).
- Write path enforces the same cap.
- No crash/panic on oversized read (error returned).
