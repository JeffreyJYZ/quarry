# Bundle size audit (audit2-21)

Scope: Vite config + import graph from `src/ui/main.tsx`. Read-only. No builds run; sizes from existing `dist/`.

## What the build emits

`dist/assets/` (existing build): `index-BQmANg9U.js` **1.07 MB** (main), `Terminal-*.js` 348 KB, `Editor-*.js` 114 KB, `react-*.js` 8.5 KB, plus 2-8 KB chunks for `CommandPalette`, `QuickOpen`, `SearchPalette`, `ShortcutSheet`. So chunking is partially in place: Terminal and Editor are split; the palettes are split. The main chunk still carries everything else.

## Findings

### P2 — `AppOverlays.tsx:1-7` eagerly imports seven dialog-only components

File: `src/ui/app/AppOverlays.tsx:1-7`

```ts
import DiffView from "@/ui/git/DiffView";
import Goto from "@/ui/goto/Goto";
import LinePrompt from "@/ui/goto/LinePrompt";
import Generate from "@/ui/generate/Generate";
import NewProject from "@/ui/projects/NewProject";
import RefsPanel from "@/ui/components/RefsPanel";
import SettingsPage from "@/ui/settings/SettingsPage";
```

Each is rendered only behind a flag (`refsOpen`, `gitDiffPath !== null`, `settingsOpen`, `gotoMode !== null`, `lineOpen`, `generateOpen`, `newProjectOpen`). None is lazy. They ship in the 1.07 MB main chunk even though most sessions never open all of them. Cheap win: convert these to `lazy(() => import(...))` + `<Suspense fallback={null}>`, mirroring the existing `BottomDock.tsx:9-12` and `CanvasPanels.tsx:8` pattern. Expected effect: pull these subtrees (and their transitive `lib/git`, `lib/lsp`, settings tabs) out of `index` into on-demand chunks.

### P2 — `EditorStage.tsx:14` eagerly imports `DisasmPane`

File: `src/ui/app/EditorStage.tsx:14`

```ts
import DisasmPane from "@/ui/debug/memory/DisasmPane";
```

Rendered only when `props.disasm !== null` (line ~138). `DisasmPane` (183 lines) pulls `dapDisassemble`, memory resolve, and `memory.css`. It should be lazy like `Terminal` already is in `CanvasPanels.tsx:8`.

### P3 — `OverlaysMount.tsx:6` eagerly imports `ReleaseNotes`

File: `src/ui/app/OverlaysMount.tsx:6`

```ts
import ReleaseNotes from "@/ui/updates/ReleaseNotes";
```

Rendered only when `overlays.notesOpen && version !== null` (line 19). Small (79 lines) but cheap to lazy-load alongside the dialogs above.

### Cleared (no finding)

- Heavy dependencies are already correctly scoped: `@codemirror/*` is imported only under `src/ui/editor/**` and `src/lib/editor/**` (no eager import outside the editor subtree); `@xterm/*` only under `src/ui/terminal/**` and `src/lib/consts/themes.ts` (structurally declared, not imported). Both are isolated into the `Editor` and `Terminal` chunks, which are lazy via `LazyEditor.tsx:4` and `CanvasPanels.tsx:8` / `AppBody.tsx`. No markdown renderer or syntax-highlight package exists in `package.json`.
- `vite.config.ts:14` raises `chunkSizeWarningLimit` to 700 KB citing the editor chunk; that is accurate and not a defect.
- `BottomDock.tsx:9-12` already lazy-loads `SearchPalette`, `QuickOpen`, `CommandPalette`, `ShortcutSheet`.

## Cheapest real win

Lazy-load the seven dialog components in `AppOverlays.tsx` (P2). They are the largest block of code currently forced into the main chunk that is only ever rendered behind a user-opened dialog, and the conversion is mechanical (one `lazy` + `Suspense` per import, exactly as `BottomDock` already does). Estimated effect: shrink the 1.07 MB `index` chunk by the dialog subtrees; no behaviour change. `DisasmPane` (P2) is the next cheapest.

## What I cleared

No eager import of CodeMirror/xterm/lezer outside their lazy chunks; no markdown or syntax-highlight dependency to split; no broken chunk emission. No source edits made.
