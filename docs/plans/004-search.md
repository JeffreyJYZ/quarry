# Project search

Parent plans: [`001-clion-parity.md`](001-clion-parity.md), [`003-diagnostics.md`](003-diagnostics.md).

## Goal

Search the open project as you type. `Cmd+F` opens a keyboard-first palette over the editor, results
group by file, and choosing one opens that file in a tab through the same path the file tree uses.

## Acceptance

1. `Cmd+F` opens the palette when focus is outside the editor; `Escape` closes it; `Enter` runs the query.
2. Results group by file with `line:column` and the matching line; arrows move the highlight, `Enter`
   opens the file.
3. A regex the backend rejects shows one readable line, never a crash or an unhandled promise.
4. The result cap is visible: `N+ results (truncated)` when the backend reports truncation.
5. The status bar carries the language server name and error/warning counts in its middle slot, with no
   second status line.
6. `cargo test`, `bun run check`, `bun run build` pass.

## Contracts

Backend command, registered in `lib.rs`:

```rust
pub const DEFAULT_MAX_RESULTS: u32 = 300;

#[tauri::command]
pub async fn search_project(root: String, query: String, max_results: Option<u32>)
    -> Result<SearchReport, String>;
```

`types.rs`: `SearchMatch { path, line, column, text }` with 1-based `line`/`column` and absolute
`path`; `SearchReport { matches, truncated, duration_ms }`.

Backend behaviour: `rg --json --line-number --smart-case --no-heading --color=never` with
`-g '!target'`, `-g '!node_modules'`, `-g '!.git'`, query passed as a single `-e` argument, run inside
`spawn_blocking`. Exit code 1 is an empty result, not an error. The child is killed once the cap is hit.

Frontend: `searchProject(root, query, maxResults?)` in `src/project/api.ts`; the palette lives in
`src/search/`, and `StatusBar` gains `extra?: ReactNode` for the middle slot.

## Units

| Unit                   | Files                                                                          | Work                                                                  |
| ---------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| **U12 search backend** | `src-tauri/src/search.rs`                                                      | argv construction, JSON stream parse, cap + kill, pure-function tests |
| **U13 search panel**   | `src/App.tsx`, `src/components/StatusBar.tsx`, `src/styles.css`, `src/search/` | palette, grouped results, keyboard flow, status bar slot fix          |

Not in this slice: replace-in-files, search history, fuzzy file-name search, indexed search.
