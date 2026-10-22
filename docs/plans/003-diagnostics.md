# Diagnostics end to end

Parent plans: [`001-clion-parity.md`](001-clion-parity.md), [`002-p0-project-model.md`](002-p0-project-model.md).
P0 is complete and committed; this slice turns the editor into something that reads code back to you:
a language server attaches, its diagnostics reach the UI, and a cargo build contributes its own.

## Goal

Open a project, open a file, and see real errors and warnings — underlined in the editor and listed in a
problems panel — sourced from rust-analyzer or clangd, plus compiler diagnostics from a build.

Acceptance:
1. Opening a project starts one language server for its kind (`rust-analyzer` for Cargo, `clangd` for
   CMake or `compile_commands.json`) and reports it in the status bar.
2. Diagnostics for an open document arrive without saving and render as underline squiggles plus a
   Problems list; the list groups by file and shows severity, line and message.
3. Editing a document pushes the full text to the server (debounced) and refreshes its diagnostics.
4. `bun run build` in the app runs `cargo build --message-format=json`, returns a report with
   diagnostics, and the Problems panel merges them with server diagnostics.
5. Closing a project kills its server; no orphan processes survive app exit.
6. `cargo test`, `bun run check`, `bun run build` all pass.
7. `bun run scripts/lsp-ux-smoke.ts` completes and reports signatureHelp/rename/codeAction shapes.

Not in this slice: completion, hover, go-to-definition, rename, inline hints, semantic tokens.

## Frozen contracts

`src-tauri/src/types.rs` already carries `Position`, `Range`, `Diagnostic`, `DiagnosticsEvent`,
`LspStatus`, `BuildReport`. `src/project/api.ts` mirrors them and exposes `startLsp`, `stopLsp`,
`lspOpenDocument`, `lspChangeDocument`, `lspCloseDocument`, `buildProject`, `onDiagnostics`.

Rust commands, registered in `lib.rs`:

| Command               | Signature                                                                             |
| --------------------- | ------------------------------------------------------------------------------------- |
| `start_lsp`           | `(app: AppHandle, state: State<LspState>, root: String) -> Result<LspStatus, String>` |
| `stop_lsp`            | `(state: State<LspState>, root: String) -> Result<(), String>`                        |
| `lsp_open_document`   | `(state, root: String, path: String, text: String) -> Result<(), String>`             |
| `lsp_change_document` | `(state, root: String, path: String, text: String) -> Result<(), String>`             |
| `lsp_close_document`  | `(state, root: String, path: String) -> Result<(), String>`                           |
| `build_project`       | `(root: String, profile: String) -> Result<BuildReport, String>`                      |

Event: `lsp://diagnostics`, payload `DiagnosticsEvent { root, path, diagnostics }`. Paths are absolute;
ranges are zero-based. Severity uses the LSP scale (1 error … 4 hint).

Editor props grow one optional member, and only downwards:

```tsx
export type EditorProps = {
	path: string | null;
	value: string;
	onChange: (value: string) => void;
	/** Diagnostics for this document only; the editor renders them, it never fetches them. */
	diagnostics?: Diagnostic[];
};
```

## Units

| Unit               | Files (nothing else)                       | Work                                                                                                            |
| ------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **U6 lsp**         | `src-tauri/src/lsp.rs`                     | session map, spawn + handshake, document sync, `publishDiagnostics` → event, shutdown on `stop_lsp` and on drop |
| **U7 build**       | `src-tauri/src/build_task.rs`              | `cargo build --message-format=json`, span → absolute path, severity map, `BuildReport`                          |
| **U8 problems**    | `src/App.tsx`, `src/problems/`, `src/lsp/` | event subscription, diagnostics store keyed by path, Problems panel, server lifecycle, build action             |
| **U9 editor lint** | `src/editor/`                              | optional `diagnostics` prop rendered through `@codemirror/lint`, squiggle + gutter marker, no fetching          |

U8 imports `Editor` and passes `diagnostics`; U9 renders whatever it receives. Neither may edit the
other's files. `types.rs`, `api.ts`, `lib.rs`, `package.json`, `Cargo.toml` stay frozen.

## Gates

Per unit: `cargo test` and `cargo check` for Rust; `bun run check` and `bun run build` for the frontend.
Controller runs both on the merged tree and commits.
