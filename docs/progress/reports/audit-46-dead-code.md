# Audit 46 — dead and orphaned code

Scope: `src/`, `src-tauri/`. Method: exported-symbol usage sweep across all `.ts/.tsx/.rs` in repo (excluding node_modules/target/.git); registered Tauri commands cross-checked against `invoke(...)` call sites; Rust `pub fn` reference counts.

## P1 — unused runtime exports (defined, never imported anywhere)

Each below appears in exactly one file (its definition). Verified with a whole-repo word-boundary scan. Delete is safe unless noted.

- `src/lib/debug/buildCommand.ts:runBuildCommand`, `buildSummary` — debug build helpers with no caller.
- `src/lib/debug/presets.ts:validatePreset` — preset validator unused.
- `src/lib/debug/useBreakpointActions.ts:blankBreakpoint` — factory unused.
- `src/lib/editor/breakpoints.ts:breakpointField` — field descriptor unused.
- `src/lib/editor/cppEditing.ts:openerIndentAt`, `autoClosedScopeEnd`, `cppPlan` — C++ editing plan helpers unused.
- `src/lib/editor/semanticTokens.ts:decorationsFor` — decoration builder unused.
- `src/lib/lsp/diagnostics.ts:sortDiagnostics` — unused; sort logic inlined at call site?
- `src/lib/problems/model.ts:severityName`, `filterDiagnostics`, `matchesProblemText` — problem model helpers unused.
- `src/lib/project/api/dap.ts:dapContinue`, `dapStep` — thin wrappers unused (other dap wrappers used).
- `src/lib/updates/notes.ts:NOTES_TIMEOUT_MS` — constant unused.
- `src/lib/updates/store.ts:installNow`, `releaseOffer` — update actions unused.
- `src/ui/components/StatusBarIcons.tsx:RailIcon`, `PanelIcon`, `GitBranchIcon`, `BuildIcon` — icon components unused (likely replaced).
- `src/ui/components/TreeRow.tsx:badgeFor` — badge helper unused.
- `src/ui/settings/settingsSearch.ts:filterSections` — unused.
- `src/ui/terminal/xtermOptions.ts:xtermFontFamily` — unused.

## P2 — documented seams (not safe to delete without test updates)

- `src-tauri/src/lsp/call_hierarchy_node_from_item.rs:parse_call_hierarchy_prepare`, `parse_call_hierarchy_calls` — both carry `#[allow(dead_code)]` and are labelled "Pure mapping helper for tests". They are test fixtures, not production paths. Keep; deleting breaks tests.

## P3 — registered-but-indirectly-invoked (not dead, for completeness)

Eight commands (`create_file`, `create_dir`, `rename_path`, `delete_path`, `git_stage_hunk`, `git_unstage_hunk`, `lsp_prepare_type_hierarchy`, `lsp_type_hierarchy`) are registered in `lib.rs` and invoked via wrappers in `src/lib/project/fileOps.ts`, `src/lib/git/api.ts`, `src/lib/lsp/typeHierarchy.ts` — not dead. The `commands.test.ts` audit misses them because its regex only matches `invoke("name")` with the literal immediately after `(`; wrappers use `invoke<T>("name", {...})`.

## Checked, no issue

- All other 671 runtime exports in `src/lib`/`src/ui` have at least one importer.
- No `if (true)`/`if (false)` unreachable branches found.
- No unused assets/fonts/icons (only `assets/icon.svg`, referenced by website layout and `build-search.ts`).
- Rust `pub fn` count 514; only the two documented test helpers above appear once.
- All `mod` declarations in `lib.rs` correspond to used modules.
- No orphaned modules detected in `src-tauri/src`.

## Note

The 25 P1 items are typecheck-safe to remove (no importer). Recommend a follow-up PR deleting them in one commit; verify with `bun run gate`. Do not delete the two P2 helpers.
