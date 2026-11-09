# consts-11-lsp-goto

Scope: `src/ui/lsp/**`, `src/ui/goto/**`, `src/ui/breadcrumb/**`.

## Findings

- `src/ui/goto/Goto.tsx:59-67,80-86` hardcodes server kind strings `"rust-analyzer"` and `"clangd"` in three places (`new Set`, `running.has`, ternary). Same literals recur in `src/ui/breadcrumb/Breadcrumb.tsx:53`, `src/ui/lsp/useHierarchy.ts:45`. Worth one shared server-kind constant or helper.
- `src/ui/goto/Goto.tsx:118` hardcodes result cap `200` in `filterRows(rows, query).slice(0, 200)`.
- `src/ui/goto/gotoModel.ts:1` defines `GotoMode = "class" | "symbol" | "recent"`; mode comparisons in `src/ui/goto/Goto.tsx:42,57` use bare strings. `TITLES` already lives in `src/lib/consts/goto.ts`, but mode literals remain inline.
- `src/ui/lsp/useHierarchy.ts:46` and `src/ui/lsp/HierarchyNode.tsx:23` use bare direction literals `"supertypes" | "subtypes"`. `DIRECTIONS`/`TITLES`/`EMPTY_NOTES` already in `src/lib/consts/lsp.ts`, but the union and comparisons are inline.
- `src/ui/lsp/HierarchyNode.tsx:33` hardcodes indentation constants `6` and `14` in `${6 + depth * 14}px`; repeated at lines 79 and 87 as `${6 + (depth + 1) * 14}px`.
- `src/ui/breadcrumb/Breadcrumb.tsx:83-84` hardcodes display truncation `4` and `3` in `segments.length > 4` / `segments.slice(segments.length - 3)`.
- No LSP protocol method names as bare strings in this area. Calls go through `lspSymbols`, `lspWorkspaceSymbols`, `lspPrepareTypeHierarchy`, `lspTypeHierarchy` from `@/lib/project/api` and `@/lib/lsp/typeHierarchy`. No timeouts or request limits in these files beyond the `200` row cap above.
- `src/ui/lsp/parts.ts` only re-exports existing consts from `@/lib/consts/lsp.ts`; no new literals there.
