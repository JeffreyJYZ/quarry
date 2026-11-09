# 12-projects-generate

## Scope

Area: `src/ui/projects/**`, `src/ui/generate/**`, `src/ui/updates/**`, `src/ui/calls/**`. No edits made.

## Language standard lists / scaffolding text

- `src/lib/consts/projects.ts:9` KINDS and `:13` STANDARDS are already split into a const module; `src/ui/projects/kinds.ts:7` only re-exports them. Nothing to move.
- `src/ui/projects/kinds.ts:10` `defaultStandard()` returns `STANDARDS[kind][0].value` — first-option default, fine.
- Starter file contents already live in `src-tauri/src/new_project/templates.rs` and snippets in `src/lib/consts/generate.ts` per AGENTS.md; scanned UI does not hold scaffold text. Nothing worth moving.

## Updates

- `src/lib/updates/deps.ts:8` hard-codes GitHub release URL `https://api.github.com/repos/JeffreyJYZ/quarry/releases/latest`.
- `src/lib/updates/deps.ts:15` `UPDATE_FETCH_TIMEOUT_MS = 8000`; `src/lib/updates/notes.ts:50` `NOTES_TIMEOUT_MS = 8000`; `src/lib/updates/poll.ts:8` initial `setTimeout(run, 8000)` duplicates that timeout inline.
- Version parsing: `src/lib/updates/model.ts:3` `VERSION_RE`, `:7` `parseVersion`, `:14` `comparePrerelease`; `src/lib/updates/notes.ts:13` `notesTagFor` alpha regex `^(\d+\.\d+\.\d+)-alpha\.(\d+)$`.
- Storage keys: `src/lib/updates/notes.ts:93` `NOTES_SEEN_KEY = "quarry.releaseNotes.seen"`.
- `src/lib/updates/useCurrentVersion.ts` / `useWhatsNew.ts` delegate to lib; constants above are the source.

## Calls / glyphs

- `src/ui/calls/CallsPanel.tsx:12` `MAX_DEPTH = 5` inline.
- Glyph literals inline at `src/ui/calls/CallsPanel.tsx:118` (`"▾"` / `"▸"`) and empty-state strings.
- Version glyph/strings in UI are interpolation only; no version parser in scanned UI.

## Generate UI

- `src/ui/generate/Generate.tsx` holds only keyboard constants inline (`Escape`/`ArrowDown`/`ArrowUp`/`Enter`) and copy strings; snippets themselves are in `src/lib/consts/generate.ts`. Nothing worth moving beyond the copy strings.

## Conclusion

Most scanned surfaces already point at `src/lib/consts` or `src/lib/updates`. Hardcoded timeouts and glyphs above are the only candidates; no duplicate language standard list exists in scanned UI.
