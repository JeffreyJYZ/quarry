# consts-08: settings UI

## `src/ui/settings/TerminalSection.tsx`

- Lines 135-137: `min={1} max={2} step={0.1}` for line height. `min`/`max` duplicate `TERMINAL_LINE_HEIGHT_RANGE` (`src/lib/consts/terminal.ts:11`). Import the range for min/max; `step={0.1}` has no existing constant and stays literal unless a step constant is added.
- Lines 147-149: `min={-2} max={4} step={1}` for letter spacing. `min`/`max` duplicate `TERMINAL_LETTER_SPACING_RANGE` (`src/lib/consts/terminal.ts:12`). Import the range; step stays literal.
- Lines 159-161: `min={500} max={50000} step={500}` for scrollback. `min`/`max` duplicate `TERMINAL_SCROLLBACK_RANGE` (`src/lib/consts/terminal.ts:13`). Import the range; step stays literal.
- Lines 81-82: font size already uses imported `FONT_SIZE_RANGE` (`src/lib/consts/settings.ts:10`). OK.
- Lines 167: hint text hardcodes `1.0–2.0`, `-2 to 4 px`, `500–50 000 lines`, restating the same three ranges. Should derive labels from the imported ranges instead of restating them.

## `src/ui/settings/UserTab.tsx`

- Lines 28-29: font size uses imported `FONT_SIZE_RANGE`. OK.
- Lines 50-53: tab-size option list built from imported `TAB_SIZES`. OK.

## `src/ui/settings/ProjectTab.tsx`

- Lines 36-39: tab-size option list built from imported `TAB_SIZES`. OK.
- Lines 55-58: inline `{ value: "on"/"off" }` option list has no matching model constant; nothing to import.

## Other settings files

- `ShellSections.tsx`: build profiles and panel defaults come from imported `BUILD_PROFILES` / `DEFAULT_PREFERENCES`. OK.
- `AppearanceSection.tsx`, `LanguageServerSection.tsx`, `UpdatesSection.tsx`, `controls.tsx`: no min/max/step ranges or option lists that duplicate a model constant.
