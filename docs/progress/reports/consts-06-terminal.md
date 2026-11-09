# Terminal consts

Scope: `src/ui/terminal/**`, `src/lib/terminal/**`, `src/lib/consts/terminal.ts`.

## Already centralized (wins)

- `src/lib/consts/terminal.ts:10-41` holds `TERMINAL_CURSOR_STYLES`, `TERMINAL_LINE_HEIGHT_RANGE`, `TERMINAL_LETTER_SPACING_RANGE`, `TERMINAL_SCROLLBACK_RANGE`, `DEFAULT_TERMINAL_PREFERENCES`, font sizes/steps, `MAX_LINES`, `MAX_CHUNKS`, `MAX_CHARS`, `MAX_IDS`, `MONO_STACK`, `SCROLLBACK`.
- `src/lib/terminal/ptyBuffer.ts:13-15` imports and re-exports `MAX_CHARS`, `MAX_CHUNKS`, `MAX_IDS`.
- `src/lib/terminal/sessions.ts:6-8` imports and re-exports `MAX_LINES`.
- `src/lib/terminal/fontSize.ts:1,3` imports and re-exports `DEFAULT_FONT_SIZE`, `FONT_STEP`, `MAX_FONT_SIZE`, `MIN_FONT_SIZE`.
- `src/ui/terminal/xtermOptions.ts:4,7` imports `MONO_STACK` and re-exports `MONO_STACK`, `SCROLLBACK`; `xtermFontFamily` maps empty to `MONO_STACK`.

## Local magic (candidates)

- `src/ui/terminal/useXterm.ts:16` `const RESIZE_DEBOUNCE_MS = 120;` — resize debounce, local const only.
- `src/lib/terminal/sessions.ts:76-81` `ptySize`: `800` (width fallback), `200` (height), `8` (col width), `18` (row height), `cols >= 20`, `rows >= 8` — all local literals.
- `src/lib/terminal/fontSize.ts:26-27` `ESC = 27`, `BEL = 7` (char codes) — locals.
- `src/ui/terminal/xtermOptions.ts` has no xterm-specific option literals (font sizes etc come via appearance/preference defaults).
- `src/ui/terminal/Terminal.tsx` tab handling uses inline literals only.

## Notes

- `DEFAULT_PREFERENCES` in `src/lib/consts/settings.ts:16-17` already spreads `DEFAULT_TERMINAL_PREFERENCES`, so terminal prefs are not re-typed locally there.
- `xtermTheme.ts` only re-exports `XTERM_THEME` from `@/lib/consts/themes`; no local palette constants.
- `ansi.ts` `feedChunk` uses only CR/LF/backspace literals; no duplicated escape tables.

## Verdict

Only three genuinely local constants (resize debounce, ptySize cell/fallback dimensions, ESC/BEL codes). The caps that matter (lines, chunks, chars, ids, scrollback, font sizes) already live in `src/lib/consts/terminal.ts`. Nothing else in `src/ui/terminal/**` re-types a const already centralized.
