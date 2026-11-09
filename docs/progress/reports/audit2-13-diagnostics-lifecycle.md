# Audit 2.13 — Diagnostics Lifetime

Scope: `/Users/jyz/dev/monorepos/quarry` (Rust Tauri + React). Read-only audit. No source edited.

## Findings

### P0 — Dead LSP session leaves stale diagnostics counted

- Where: `src-tauri/src/lsp/pump.rs:151-164` (`server_gone` sets `dead=true`, clears `pending`); `src/lib/lsp/feed.ts:23-28` (only publishes events that arrive); `src/ui/app/useDiagnosticsState.ts:23-24` (server map persists).
- What is wrong: when the language server exits or its session stops, the pump marks the session dead but emits nothing. The frontend keeps the last `server` map, so stale findings remain in `diagnostics`, `counts`, and the problems panel indefinitely. `reset()` only runs on project open.
- Why it matters: the status-bar badge and problems panel keep reporting errors from a server that no longer exists; users cannot clear them without reopening the project.
- Fix: emit an empty `publishDiagnostics` for each open document (or a session-level "cleared" event) when `server_gone` runs, and have the frontend drop the affected path; alternatively clear the whole server map in `useDiagnosticsState` when LSP stops for the root.

### P1 — Squiggles persist after a file is fixed and closed

- Where: `src/lib/lsp/session.ts:158-167` (`useDocumentSync` cleanup calls `lspCloseDocument` only); `src/lib/lsp/diagnostics.ts:44-57` (`withServerDiagnostics` clears only on an empty publish); `src/ui/editor/useDiagnosticsPublish.ts:18-27`.
- What is wrong: closing a document sends `textDocument/didClose` but the frontend never publishes an empty diagnostic set for that path, and the server is not guaranteed to push one. The editor's lint state and the problems panel therefore keep the old squiggles.
- Why it matters: a fixed file still shows errors in the editor and problems list until the server happens to republish.
- Fix: in `useDocumentSync` cleanup, call `diagnostics.publish(path, [])` (or clear via the diagnostics state) before/alongside `lspCloseDocument`, and keep the lint signature reset so `setDiagnostics` runs.

### P1 — Renamed file leaves diagnostics keyed under the old path

- Where: `src/lib/lsp/diagnostics.ts:4-5` (`DiagnosticMap` keyed by absolute path); `src/lib/problems/model.ts:106-115` (`problemFiles` keys by path); no rename handling found in `src/ui/app` or `src/ui/problems`.
- What is wrong: nothing moves or clears diagnostics when a file is renamed, so findings stay under the stale path and never attach to the new file; the old entry may linger as a phantom problem.
- Why it matters: the problems panel shows a file that no longer exists, and the new file shows no diagnostics even if the server later republishes under the new name.
- Fix: on rename, call `publish(oldPath, [])` and, if the server republishes under the new path, let it populate; optionally remap the server map key in `useDiagnosticsState`.

### P2 — Build and LSP diagnostics are not deduplicated across sources

- Where: `src/lib/lsp/diagnostics.ts:79-104` (`combineDiagnostics` merges server then build, deduping by `diagnosticKey` which includes `source`).
- What is wrong: `diagnosticKey` includes `diagnostic.source`, so the same span/message reported by clangd (`source: "clangd"`) and by the build parser (`source: "cmake"`/`"clang"`) both survive. Two squiggles and two problem rows for one issue.
- Why it matters: duplicate findings inflate the count badge and clutter the problems list; fix actions may target the wrong source.
- Fix: dedupe by path + range + severity + message (ignore source) in `combineDiagnostics`, or drop build entries whose key matches an existing server entry after stripping source.

### P2 — Count badge can disagree with the visible list after filtering

- Where: `src/ui/problems/ProblemsPanel.tsx:46-47` (`total` from `files`, `other = total - errors - warnings`); `src/lib/lsp/diagnostics.ts:106-118` (`countSeverities` counts only severity 1 and 2); `ProblemsPanel.tsx:77-78` (`filterProblemFiles`/`flatProblems` apply `allowed`).
- What is wrong: `errors`/`warnings` are unfiltered totals from `counts`, but the list is filtered by `allowed` severities and text. When the user hides a severity, the badge still shows it, so the badge and the rendered list disagree.
- Why it matters: a user who filters to errors only still sees "3 warnings" in the badge, making the count unreliable.
- Fix: either make the badge reflect the filtered set (pass filtered counts) or label it as total; keep one source of truth.

## What was cleared

- `withServerDiagnostics` correctly deletes a path on empty publish, so a server that sends an empty list clears findings (`src/lib/lsp/diagnostics.ts:44-57`).
- `combineDiagnostics` replaces build entries on rebuild via `groupDiagnostics` (whole-map replacement) and leaves server entries untouched (`src/lib/lsp/diagnostics.ts:59-77`, `useDiagnosticsState.ts:32-34`).
- `useDiagnosticsFeed` correctly drops events whose root differs from the open project (`src/lib/lsp/feed.ts:25`).
- `countSeverities` and `problemFiles` both derive from the same combined map, so no separate stale cache exists (`useDiagnosticsState.ts:41-43`).
- No duplicate diagnostic listeners: `useDiagnosticsFeed` subscribes once with `[]` deps and uses a ref (`src/lib/lsp/feed.ts:20-48`).
