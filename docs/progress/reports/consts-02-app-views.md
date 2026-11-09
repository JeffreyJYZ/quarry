# consts-02 — `src/ui/app/*.tsx`

## Splitter limits duplicated as raw numbers

`src/lib/consts/layout.ts` already owns `PANEL_LIMITS` and `DEFAULT_PANEL_SIZES`, and `SideRail.tsx` imports them (`OUTLINE_MIN`/`OUTLINE_MAX`). The other views hardcode the same values instead of referencing the table.

- `BottomDock.tsx:45-46` `min={120} max={900}` — equals `PANEL_LIMITS.dockHeight` (`120`/`900`). Move to `PANEL_LIMITS.dockHeight.min/.max`.
- `CanvasPanels.tsx:30-31` `min={100} max={900}` — equals `PANEL_LIMITS.terminalHeight` (`100`/`900`). Move.
- `AppBody.tsx:112-113` `min={160} max={560}` — `PANEL_LIMITS.railWidth`. Move.
- `AppBody.tsx:128-129` `min={240} max={900}` — `PANEL_LIMITS.terminalWidth`. Move.
- `EditorStage.tsx:134-135` `min={240} max={1200}` — disassembly split. No const exists; the default `520` lives in `usePanels.ts:24` as a bare `useState(520)`. Add a `disasmWidth` entry to `PANEL_LIMITS`/`DEFAULT_PANEL_SIZES` (or a dedicated debug const) and read both the default and the limits from it; the max `1200` has no other occurrence.

## Panel default not in the layout const table

- `usePanels.ts:24` `useState(520)` for `disasmWidth`. Same value nowhere else. Should live in `src/lib/consts/layout.ts` alongside the other panel defaults; `usePanels` then reads the constant.

## Nothing else worth moving

- SVG geometry in `railIcons.tsx` and `RunDebugWidget.tsx` is one-off icon art (single occurrence, shape data).
- Keyboard key names (`"Escape"`, `"ArrowDown"`, …) and event names (`"mousedown"`) in `ProjectSwitcher.tsx` are standard DOM strings, single site.
- Class-name strings (`"icon-rail-button"`, `"project-action"`, …) are single-site or already composed via `className` arrays; not duplicated across components.
- Single-use labels ("explorer", "close", "dismiss", "no targets") are JSX text; left in place per scope.
- `Splitter` `axis`/`invert`/`label` strings are per-instance and not repeated.

## Cross-file note

The `120`/`900`/`100`/`160`/`560`/`240` literals appear only in the four views above plus `SideRail.tsx`, which already uses `PANEL_LIMITS`. No other `src/` consumer repeats them, so consolidating into `PANEL_LIMITS` removes the duplication rather than relocating it.
