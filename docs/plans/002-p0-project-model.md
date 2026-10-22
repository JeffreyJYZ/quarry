# P0 — shell, project model, editor mount

Parent plan: [`001-clion-parity.md`](001-clion-parity.md). This document is the executable slice: exact
contracts, unit ownership, and gates. Everything else in P0 is forbidden scope creep.

## Goal

Launch the app, pick a Rust or C/C++ folder, see its files, open one in the editor, and see which
toolchains were detected — with the compile state green and no LSP or DAP code yet.

Acceptance:
1. `bun run tauri dev` opens a window with the dark shell; no white flash.
2. "Open project" picks a directory and records root, name, kind (`cargo` / `cmake` /
   `compileCommands` / `unknown`), build root, and whether `.quarry/launch.json` exists.
3. The sidebar lists the project tree one level at a time, directories lazily expanded, hidden entries
   skipped unless enabled later.
4. Clicking a text file opens a tab; tabs can be closed; the editor shows the file's content with syntax
   highlighting for `.rs`, `.c`, `.h`, `.cc`, `.cpp`, `.hpp`.
5. The status bar shows a compact toolchain line (`ra · clangd · lldb-dap · rustfmt · clang-format`) with
   missing entries marked.
6. `cargo check`, `bun run check` and `bun run build` all pass.

Explicitly not in P0: LSP processes, DAP, editing persistence, layout persistence, search, git, tests,
launch configurations beyond detection.

## Contracts (authored by the controller, not the units)

`src-tauri/src/types.rs` is the single source of the wire shapes; `src/project/api.ts` mirrors it on the
frontend. Both are frozen for P0 — a unit that needs a new field reports back instead of editing them.

Rust commands, all registered in `src-tauri/src/lib.rs`:

| Command        | Signature                                          | Owner module               |
| -------------- | -------------------------------------------------- | -------------------------- |
| `version`      | `() -> &'static str`                               | `lib.rs` (already present) |
| `toolchains`   | `() -> ToolchainReport`                            | `toolchain.rs`             |
| `open_project` | `(root: String) -> Result<ProjectInfo, String>`    | `project.rs`               |
| `list_dir`     | `(path: String) -> Result<Vec<FileEntry>, String>` | `workspace.rs`             |

Protocol framing, no command surface yet:

```rust
pub fn write_frame<W: Write>(writer: &mut W, value: &serde_json::Value) -> io::Result<()>;
pub fn read_frame<R: BufRead>(reader: &mut R) -> Result<serde_json::Value, FrameError>;
pub struct ProcessPipe { pub frames: Receiver<Result<serde_json::Value, FrameError>> /* … */ }
impl ProcessPipe {
    pub fn spawn(command: &mut Command) -> io::Result<Self>;
    pub fn send(&mut self, value: &serde_json::Value) -> io::Result<()>;
    pub fn kill(&mut self) -> io::Result<()>;
}
```

Frontend seams:

| File                    | Owns                                                                      |
| ----------------------- | ------------------------------------------------------------------------- |
| `src/project/api.ts`    | typed wrappers over the four commands; frozen                             |
| `src/editor/Editor.tsx` | `{ path, value, onChange }` — CodeMirror internals swapped in by its unit |
| `src/App.tsx`           | layout, project open flow, tabs, status bar                               |

## Units

Four parallel units, disjoint file sets. Each runs on `opencode/deepseek-v4.1-flash-free#high`; if it
dies, re-dispatch the same unit on `openrouter/minimax/minimax-m3.1-flash:free#medium`, then
`opencode/minimax-m3.1-flash-free#medium`.

| Unit                 | Files (may not touch anything else)                                | Work                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **U1 toolchain**     | `src-tauri/src/toolchain.rs`                                       | probe `PATH` then `xcrun --find` for rust-analyzer, clangd, rustfmt, clang-format, lldb-dap, cargo, cmake, ninja; report path + source                                                                       |
| **U2 project model** | `src-tauri/src/project.rs`, `src-tauri/src/workspace.rs`           | detect kind by walking up for `Cargo.toml` / `CMakeLists.txt` / `compile_commands.json`; derive name and build root; `list_dir` with stable ordering (dirs first, case-insensitive) and no symlink recursion |
| **U3 framing**       | `src-tauri/src/protocol_pipe.rs`                                   | Content-Length framing both ways, case-insensitive headers, `ProcessPipe` with reader thread; unit tests including split reads and a missing body                                                            |
| **U4 shell UI**      | `src/App.tsx`, `src/project/`, `src/components/` (except `api.ts`) | open-folder flow via the dialog plugin, lazy file tree, tab strip, status bar, empty state                                                                                                                   |
| **U5 editor**        | `src/editor/` except the props contract                            | CodeMirror 6 mount, dark theme, rust/cpp highlighting, controlled value, cursor line, no LSP                                                                                                                 |

The controller writes stubs for every file above first, so the tree compiles before any unit starts.
Units replace stub bodies; they do not edit `lib.rs`, `types.rs`, `api.ts`, `package.json`,
`Cargo.toml`, `biome.json`, or each other's files.

## Gates

Per unit: `cargo check` for Rust, `bun run check` for TypeScript/Biome. Controller re-runs both on the
merged tree, then `bun run build`, then commits.
