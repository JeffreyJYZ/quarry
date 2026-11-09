# Audit 32 — styling coverage

## P0 — `scripts/unstyled-classes.ts` matcher is structurally blind

File: `scripts/unstyled-classes.ts:27-36`. The gate-facing check (run manually per AGENTS.md) reports `0 of N` while missing whole classes:

- Only scans `src/ui/debug/**/*.tsx` (`Glob("src/ui/debug/**/*.tsx")`), so every component outside `debug/` is never checked — the gate's "0 unstyled" is a property of one subtree.
- Regex `className=(?:"([^"]*)"|\{[^}]*?"([^"]*)"[^}]*?\})` only captures a _single_ double-quoted literal. It misses:
    - template literals: `className={`git-row${selected ? " git-row-selected" : ""}`}` (15 sites in src/ui, e.g. `src/ui/git/rows.tsx:33,41`) — none of their interpolated classes are recorded, and the base literal is dropped too.
    - ternary second branch: `className={debug.error === null ? "dock-debug-strip" : "dock-debug-strip error"}` (`src/ui/debug/dock/DebugDockBody.tsx:48`) records only `"dock-debug-strip"`, dropping `"error"`.
    - variable/concatenated: `className={rowClass.join(" ")}` (`src/ui/debug/memory/MemoryHexView.tsx:35`), `className={cls}` (`src/ui/git/DiffView.tsx:164`), `className={stateClass}` (`src/ui/search/SearchPalette.tsx:89`) — captured classes are never recorded.
    - array join sites (`src/ui/components/TabStrip.tsx:55`) and helper functions (`dotClass` in `src/ui/tests/parts.ts:86`) are invisible.
- Defined-set regex `/\.([a-z][a-z0-9-]*)/g` only matches lowercase-leading names; any uppercase or underscore class name is dropped from the "defined" set (none found today, but the filter is latent).
- `token.includes("$")` is the only guard against interpolation; a class containing `$` in a real name would be skipped.

Concrete fix: parse className values with a TS-aware extractor (or at minimum handle template literals, all quoted strings inside braces, and `join`/concatenation heuristics), and widen the scan to `src/ui/**/*.tsx`. Until then the "0 unstyled" number is not evidence.

## P1 — genuinely unstyled classes found by manual audit

- `src/ui/tests/parts.ts:86-91` `dotClass` returns `"test-dot"` / `"test-dot pass"` / `"test-dot fail"`, but no stylesheet defines `.test-dot` (grep `test-dot` across `src/**/*.css` = 0). Test status dots render with default UA styling. Fix: add `.test-dot` (and `.pass`/`.fail` or compound) rules in the tests stylesheet, or reuse an existing dot class.
- `src/ui/editor/surface/SearchBar.tsx:38,46` use bare `className="active"` for the case-sensitive and regex toggle buttons. No bare `.active` selector exists anywhere in `src/**/*.css` (grep `^\.active` = 0); the styled form is always scoped (`.search-toggle.active`, `.dock-seg.active`, etc.). Those two toggles never show an active state. Fix: change to `"search-toggle active"` (or the scoped class used by the other toggles at lines 63/71/79/87) and keep the conditional.

## P2 — matcher blind spots that mask latent issues

- `src/ui/git/DiffView.tsx:157-161` builds `added`/`removed` via concatenation; both happen to be defined (`src/ui/styles/15-git-diff-btn.css:90,94`), but the script never verifies them. Same for `unreadable`/`current` in `src/ui/debug/memory/MemoryHexView.tsx:31-33` (defined in `hex-table.css`). Any future concatenation site would pass silently.
- `src/ui/debug/dock/DebugDockBody.tsx:48` second branch `dock-debug-strip error` — `error` is used as a bare class; verify `.error` is globally defined (it is used elsewhere as compound only). Worth a check before relying on it.

## Checked, no issue

- Inline `style={{...}}` usages (17 sites) are layout-only (flex, width, padding, position, height); the only colour use is `var(--muted)` (`src/ui/settings/TerminalSection.tsx:166`, `src/ui/settings/UpdatesSection.tsx:35`) — no hardcoded hex/rgb.
- Template-literal classes checked (`git-row-selected`, `git-row-busy`, `git-branch-option-active`, `git-diff-hunk-active`, `git-tab-active`, `problem-dot` severity classes, `dock-tab-status`) all have matching CSS definitions.
- `rowClass`/`cls`/`stateClass`/`bodyClass` compound classes (`dock-body`, `dock-body-debug`, `dock-body-run`, `search-state`, `search-state error`) are defined.
- Hover/active state pairs reviewed for the debug subtree: each `:hover`/`.active` rule has a corresponding base selector in the same stylesheet; no orphaned state rules found in `src/ui/debug/**/*.css`.
