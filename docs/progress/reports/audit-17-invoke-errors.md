# Audit 17 — invoke() rejection handling

Scope: every `invoke(...)` in `src/` (all live in `src/lib/project/api/*` plus `src/lib/debug/dap.ts` and `src/lib/git/api.ts`), and the UI/lib call sites that consume those wrappers.

## Findings

### P1 — Unhandled rejection on directory load in the file tree

- `src/ui/components/useFileTree.ts:48-63` (`load`): `listDir(path)` failures are caught, stored as `{ status: "error", message }`, and then **re-thrown** (`throw error` at line 60).
- `src/ui/components/useFileTree.ts:114` and `:118`: `handleAction` calls `void load(entry.path)` with no `.catch`. When the directory cannot be read, the rejected promise escapes and becomes an unhandled rejection (console error / potential crash overlay) even though the tree already shows the error row.
- Fix: `void load(entry.path).catch(() => undefined)` at both sites, or drop the `throw` and keep the rejection internal to `load`.

### P2 — Empty catches hide the real reason

- `src/lib/git/useBranches.ts:45-48`: `gitBranches(root)` failure is swallowed and the list becomes `[]` with no message. The component has `setError` in scope. Fix: `catch (reason) { if (!cancelled) setError(describeError(reason)); setBranches([]); }`.
- `src/ui/breadcrumb/Breadcrumb.tsx:66-69`: `lspSymbols` failure sets `symbols = []` with an empty catch. No error state exists in the component, so the failure is invisible. Fix: either add a notice via `onNotice` (not currently threaded) or at least log; at minimum keep the catch but name `reason` and surface it where a notice channel exists.
- `src/ui/app/useGitState.ts:86-88`: blame fetch failure silently flips `blameOn` off with no reason. Fix: call `onNotice?.(\`blame failed: ${describeError(reason)}\`)` before clearing blame.
- `src/ui/editor/useCodeActionMenu.ts:24-26`: the catch reports `failed: ${action.title}` and discards the underlying error. Fix: include `describeError(error)` in the notice.

### P2 — Generic "no result" wording can mask a refused request

- `src/ui/app/lspCommandHandlers.ts:36-45` and `:66-74` already do the right thing (catch surfaces `describeError(error)`; the generic "No implementation found"/"No type definition found" strings only follow a successful empty list). Keep this pattern; the earlier shipped bug (rejection rendered as an empty answer) is guarded by `src/lib/project/api/commands.test.ts`, which fails if an invoked command is not registered in `lib.rs`.
- Remaining risk: `src/ui/breadcrumb/Breadcrumb.tsx:66-69` and `src/lib/git/useBranches.ts:45-48` still collapse a refused request into an empty list with no message (see P2 above). Any future caller that does `symbols = await lspX(...).catch(() => [])` without a notice repeats the same bug.

### P3 — Intentional swallow sites (acceptable, listed for completeness)

- `src/ui/terminal/useTerminalSessions.ts:74,96,167`, `src/ui/terminal/useTerminalRestart.ts:25`, `src/ui/terminal/useXterm.ts:82`, `src/lib/debug/useSessionReset.ts:78`, `src/ui/terminal/terminalLinks.ts:71`: cleanup/resize/close paths use `.catch(() => undefined)`. These are best-effort teardowns where surfacing an error would be noise; no change needed.

## Checked, no issue

- `src/ui/calls/CallsPanel.tsx:46-56` and `:79-100`: both prepare and children fetches surface the real error via `setError`.
- `src/ui/outline/Outline.tsx:55-66`: symbols fetch surfaces `lspErrorMessage(describeError(err))`.
- `src/ui/goto/Goto.tsx:63-66` and `:90-95`: catches surface `symbols unavailable: ${describeError(err)}`.
- `src/lib/tests/useTests.ts:79-90` and `:102-106`: load/run failures surface through `loadError` / the test report output.
- `src/lib/run/useRunProcess.ts:90-109` and `:133-137`: start/stop failures land in the run log or `onNotice`.
- `src/lib/project/save.ts` and `src/ui/app/useSaveBuffers.ts:111-121`: save failures surface via `saveErrorMessage`.
- `src/ui/app/useWorkspace.ts:59-73` and `:100-112`: project open and file read failures surface via `onNotice`.
- `src/ui/terminal/useTerminalSessions.ts:69-89`: `ptyOpen` failure sets `error: Terminal unavailable: ${describe(err)}`.
- Wrapper modules (`src/lib/project/api/*`) correctly propagate rejections; they are not expected to catch.
