# Audit 20 — rendering cost in src/ui

## P0 — every keystroke re-renders the whole tree

`src/ui/app/useShell.ts` returns a fresh `model` object on every render and no component under `src/ui` is memoized except `StatusBar.tsx:178`. `src/ui/app/useWorkspace.ts:136-142` rewrites the whole `buffers` array on each keystroke (`handleChange` maps buffers, changing the active buffer's `text`), so `workspace.buffers` identity changes, `App.tsx:5-7` re-renders `AppView`, and every child (TabStrip, FileTree, Outline, Breadcrumb, StatusBar, palettes) reconciles. At 1,000 expanded files that is ~1k `TreeRow`s re-diffed per keystroke; at a 10k-line buffer, 5 keystrokes/s drives 5 full-tree renders/s even though `useDocumentSync` skips the editor's own change. Fix: split editing state so a keystroke updates only the active buffer without changing unrelated prop identities, and memoize heavy subtrees (`FileTree`, `TabStrip`, `Outline`, palettes) behind stable props.

## P1 — inline collection props get a new identity every render

- `src/ui/app/EditorColumn.tsx:86` `openPaths={new Set(workspace.buffers.map(...))}` — new Set each render → Palettes/QuickOpen re-render.
- `src/ui/app/AppBody.tsx:44-46` `changes={Object.fromEntries((git.status?.entries ?? []).map(...))}` — new object each render.
- `src/ui/app/EditorColumn.tsx:34-45` `disasm={{ ... }}` — new object when the disassembly split is open.
- `src/ui/app/EditorStage.tsx:117-121` `reveal={{ ...props.revealTarget, token }}` — new object every render.

Fix: compute these with `useMemo` keyed on their inputs and pass the memoized value; for `reveal`, only rebuild when `revealTarget`/`revealToken` change.

## P1 — row components are unmemoized and receive inline closures

Only `StatusBar.tsx:178` uses `memo`. `QuickOpenResults.tsx:35-79` builds `onSelect={() => onPick(path)}` and `onHover={() => onActive(index)}` for every row each render, and `QuickOpenRow.tsx` is not memoized, so a query keystroke re-renders all N rows and re-runs `highlight`/`matchPositions`. `TreeLevel.tsx:109-183` and `ProblemsList.tsx:54-70` likewise re-render every row from parent state. At 1,000 quick-open results that is ~1k rows + highlight work per keystroke. Fix: wrap row components in `memo` and pass stable handlers via `useCallback` keyed by index/path (or an id-keyed callback).

## P2 — expensive derivation runs in render, not in a memo

- `src/ui/problems/ProblemsList.tsx:19` `items = files.flatMap(...)` is recomputed every render (used only for length/selection).
- `src/ui/outline/Outline.tsx:74-80` `filterSymbolIndices` + `cappedIndices.map` run on every render, including on caret moves that do not change symbols.
- `src/ui/breadcrumb/Breadcrumb.tsx:89-94` `symbols.filter(...)` + `sort(...)` + `map` run on every cursor change.
- `src/ui/quickopen/useQuickOpen.ts:139-142` builds `displayList` and `recentPaths` (line 168) on every render.
- `src/ui/problems/ProblemsPanel.tsx:77-78` `filterProblemFiles` and `flatProblems` run every render unconditionally.

Fix: wrap each in `useMemo` with the minimal dependency set; cap inputs before sorting where possible.

## P2 — unstable list keys

- `src/ui/git/DiffView.tsx:164` uses `key={index}` for diff body lines (deliberately, but marked biome-ignore); rows that repeat can confuse reconciliation after edits.
- `src/ui/problems/FlatProblems.tsx:38` keys by `diagnosticKey(row.diagnostic)` with no path, so two files reporting the same span/text collide and React reuses the wrong row.

Fix: key diff lines by `${lineNumber}:${content}` and flat problems by `${row.path}:${diagnosticKey(...)}`.

## Checked, no issue

- `src/ui/editor/useDocumentSync.ts` skips the editor's own emitted text before comparing, so typing does not force a full `doc.toString()`.
- `src/lib/lsp/session.ts` memoizes the `LspStatusMap` so document open/close does not repeat per render.
- `src/ui/app/useDiagnosticsState.ts` memoizes merged diagnostics, counts, and problem files.
- Lists that carry stable keys: `TreeLevel.tsx:116` by `entry.path`, `QuickOpenResults.tsx:37/54/69` by path, `ProblemsList.tsx:45` by `file.path` + `diagnosticKey`.
- Outline caps rendered symbols to 400 (`Outline.tsx:11,78`), so its cost is bounded.
