# Audit 2.30 — project switching

Scope: `src/ui/app/useWorkspace.ts`, `src/ui/app/useShell.ts`, `src/ui/app/projectReset.ts`, `src/ui/app/useRunControls.ts`, `src/lib/editor/closedTabs.ts`, `src/ui/app/useSessionPersistence.ts`.

## P1 — run configurations survive a project switch

What: `useShell` keeps `runConfigurationsRef` across the whole shell lifetime and feeds it as `initialConfigurations` to `useRunControls`, whose `configurations` state is `useState(initialConfigurations)` — initialized once. `openRoot` in `useWorkspace.ts:55-77` clears buffers/activePath/confirmClose but never resets `configurations` or `runConfigurationsRef.current`. So project B inherits A's saved run configurations, including `program`/`cwd` pointing at A's binary.

Why: a detected target or a stale saved config from A can be launched against B's tree; the Run panel also lists A's configurations.

Fix: in `openRoot`, after `setProject(next)`, call `workspace`/runs reset — add `replaceConfigurations([])` (already exposed at `useRunControls.ts:147`) and clear `runConfigurationsRef.current = []`. Also clear the form fields or let `useRunFormMemory` restore B's default.

## P1 — closed-tab slot is never cleared on project switch

What: `src/lib/editor/closedTabs.ts:10` holds a module-level `closed` buffer. `forgetClosed()` exists (`:24`) but has zero callers (grep shows only definition + test). Opening B leaves A's last closed tab reopenable via Ctrl+Shift+T, restoring A's buffer and edits in B.

Fix: call `forgetClosed()` in `openRoot` (or in `resetProjectState`) so a project change drops the stale buffer.

## P2 — recent files list persists across projects

What: `useWorkspace.openRoot` resets buffers/activePath but not `recentFiles` (`:40`, `:91-93`). `recentFiles` feeds Quick Open's recent list and the global settings write, so A's file paths linger under B and get stamped into B's session settings.

Fix: `setRecentFiles([])` in `openRoot` (or scope recent files per root).

## P2 — debounced session settings write carries the previous project's run configurations

What: `useSessionPersistence.write` serializes `snapshotRef.current` (including `runConfigurations`) after a 400 ms debounce. Because run configurations are not reset on switch (P1), the first write after opening B persists A's configurations under B's `lastRoot`. Even after fixing P1, ensure `snapshotSignature`/`snapshotRef` update synchronously on project open so no in-flight timer from A fires against B's root.

Fix: clearing run configurations (P1) removes the stale payload; also cancel/clear the pending debounce timer in `useSessionPersistence` when `project` changes, or gate `write` on `restoredRef` plus a project-change token.

## Cleared

- Buffers and active path reset in `openRoot` (`setBuffers([])`, `setActivePath(null)`).
- Tests controller resets items/results/running on root change (`useTests.ts:56-68`) and guards visibility by `itemsFor`/`resultsFor`.
- LSP sessions stop/start per root (`useOneServer` effect cleanup calls `stopLsp`).
- Search palette reset (`resetProjectState` sets `searchOpen(false)`).
- Git state keyed by `root` prop; diagnostics reset in `resetProjectState`.
- Debug session and build use `root`.

## Nothing found

- No language-server session from A left answering under B (sessions are `{kind}::{root}` and torn down on root change).
- No tree rooted at A with B title (root drives tree).
- No search results from A surviving a switch (searchOpen cleared).
