# Audit 36 — frontend test coverage gaps

Scope: pure logic (mappers, parsers, reducers, path helpers, keymap tables) with no sibling `*.test.*`. JSX rendering excluded. 79 test files exist under `src/` (76 `.test.ts` + 3 `.test.tsx`); 108 `src/lib` modules have no test.

## Ranked findings

P0 — `src/lib/refactor/apply.ts:24` `applyEdits` + `toOffset` (unexported). Off-by-one in `toOffset` (`lines[i].length + 1`, assumes `\n`) corrupts every LSP/CodeAction text edit; no test pins offset math or reverse-order multi-edit application. Fix: export `toOffset`/`applyEdits` and add unit tests for multi-line ranges, trailing newline, overlapping edits.

P1 — `src/lib/lsp/diagnostics.ts:1` `diagnosticKey`/`sortDiagnostics`/`withServerDiagnostics`/`groupDiagnostics`/`combineDiagnostics`/`countSeverities`. Dedup-by-key and severity merge logic untested. Fix: tests for duplicate dedup in `combineDiagnostics`, empty-publish clears path, severity counts.

P1 — `src/lib/editor/positions.ts:3` `toLspPosition`. View→LSP coord mapper untested. Fix: test round-trip at line boundaries and tabs.

P1 — `src/lib/editor/completion.ts:1` `kindToType`, `:44` `splitTopLevel`. Parser for top-level comma split untested (quotes/parens). Fix: tests for nested parens and strings.

P1 — `src/lib/editor/compare.ts:1` `sameLines`, `:9` `sameSet`. Equality helpers untested.

P1 — `src/lib/editor/diagnostics.ts:39` `toLintDiagnostics`, `:48` `lintSignature`. Mapper untested.

P1 — `src/lib/editor/languageLabel.ts:4` `languageLabel`. Extension→label mapper untested (drift risk with status bar).

P1 — `src/lib/themes/parse.ts:151` `parseThemeJson`. Parser untested.

P1 — `src/lib/themes/model.ts:61` `themeVar`, `:67` `isHexColor`, `:72` `normalizeHex`, `:77` `themeSlug`, `:87` `normalizeTheme`, `:110` `readCustomThemes`. Theme normalization untested.

P1 — `src/lib/themes/preferences.ts:21` `normalizeThemePreferences`. Normalizer untested.

P1 — `src/lib/terminal/sessions.ts:24` `emptySession`, `:40` `describe`, `:46` `appendData`, `:57` `dirOf`, `:63` `shortCwd`, `:70` `tabLabel`. Reducer/helpers untested.

P1 — `src/lib/git/commitHistory.ts:53` `rememberMessage`. History reducer untested.

P1 — `src/lib/debug/buildCommand.ts:85` `buildSummary`. Mapper untested.

P1 — `src/lib/project/errors.ts:2` `describeError`. Error formatter untested.

P1 — `src/ui/projects/kinds.ts:9` `defaultStandard`, `:14` `parentOf`, `:18` `joinPath`; `src/ui/projects/recentPaths.ts:1` `splitPath`. Path helpers untested.

P1 — `src/ui/goto/gotoModel.ts:14` `fileNameOf`, `:20` `filterRows`. Mapper/filter untested.

P1 — `src/ui/git/labels.ts:3` `dirOf`, `:9` `nameOf`, `:14` `relativeTime`. Label helpers untested.

P1 — `src/ui/outline/outlineKinds.ts:5` `kindLabel`. Mapper untested.

P1 — `src/ui/problems/rowKeyNav.ts:10` `rowKeyNav`. Keyboard nav reducer untested.

P1 — `src/ui/problems/parts.ts:61` `cacheKey`; `src/ui/quickopen/parts.ts:21` `fileParts`; `src/ui/run/parts.ts:6` `envProblem`; `src/ui/search/parts.ts:12` `invalidQuery`; `src/ui/debug/memory/parts.ts:59` `requestFor`. Pure mappers untested.

P2 — `src/ui/tests/parts.ts` `groupByBinary`/`splitName`/`capOutput`/`failureReason`/`dotClass`/`countByBinary`. Test-result grouping untested.

P2 — `src/ui/terminal/xtermOptions.ts:10` `xtermFontFamily`, `:25` `xtermOptions`. Option builder untested.

P2 — `src/ui/app/commandList.ts:12` `buildCommands`. Command table builder untested.

P2 — `src/lib/lsp/session.ts`, `src/lib/lsp/context.ts`, `src/lib/lsp/feed.ts` (hook) untested non-UI bits.

## Checked, no issue

- `src/lib/consts/*` are data tables; coverage only where a test exists (`extensions.test.ts`).
- `src/lib/themes/builtin/*.ts` are data.
- `src/lib/debug/use*.ts`, `src/lib/git/use*.ts`, `src/lib/run/use*.ts`, `src/ui/**/use*.ts` are React hooks — excluded (not pure logic).
- `src/ui/**/*.tsx` components — excluded per scope.
- `src/lib/project/api/*` are Tauri IPC wrappers — excluded.
