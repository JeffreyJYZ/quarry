# Audit: theming tokens

## Findings

P1 — `src/ui/styles/16-cm-rename-bar.css:5-14` hardcodes a dark palette (`background: #1e1e1e`, `border: 1px solid #333`, `background: #2a2a2a`, `border: 1px solid #444`) for the rename bar / command palette input, so under a light theme the bar stays near-black with dark borders. Fix: replace with `var(--panel)` / `var(--bg)` / `var(--line)` / `var(--hover)`.

P2 — `src/ui/editor/semantic.css:36-66` fallbacks (`#82aaff`, `#c792ea`, `#56b6c2`, `#d19a66`, `#e5c07b`, `#98c379`, `#c678dd`) are One-Dark values. They only show if `applyTheme` has not run, but any flash or a stylesheet evaluated before apply paints dark semantic colours on a light canvas. Fix: drop the fallbacks (rely on `--editor-*` set by apply) or make them light-appropriate.

P2 — `src/ui/styles/1-root.css:55,62` hardcodes scrollbar thumb colours `#4e5661` / `#2f3742`, so a light theme keeps a dark scrollbar. Fix: `var(--line)` / `var(--muted)`.

P3 — `src/lib/themes/builtin/one-light.ts:29` `comment: "#7d838c"` gives 3.66:1 against `bg #fafafa` (below WCAG AA 4.5 for normal text). Darken to ~`#6b7280` (≈4.6:1) if comments must pass AA.

P3 — `src/lib/consts/editor.ts:12-21` ships a One-Dark fallback palette consumed by `hue()` in `src/lib/editor/theme.ts`; on a light theme a missing `--editor-*` var falls back to dark hues. Low impact (vars are always written by apply), but the fallback should be theme-aware or removed.

## Checked, no issue

- All built-in themes (`src/lib/themes/builtin/*.ts`) fill every `THEME_TOKENS` entry; TypeScript enforces completeness via `ThemeTokens`.
- `derivedEditorColours` (src/lib/themes/derive.ts) runs for every theme including imported ones, so semantic colours track the theme.
- `runDebug.css` hardcoded green/red are deliberate fixed action colours (commented), not theme bugs.
