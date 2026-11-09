# Module shape audit (200-line rule)

Scope: `src` + `src-tauri/src`. Gate script: `scripts/check-file-size.ts`, limit 200 lines. `docs/refactor/oversized.txt` currently contains only its header comment: no grandfathered files.

## Files at or near the limit

| path                                       |   lines | what it holds                                                               | seam to split on                                             | split type                                                                 |
| ------------------------------------------ | ------: | --------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| src/ui/app/useWorkspace.ts                 |     200 | project open, buffer read/save, tab navigation, close-confirm               | project/buffers vs tab-close/navigation                      | straight module move (already composes `useTabClose`, `useFileNavigation`) |
| src/ui/app/useShell.ts                     |     198 | composition root for every shell hook and shared refs                       | composition only; no new logic belongs here                  | refactor if it grows (move derived values into focused hooks)              |
| src/lib/lsp/session.ts                     |     199 | server lifecycle plus document open/change/close sync                       | `useLspServers` vs `useDocumentSync`                         | straight module move (two exported hooks)                                  |
| src/ui/debug/useDebugSession.ts            |     198 | debug session state/events                                                  | session lifecycle vs variable/stack queries                  | refactor (state shared across both)                                        |
| src/ui/terminal/useTerminalSessions.ts     |     198 | PTY session list, raw subscription, replay                                  | session registry vs terminal I/O wiring                      | refactor                                                                   |
| src/ui/app/commandList.ts                  |     198 | command registry entries                                                    | command definitions vs dispatch handlers                     | straight module move by command group                                      |
| src-tauri/src/settings/preferences.rs      |     200 | `Preferences` struct, defaults, deserializers, normalize, `ProjectSettings` | preferences schema/defaults vs normalize/deserialize helpers | straight module move                                                       |
| src-tauri/src/menu/mod.rs                  |     196 | native menu construction and event id list                                  | menu builders vs event dispatch ids                          | straight module move                                                       |
| src/ui/search/useSearchQuery.ts            |     200 | search query state and execution                                            | query state vs result fetching                               | refactor                                                                   |
| src/ui/goto/Goto.tsx                       |     199 | goto dialog component                                                       | component vs search/navigation hook                          | refactor                                                                   |
| src/ui/styles/_.css, src/ui/styles/_/*.css | 185-200 | one stylesheet per surface                                                  | per-component CSS already split by surface                   | straight split via `bun scripts/split-css.ts` only if a file crosses 200   |

## Findings (ranked)

1. **High — many files sit at 198-200 lines with no headroom.** `useWorkspace.ts`, `preferences.rs`, `useSearchQuery.ts`, `useShell.ts` (198), `session.ts` (199), `useDebugSession.ts` (198), `useTerminalSessions.ts` (198), `commandList.ts` (198). One added function or import pushes them over the gate. Split before adding features, not after.
2. **Medium — `preferences.rs` mixes schema, serde helpers, defaults, normalization and `ProjectSettings` in one file.** Seam: move `ProjectSettings` and all `default_*`/`deserialize_*` helpers into `settings/preferences_defaults.rs` or `settings/preferences_serde.rs`; keep struct + `normalize`. Straight module move, no behaviour change.
3. **Medium — `src/lib/lsp/session.ts` combines two unrelated exported hooks.** `useLspServers` owns server lifecycle; `useDocumentSync` owns document open/change/close debounce. Seam is the export boundary; split into `lsp/useLspServers.ts` and `lsp/useDocumentSync.ts`.
4. **Medium — `useWorkspace.ts` is a coordinator that also owns buffer reading and recent-file state.** Seam: extract `openPath`/reading/recent-files into `useWorkspaceBuffers.ts`; leave `useWorkspace` as composition. Already follows the repo's hook-composition pattern.
5. **Low — `useShell.ts` is composition-only and correctly stays under 200, but it is the natural place for new wiring.** Any new subsystem should be a new hook consumed here, not inline code.
6. **Checked — no `include!`/shared-scope module splits found.** `rg 'include!' src-tauri/src` returned no matches. Module splitting must use `foo/mod.rs` + `mod bar;` + `pub use`, per repo rule.

## Checked, no issue

- `docs/refactor/oversized.txt` has no entries; gate has no grandfathered files.
- No file over 200 lines under `src` or `src-tauri/src` (max observed 200).
- No `include!` usage in Rust.
- CSS files at ~200 lines are split by surface and already follow the repo's stylesheet naming rule.
