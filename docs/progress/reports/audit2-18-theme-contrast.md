# Audit: theme contrast (src/lib/themes/builtin)

Method: WCAG 2.1 relative luminance L = 0.2126 R + 0.7152 G + 0.0722 B with sRGB gamma (linearise: c/12.92 if <=0.03928 else ((c+0.055)/1.055)^2.4). Contrast = (Lmax+0.05)/(Lmin+0.05). Thresholds: 4.5:1 body text, 3:1 large text. Backgrounds used: `bg` for editor text and chrome surfaces; `activeLine`/`selection` alpha stripped to RGB. Alpha overlays not composited (worst case for selection).

## Failing pairs

### Comments (all themes below 4.5:1 on bg) — P1

- gruvbox-dark: #928374 on #282828 = 4.02
- one-dark: #6b7480 on #23272e = 3.17
- one-light: #7d838c on #fafafa = 3.66
- tokyo-night: #67709c on #1a1b26 = 3.56
- catppuccin-mocha: #7f849c on #1e1e2e = 4.44
- ayu-dark: #6c7680 on #0f1419 = 4.00
- nord: #7b88a1 on #2e3440 = 3.50
- solarized-dark: #6d8388 on #002b36 = 3.75

### Danger on bg (below 4.5:1) — P1/P2

- gruvbox-dark: #fb4934 on #282828 = 4.29
- nord: #bf616a on #2e3440 = 3.05 (below 3:1 too)
- solarized-dark: #dc322f on #002b36 = 3.25

### Selection text on selection bg (all ~1.6-2.3:1) — P2

All themes: text on selection color fails 4.5:1 and 3:1. Values: gruvbox 2.14, one-dark 1.69, one-light 3.94, tokyo-night 1.69, catppuccin 1.64, ayu 1.60, nord 1.74, solarized 2.34. Selection is transient; many editors invert text. Flag if text colour unchanged on selection.

## Passing (for completeness)

Editor text, muted, status/chrome text, activeLine text, accent, warn all >=4.5:1 in every theme (lowest: solarized warn 4.68, nord danger 3.05 noted). Muted lowest solarized 5.61.

## Fix direction

Lift comment token luminance ~one step per theme; darken/lighten danger in nord/solarized/gruvbox. For selection, either lighten selection alpha or switch text to a high-contrast colour on selection.
