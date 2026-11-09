# CLion parity daily-loop audit

Read-only audit of docs/plans/001-clion-parity.md against the tree at 0.1.0-alpha.79.

## Marked-done rows with no implementation

None found. Every capability the plan matrix lists as in scope (completion, diagnostics, hover, goto def/impl/type, references, rename, code actions, inlay hints, semantic tokens, call/type hierarchy, format on save, project search, build/target/profile, run/debug configs, breakpoints incl. conditional/log/data, memory view, disassembly, pretty printing, test runner, terminal, git) has a wired implementation per README.md §Status and the command palette. The only honest "not done" items README names are eval limits and richer run-config UI, both already in the non-goals-ish bucket.

## Ranked gaps (by daily frequency)

### P1 — Header ↔ implementation switch (C/C++)

- Item: no command to jump between a header (.h/.hpp/.hxx) and its implementation (.c/.cc/.cpp/.cxx) by matching stem.
- Why: in a C/C++ daily loop this is hit tens of times per hour; clangd has textDocument/switchSourceHeader but quarry never calls it, and there is no fallback by filename stem either. rg over src found no switchSourceHeader/corresponding/header-source reference.
- Smallest shippable: add lspSwitchSourceHeader (or a pure file-tree resolver) + a command "Switch header/source" bound to Ctrl+Alt+Up (CLion) in useClionKeymap, disabled when no active file or no counterpart found. Reuse files::list_files to resolve the stem match if the server lacks the method.

### P2 — File structure popup

- Item: Outline.tsx panel exists (document symbols) but no popup/modal triggered by a shortcut; CLion's Ctrl+F12 file structure is a searchable popup.
- Why: navigating within a large file is a high-frequency action; the side panel is a click away and not keyboard-first.
- Smallest shippable: reuse Outline's symbol data in a modal overlay bound to Ctrl+F12, with type-to-filter and Enter-to-navigate; no new data source needed.

### P2 — Reload from disk

- Item: no reload-from-disk command; buffers are never re-read after an external change, and there is no mtime check on focus.
- Why: editing the same file in another tool or after a git checkout silently leaves a stale buffer; saving then overwrites external changes.
- Smallest shippable: on window focus/activation, stat the active file; if mtime changed and buffer is clean, reload; if dirty, prompt "File changed on disk — Reload / Keep mine".

### P3 — Live templates / snippets

- Item: no snippet/template engine; Generate.tsx exists but is not template expansion; no Tab-expandable live templates.
- Why: typing for/main/fn scaffolds by hand is daily friction, lower than navigation but recurring.
- Smallest shippable: add CodeMirror's snippet extension with a built-in set for Rust and C/C++ (loop, main, function, include guard) plus optional .quarry/snippets.json; defer user-defined templates.

### P3 — Format selection

- Item: context menu offers "Format document" only; no range format even though clangd/rust-analyzer support textDocument/rangeFormatting.
- Why: formatting a pasted block without reformatting the whole file; moderate frequency.
- Smallest shippable: when view.state.selection is non-empty, call lsp_format with a range (extend lsp_format to accept optional range) and apply returned edits; menu label becomes "Format selection" when selected.

### P3 — Compare with clipboard

- Item: no diff-against-clipboard view; "Compare with clipboard" is absent.
- Why: useful but rare; a clipboard diff is a debugging aid, not daily navigation.
- Smallest shippable: a command that opens the existing diff panel with the buffer as left side and clipboard text as right side.

### P3 — Inject language / language injection

- Item: no language injection (e.g. SQL in a Rust string, C in a macro) and no "inject language" intention.
- Why: niche; CLion users hit it occasionally; not on the daily loop.
- Smallest shippable: defer; if ever, implement as a CodeMirror language override on a selected range only.

## Deliberately out of scope (per plan §8 / README)

- Profiler / DFA, remote dev, embedded targets, DB, Docker, AI, plugin API, other languages.
- Long-tail refactorings beyond rename and LSP code actions (extract method, change signature, etc.).
- Call/type hierarchy already shipped; no gap.
- Quick documentation (F1) already wired — not a gap.
- Rename (F2) already wired — not a gap.
- Type hierarchy popup exists as panel; not a popup gap worth fixing beyond above.

## Notes

- Plan matrix rows are all implemented as of alpha.79; README's "Still missing" list (eval limits, richer run config) is the accurate residual.
- No false "done" claims found in README.
