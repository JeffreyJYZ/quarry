# Empty and loading states audit

## P1 — CallsPanel masks "no language server" as "no calls"

`src/ui/calls/CallsPanel.tsx:38-44` — when `servedByRunningServer(path, running)` returns `null`, the effect sets `prepared = []` and `loading = false`, so the body renders `src/ui/calls/CallsPanel.tsx:179-182` ("No incoming calls" / "No outgoing calls"). That text claims the symbol has no callers/callees, but the truth is no server serves this file (e.g. a `.rs` file in a project with only clangd, or a file outside the root). Fix: track a separate `noServer` flag and render "No language server for this file" (or disable the panel) in that case; only fall through to "No incoming/outgoing calls" when a server actually answered with an empty list.

## P1 — TestsPanel conflates "no tests discovered" with "filter hid everything"

`src/ui/tests/TestsPanel.tsx:47` builds `emptyMessage = No tests match "<filter>" · "<binary>" · "<result>"` unconditionally, and `src/ui/tests/TestGroups.tsx:24-26` renders it whenever `groups.length === 0`. So a project with zero discovered tests (or a failed load that left `items` empty) prints a filter string that implies the user filtered everything away. Fix: distinguish `items.length === 0 && textFilter === "" && binaryFilter === null && resultFilter === "all"` → "No tests discovered" (or surface `loadError`); keep the filter message only when a filter is actually active. Also `loading`/`loadError` are already handled above, so the misleading case is specifically the empty-no-filter one.

## P2 — Outline silently shows "No symbols." for unserved files

`src/ui/outline/Outline.tsx:46-52` — when `servedByRunningServer(activePath, running)` is `null`, sets `symbols = []`, `loading = false`, `error = null`, then renders `src/ui/outline/Outline.tsx:148-149` "No symbols." with no indication that no server serves this extension. Fix: render "No language server for this file" (or hide the outline) in the `kind === null` branch, mirroring the distinction the problem is about.

## P2 — RefsPanel has no loading/error state

`src/ui/components/RefsPanel.tsx:26-27` renders "No references" whenever `locations.length === 0`, including before the request resolves or after a failure. The panel receives only `locations` (`src/ui/app/AppOverlays.tsx:92-97`), so it cannot tell "still loading" from "server answered empty" from "request failed". Fix: pass `loading`/`error` props (as `CallsPanel`/`BlameList` do) and render "Loading references…" / the error before the empty line.

## P2 — TypeHierarchyPanel renders nothing when no cursor

`src/ui/app/CanvasPanels.tsx:79-92` — when `typeHierarchyOpen` is true but `activePath`/`cursor` is null, the `if` block is skipped and execution falls through to `project === null ? return null` (line 94) then the `BottomDock` (line 96), so the open panel silently disappears instead of showing "Place the caret on a symbol" (the CallsPanel already does this at lines 60-77). Fix: add the same placeholder branch for type hierarchy, or close the overlay, so an open panel does not vanish.

## P3 — Disasm/memory empty text is accurate; no change needed

`src/ui/debug/memory/MemoryBody.tsx:50-55` and `src/ui/debug/memory/DisasmPane.tsx:170-178` already distinguish no-session / no-address / loading / empty-result / adapter-returned-nothing. No finding.

## Cleared

- `src/ui/problems/ProblemsPanel.tsx:129-135` — distinguishes `files.length === 0` ("No problems") from filter mismatch ("No problems match the filter …"). OK.
- `src/ui/git/StatusRail.tsx`, `ChangesPane.tsx:67-68`, `ChangesList.tsx:133-135`, `HistoryList.tsx:36-39`, `BlameList.tsx:33-42` — loading/error/empty all handled with distinct text. OK.
- `src/ui/outline/Outline.tsx:125-127,144-152` — no-file-open / loading / error / no-symbols / no-match filter all distinct. OK (only the unserved-file case above).
- `src/ui/search/SearchPalette.tsx:40-56` — error/busy/empty-query/invalid/report-null/no-matches all distinct. OK.
- `src/ui/components/TreeLevel.tsx:46-75` — loading / error+retry / empty all distinct. OK.
- `src/ui/debug/memory/*` empty states all distinct (see above).
- `src/ui/app/SideRail.tsx:112` — "No folder open…" OK.
- `src/ui/run/RunDock.tsx:68-81` — empty state names the next action. OK.
- `src/ui/tests/TestsPanel.tsx:57-58` — loading and loadError handled. OK (only the no-filter empty case above).
- `src/ui/goto/GotoList.tsx:22` — loading vs "Nothing matches". OK.
