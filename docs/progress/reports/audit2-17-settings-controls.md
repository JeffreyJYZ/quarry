# Audit 2.17 — settings controls honesty

## P1 — Terminal appearance controls are dead (no effect)

`TerminalSection.tsx` exposes five controls (line height, letter spacing, cursor style, cursor blink, scrollback) that update `Preferences`, but `Terminal.tsx` only forwards `defaultFontSize` and `fontFamily` to `useXterm` (`Terminal.tsx:54-60`), and `CanvasPanels.tsx` only passes `defaultFontSize`/`fontFamily` (`CanvasPanels.tsx:39-40`). `useXterm` accepts `lineHeight`, `letterSpacing`, `cursorStyle`, `cursorBlink`, `scrollback` (`useXterm.ts:30-40`) but they are never supplied, so the defaults are always used. Persisted but ignored.

Fix: thread `settings.effective.terminalLineHeight/terminalLetterSpacing/terminalCursorStyle/terminalCursorBlink/terminalScrollback` through `Terminal`/`CanvasPanels` into `useXterm`, and add props to `TerminalProps`.

## P2 — Stepper clamps with the wrong range/fallback

`controls.tsx:21` decrease uses `clampFontSize(value - 1, min)` and `:38` increase uses `clampFontSize(value + 1, max)`. `clampFontSize` clamps to `FONT_SIZE_RANGE` (9..24) and only uses the second arg as fallback for non-numbers, so the passed `min`/`max` do not bound the step. Works only because terminal/editor ranges both happen to be 9..24. Fix: clamp against the passed `min`/`max`, not the global font range.

## P2 — Two controls write the same field (last write wins)

- `AppearanceSection.tsx:56` theme `<select>` writes `theme`; `:43` `handleDelete` also writes `theme` (resetting to default when the active theme is deleted). A delete during an in-flight select change silently clobbers.
- Editor font size: settings stepper (`UserTab.tsx:30`) and the zoom shortcut (`useShellKeymaps.ts:82` via `zoomPreferences`) both write `editorFontSize`.

Fix: make delete/select mutually exclusive or disable one while the other is pending; route zoom through the same `setUser` path.

## Cleared

- `formatOnSave`, `buildProfile`, `editorTabSize`, `terminalPlacement`, `editorFontFamily`, `terminalFontFamily`, LSP paths/args are read by consumers (`EditorStage`, `useShell`, `lspOverrides`).
- Panel reset: `resetPanels` (`useSettings.ts:106`) sets `panelSizes` to `DEFAULT_PANEL_SIZES`; consumers read `settings.panels`. Works.
- Persistence: preferences flow through `useSessionPersistence` and `settingsFromSnapshot`; survives relaunch.
- Ranges: NumberField terminals clamp via model helpers; scrollback 500–50000, line height 1.0–2.0.
- Labels: generally describe field; `terminalPlacement` select lacks a `<label>` (uses `<span>Placement</span>`), minor a11y only.
- No control found that writes a field nothing reads beyond the terminal five above.
- No reset found that fails to reset.
