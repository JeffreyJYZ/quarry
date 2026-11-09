# Audit: outline, breadcrumb, problems panel

## P1 — Outline/Breadcrumb/Goto assume both servers run

`src/ui/outline/Outline.tsx:46`, `src/ui/breadcrumb/Breadcrumb.tsx:53`, `src/ui/goto/Goto.tsx:60` build `new Set<ServerKind>(["rust-analyzer", "clangd"])` and call `servedByRunningServer(path, running)`. That returns a kind whenever the extension matches, even when that server never started for the root, so `lspSymbols(sessionId(kind, root), path)` is sent to a dead session. The request fails and the UI shows "No symbols." (Outline:149) / empty breadcrumb instead of a server-state message. Fix: pass the actual running-server set (or LSP context) into these components and gate on it; surface "language server not running" when null.

## P1 — Outline and breadcrumb never refresh on edit

`Outline.tsx:35-72` fetches only when `root`/`activePath` change; `Breadcrumb.tsx:42-71` same, plus an unbounded `cacheRef` (`cacheRef.current.set(activePath, result)` at :64) that is never invalidated. After typing, symbol ranges go stale, so the breadcrumb's enclosing-scope chain (`containsRange` at :14-20) can highlight the wrong symbol. Fix: depend on a buffer revision/version (or re-fetch on document change) and drop/invalidate the breadcrumb cache on edit.

## P2 — Problems panel relies on server publishing empty diagnostics on close

`src/lib/lsp/diagnostics.ts:44-57` (`withServerDiagnostics`) deletes a file's entry only when an empty publish arrives; `src/lib/lsp/session.ts:97-98,132` documents that a close publishes empty diagnostics. If the server does not publish on close (or a file is removed without a close), stale diagnostics remain in the map and the panel keeps showing problems for a closed/fixed file. Fix: on document close or file removal, explicitly call the publish path with `[]` (or delete the path from the server map) rather than depending on server behaviour.

## P2 — Build diagnostics are never cleared by editing

`src/ui/app/useDiagnosticsState.ts:32-33` replaces the whole build map only via `setBuildReport`; nothing clears build diagnostics when the source is edited/fixed, so a stale build error survives until the next build. Fix: clear build diagnostics for a path on edit, or mark them superseded.

## P3 — Outline reports "No symbols." for a dead server

Related to P1: `Outline.tsx:48-52` sets symbols to `[]` and loading false with no distinction between "server not running" and "no symbols"; user cannot tell why. Fix covered by P1 (show server state).

## Checked, no issue

- Problem click navigation uses 0-based LSP lines and reveals via `doc.line(clampedLine + 1)` (`useEditorEffects.ts:87-89`); no off-by-one.
- `withServerDiagnostics` correctly deletes on empty publish (`diagnostics.ts:51-52`).
- `sessionForContext` / `sessionForPath` compose `{kind}::{root}` consistently (`served.ts:33-34`).
- ProblemsPanel filters empty files in `problemFiles` (`problems/model.ts:106-115`).
