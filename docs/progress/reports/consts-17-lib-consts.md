# consts-17-lib-consts

## Findings

- `src/lib/consts/terminal.ts:19` `terminalScrollback: 5000` inside `DEFAULT_TERMINAL_PREFERENCES` duplicates `src/lib/consts/terminal.ts:41` `SCROLLBACK = 5000`. `SCROLLBACK` is only re-exported by `src/ui/terminal/xtermOptions.ts:7` and never consumed (xterm uses `appearance.scrollback` from prefs). Owner should be `DEFAULT_TERMINAL_PREFERENCES.terminalScrollback`; drop `SCROLLBACK` or make it derive.
- `src/lib/consts/terminal.ts:24` `MIN_FONT_SIZE = 9` duplicates the min of `src/lib/consts/settings.ts:10` `FONT_SIZE_RANGE = { min: 9, max: 24 }`. Two different ranges (terminal 9-20, editor 9-24) but the shared floor 9 is spelled twice.
- `src/lib/settings/model.ts:113-115` clamps `terminalFontSize` through `clampFontSize` which uses `FONT_SIZE_RANGE` (editor 9-24), not the terminal 9-20 range. So terminal font size is validated against the editor range in settings while `src/lib/terminal/fontSize.ts` uses 9-20. Range written in two places and disagreeing. Owner: `consts/terminal.ts` `MIN_FONT_SIZE`/`MAX_FONT_SIZE`; settings model should import those for terminal font size.
- `src/lib/consts/terminal.ts:23` `DEFAULT_FONT_SIZE = 11.5` vs `src/lib/consts/settings.ts:16` `terminalFontSize: 13` in `DEFAULT_PREFERENCES`. Two different terminal font defaults (11.5 for empty PTY sessions, 13 for preferences) with no stated reason. Likely intentional but undocumented; flag for confirmation.
- `src/lib/editor/theme.ts:125,134` hardcodes `"11.5px"` matching `DEFAULT_FONT_SIZE = 11.5`; not a consts-module duplicate but a literal restated in CSS. Owner: `consts/terminal.ts`.
- `src/lib/consts/layout.ts:14` railWidth max `560` and `src/lib/consts/editor.ts:44` `hoverMaxWidth: "560px"` share the number; different units/contexts, likely coincidental but worth a named constant if linked.

## Nothing duplicated worth moving

- `SCROLLBACK` re-export is dead; MIN_FONT_SIZE floor shared across two ranges is arguably intentional.
- Other consts modules (git, goto, outline, problems, quickopen, search, projects, tests, lsp, extensions, memory, run, generate, debug, app) show no cross-module literal duplication.

## Owners after cleanup

- Terminal font size range: `src/lib/consts/terminal.ts` (`MIN_FONT_SIZE`, `MAX_FONT_SIZE`).
- Editor font size range: `src/lib/consts/settings.ts` (`FONT_SIZE_RANGE`).
- Terminal scrollback default: `DEFAULT_TERMINAL_PREFERENCES.terminalScrollback`.
- Theme default id: `src/lib/consts/themes.ts` `DEFAULT_THEME_ID`.
- Panel geometry: `src/lib/consts/layout.ts`.
- Editor fallback hues/metrics: `src/lib/consts/editor.ts`.
- Shortcut groups/menu ids: `src/lib/consts/app.ts`.
