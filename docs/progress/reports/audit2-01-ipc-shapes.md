# Audit 2 — IPC shapes

Scope: Rust structs/enums returned over Tauri IPC vs TypeScript consumers in `src/lib/project/api/*`.

## Findings

- P3 `src-tauri/src/settings/settings_core.rs:25` / `src/lib/project/api/settings.ts:5` — Rust `Settings` serializes `debug_open: bool` (rename_all camelCase → `debugOpen`), but the TS `Settings` type omits it. Symptom: a saved `debugOpen` value is present on disk and in the payload but invisible to the frontend type; harmless at runtime because the field is ignored, but a strict round-trip audit would flag it.
- P3 `src-tauri/src/types/toolsource.rs:27`, `src-tauri/src/pty/output_event.rs:22`, `src-tauri/src/search/default_max_results.rs:25` — `ToolchainReport`, `PtyOpenResult`, `ReplaceReport` derive `Serialize` without `rename_all`, yet their fields are already single words or deliberately snake_case and the TS side mirrors that. No runtime mismatch; note that any future multi-word field added here will arrive snake_case by default.
- P3 `src-tauri/src/types/launchfile.rs:159` / `src/lib/project/api/lsp-types.ts:52` — `CodeAction.command` is `Option<Value>` in Rust (may serialize an object) but typed `command?: string` in TS. Only relevant if a code action carries a command; currently no frontend consumer reads it, so no user-visible symptom.

## Cleared

Checked every Rust struct under `src-tauri/src/types`, `git/`, `pty/`, `settings/`, `lsp/` against its TS counterpart in `src/lib/project/api/*`: field names after camelCase rename (including `durationMs`, `threadId`, `variablesReference`, `instructionPointer`, `unreadableBytes`, `dataId`, `accessTypes`, `itemId`, `buildRoot`, `launchConfig`, `isDir`), `Option<T>` → `T | null`, enum variants (`ToolSource`, `ProjectKind`), tuples (`RunConfiguration.env` as `[string,string][]`), and event payloads (`DiagnosticsEvent`, `DapStoppedEvent`, `DapOutputEvent`, `RunOutputEvent`, `PtyOutputEvent`). No camelCase/snake_case, null/undefined, variant, or tuple-vs-object mismatch that changes runtime behaviour was found. `commands.test.ts` confirms every invoked command is registered.
