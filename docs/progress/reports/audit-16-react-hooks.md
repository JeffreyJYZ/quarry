# Audit 16: React hooks correctness (src/ui)

## Findings

### P2 — Update poller cleanup discarded

- `src/ui/app/useShellEffects.ts:9`: `useEffect(() => startUpdatePolling(), [])`.
- `startUpdatePolling()` returns the teardown that clears the 8 s initial timeout and the 30 min interval (`src/lib/updates/poll.ts:11-15`), but the effect returns `void`, so React never calls it.
- Consequence: the poller is never stopped on unmount; under StrictMode/HMR/re-mount a second poller stacks up and keeps firing `checkForUpdates`.
- Fix: `useEffect(() => { const stop = startUpdatePolling(); return stop; }, [])`.

### P3 — Editor Escape keymap captures stale rename/code-menu flags

- `src/ui/editor/useEditorMount.ts:22-46` builds the CodeMirror view once with `deps` from the first render.
- `src/ui/editor/useEditorBindings.ts:81-82` stores `renameOpen` and `codeMenuOpen` as plain booleans on that object; `src/ui/editor/keymapEditing.ts:23-30` reads them in the Escape binding.
- They are never updated on the mounted object, so after the view mounts Escape no longer closes a rename bar or code-action menu that opens later (those menus have no Escape handling of their own except the rename input).
- Fix: keep `renameOpen`/`codeMenuOpen` in refs and read `.current` in `keymapEditing.ts`, or mutate `deps.renameOpen`/`deps.codeMenuOpen` on the mounted object in an effect.

## Checked, no issue

- `useFullscreen`, `useNativeMenu`, `useDebugEvents`, `useDiagnosticsFeed`, `useDocumentSync`, `useTerminalSessions`, `useXterm`: Tauri `unlisten`/event teardown returned from the effect.
- `useGitState` focus listener re-subscribes on `root` change (`src/ui/app/useGitState.ts:64-70`).
- `useShellEffects` native menu uses a `dispatchRef` so the single listener never goes stale (`src/ui/app/useNativeMenu.ts:13-14`).
- `settingsSearch` no-deps effect (`src/ui/settings/settingsSearch.ts:44-48`) is intentional per-render filtering and does not loop (same `matches` value bails).
