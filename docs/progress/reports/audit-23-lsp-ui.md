# Audit 23 — LSP-facing UI (frontend)

Scope: hover, completion, goto definition/implementation/type definition, outline, breadcrumb, diagnostics, code actions. Read-only.

## Findings

### P0 — useCodeActionMenu.apply sends a project root path as the LSP session id

- File: `src/ui/editor/useCodeActionMenu.ts:18`
- What: `const session = options.rootRef?.current;` then `lspExecuteCommand(session, action.command)`. `rootRef.current` is the project root path, not a `{kind}::{root}` session id. `lspExecuteCommand` calls `requireSessionId`, which throws in dev, and the backend answers "unknown session" in prod. Any code action that carries a `command` never executes; the menu reports `failed: <title>`.
- Why: the component was given `rootRef` but no path or running set, so it could not compose a session id and fell back to the root string.
- Fix: pass `pathRef` (and read the running set from the global context or a ref) into `useCodeActionMenu`, then derive the session with `sessionForContext(path)`. Wire `pathRef` in `src/ui/editor/Editor.tsx:103`.

### P1 — Outline, Breadcrumb, CallsPanel and Goto assume both servers are running

- Files:
    - `src/ui/outline/Outline.tsx:46` (`new Set<ServerKind>(["rust-analyzer", "clangd"])`)
    - `src/ui/breadcrumb/Breadcrumb.tsx:53` (same)
    - `src/ui/calls/CallsPanel.tsx:38` and `:73` (same, twice)
    - `src/ui/goto/Goto.tsx:60` and `:81` (same)
- What: each builds its own running set containing both servers instead of consulting the live set published via `setLspContext`. `servedByRunningServer(path, running)` then reports a server as serving even when it is not running, so `sessionId(kind, root)` is sent for a session the backend never started ("unknown session").
- Why: these components receive `root` but not the running set; they paper over it with a constant.
- Fix: thread the running set from the shell (or call `sessionForContext(path)`, which returns null for unserved/unrunning files) and bail out when it is null.

### P2 — Goto workspace-symbol mode picks rust-analyzer from a hardcoded running set

- File: `src/ui/goto/Goto.tsx:81-86`
- What: `const kind = running.has("rust-analyzer") ? "rust-analyzer" : running.has("clangd") ? "clangd" : null;` where `running` is `new Set(["rust-analyzer", "clangd"])`, so it always picks rust-analyzer even in a C++-only project and sends `rust-analyzer::{root}` to a backend that has no such session.
- Fix: pick the kind from `servedByRunningServer(path, running)` using the real running set, or skip when null.

## Checked, no issue

- `src/ui/editor/extensionsBehaviour.ts` (hover, completion, cmd-click goto-definition): uses `sessionId(kind, currentRoot)` with `kind` from `servedByRunningServer(currentPath, deps.runningRef.current)` — valid session id.
- `src/ui/editor/keymapLsp.ts` (F12 goto-definition, Shift+F12 references, Alt-Enter code actions): same pattern, valid session id.
- `src/ui/app/lspCommandHandlers.ts` (goto implementation, goto type definition, quick doc): uses `sessionForContext(activePath)` — correct.
- `src/ui/app/useEditorActions.ts` (organise imports): uses `sessionForContext(activePath)` — correct.
- `src/ui/problems/useProblemActions.ts` (quick fixes): uses `sessionForContext(path)` — correct.
- `src/lib/editor/semanticTokens.ts`: uses `sessionForContext(path)` — correct.
- `src/ui/editor/useRenamePanel.ts`, `useInlayHints.ts`, `useSignatureHelp.ts`, `useOccurrenceHighlights.ts`: all compose `sessionId(kind, currentRoot)` from `servedByRunningServer(currentPath, running)` — valid.
- `src/ui/lsp/useHierarchy.ts`, `src/ui/calls/CallsPanel.tsx`: compose `sessionId(kind, root)` from `servedByRunningServer` — valid id shape (subject to the hardcoded-running-set caveat above).
- `src/ui/editor/useDocumentSync` / `useLspWiring`: pass composed session ids to open/change/close — valid.
- Every `invoke("lsp_*")` wrapper's first parameter is documented as a session id and guarded by `requireSessionId` in dev (`src/lib/project/api/lspFeatures.ts:16`).
- All `lsp_*` commands are registered in `src-tauri/src/lib.rs:52-74`, so none is a "menu entry with no working path" at the Tauri boundary.
- `setLspContext` is published in `src/ui/app/useLspWiring.ts:44` and consumed by `sessionForContext` callers.
