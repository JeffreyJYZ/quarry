# consts-14-lib-editor

Area: `src/lib/editor/**`. Read-only.

## Regex literals (behaviourally important)

- `src/lib/editor/markdown.ts`: `/^\s*```(\w*)\s*$/`, `/^\s*```\s*$/`, `/^(#{1,6})\s+(.*)$/`, `/^\s{0,3}((-{3,})|(\*{3,})|(_{3,}))\s*$/`, `/^\s*([-*+]|\d+\.)\s+/`, `/^\s*\d+\.\s+/`, `/(`[^`]+`|\*\*[^_]+\*\*|\*[^_]+\*|\[[^\]]+\]\([^)]+\))/g`, `/^\[([^\]]+)\]\(([^)]+)\)$/`. Markdown parsing grammar; behaviourally significant. Candidate for consts only if shared.
- `src/lib/editor/cppEditing.ts`: `ACCESS_SPECIFIER = /^(\s*)(?:public|private|protected|signals|slots|Q_SIGNALS|Q_SLOTS)\s*:/`, `WAITING_BRACE = /^[ \t]*(?:\r?\n[ \t]*){0,2}\}/`. Behaviourally significant (typing/indent).
- `src/lib/editor/linePrompt.ts`: `/^\d+$/`. Trivial.
- `src/lib/editor/languages.ts`: `/\\/g` path normalization. Trivial; mirrors `extensionOf` in `src/lib/consts/extensions.ts`.

## Cache cap

- `src/lib/editor/documentCache.ts:23`: `DOCUMENT_CACHE_LIMIT = 20`. Named and exported; already a const. LRU eviction keyed on it.

## Tab sizes

- None in `src/lib/editor` or `src/lib/consts`. Tab size comes from CodeMirror `EditorState.tabSize` facet and `indentUnit` (see `commands.ts:23`). `stateSnapshot.test.ts` pins 2 and 8 as test values only.

## Language ids

- `src/lib/editor/languages.ts` maps paths to `"toml" | "rust" | "c++" | "json" | "yaml"` via `languageNameForPath`. Already uses `isCppExtension`/`isRustExtension` from `src/lib/consts/extensions.ts`. TOML filename set and `.cargo/config` special case live here, not in consts. `languageLabel.ts` consumes `languageNameForPath`.

## Folding rules

- `src/lib/editor/folding.ts`: bracket matching for `() [] {}`; `foldRangeForLine` folds `{ ... }` blocks only, requires opening line trailing content empty. Behaviourally significant; no existing consts.

## Already in consts/extensions.ts

- `CPP_EXTENSIONS`, `RUST_EXTENSIONS`, `isCppExtension`, `isRustExtension`, `isCppPath`, `isRustPath`, `extensionOf`, `dotted`. `languages.ts` imports two of these. No other editor file imports extensions.
