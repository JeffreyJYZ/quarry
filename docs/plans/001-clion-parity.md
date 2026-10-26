# quarry — CLion-parity IDE for Rust and C/C++

Status: original plan, dated. Implementation has moved well past it — the app now runs the daily loop end to end (see README.md §Status); this document is kept as the parity matrix, slices and estimates.

## 1. Target

quarry is an IDE for exactly two ecosystems — Rust and C/C++ — aiming at feature parity with CLion's
**daily loop**, not at CLion's feature count. It is not a general editor and not "a lightweight Zed".

The defended definition of parity is: open a project, navigate it, read errors, fix them, build, run a
test, launch the debugger, inspect memory. CLion's long tail — dozens of refactoring engines, profiler,
DFA, embedded and database tooling — is out of scope and listed in §8.

Why this is achievable: CLion's C/C++ insight engine is clangd, RustRover's is rust-analyzer, and their
debugger front end is a GDB/LLDB client. quarry reuses all three servers and writes the IDE around them.

## 2. Stack

| Layer         | Choice                                                       | Note                                                      |
| ------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| Shell         | Tauri 2                                                      | Rust process, native menus, small footprint               |
| UI            | React 19 + Vite 8 + TypeScript                               | `@/*` → `./src/*`                                         |
| Editor        | CodeMirror 6 + hand-written LSP client (`src-tauri/src/lsp`) | hides behind a 6-method adapter so Monaco stays swappable |
| C/C++ insight | `clangd`                                                     | `--background-index --clang-tidy --header-insertion=iwyu` |
| Rust insight  | `rust-analyzer`                                              | `checkOnSave` via `cargo check` (or `clippy`)             |
| Formatting    | `rustfmt`, `clang-format`                                    | on save, per-project style file                           |
| Debugging     | `lldb-dap` over raw DAP                                      | one client serves both languages                          |
| Memory        | custom hex view over DAP `readMemory`                        | paged mapped/unmapped                                     |
| Search        | `ripgrep` binary                                             | no libgit2 or index service early                         |
| Terminal      | `portable-pty`                                               | embedded shell                                            |
| VCS           | `git` CLI first                                              | `git2` only if a seam demands it                          |
| Lint (repo)   | Biome                                                        | tabs, indentWidth 4, lineWidth 100                        |
| Format (repo) | `bun fmt` (Bun's built-in)                                   | configured by `bunfig.toml` `[fmt]`                       |

All external toolchains are **detected, never bundled**. Detection probes `PATH` and falls back to
`xcrun --find` for the Apple-shipped tools.

## 3. Architecture

Two seams in Rust, three in the frontend. Everything else is a consumer of them.

Rust (`src-tauri/src/`):

| Module             | Owns                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `protocol_pipe.rs` | Content-Length JSON-RPC framing over stdio; shared by LSP and DAP                                   |
| `toolchain.rs`     | probe and report `clangd`, `rust-analyzer`, `rustfmt`, `clang-format`, `lldb-dap`, `cargo`, `cmake` |
| `project.rs`       | root, kind (cargo / cmake / compdb), targets, profiles, build command, debug program                |
| `lsp.rs`           | one server per project root, document sync, diagnostics stream                                      |
| `dap.rs`           | one session per launch, breakpoints, memory reads, disassembly                                      |
| `build_task.rs`    | build + diagnostics parse (named this way — `build.rs` is Cargo's build script)                     |
| `pty.rs`           | terminal sessions                                                                                   |
| `git.rs`           | status, blame, diff through the `git` binary                                                        |

Frontend (`src/`):

| Module     | Owns                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------- |
| `editor/`  | adapter: mount, setText, getText, applyEdits, setDiagnostics, decorate — Monaco-swappable |
| `doc/`     | open buffers, dirty state, save, format-on-save                                           |
| `session/` | one LSP and one DAP session per project root, lifecycle and reconnect                     |

Transport is full-document sync only. Incremental sync buys latency that the servers do not need at
project scale and costs a correct edit-to-range mapping; revisit only if the pipe measurably suffers.

Launch configuration lives at `.quarry/launch.json` in the project root:

```json
{
	"name": "unit tests",
	"program": "target/debug/app",
	"args": [],
	"cwd": ".",
	"build": "cargo build"
}
```

## 4. Parity matrix

| CLion capability                                                 | Where it comes from                                      | Cost |
| ---------------------------------------------------------------- | -------------------------------------------------------- | ---- |
| completion, diagnostics, hover, goto def/impl/type               | LSP                                                      | free |
| find references, rename, signature help, inlay hints, folding    | LSP                                                      | free |
| call and type hierarchy                                          | LSP                                                      | free |
| quick-fixes / clang-tidy fixes                                   | LSP`codeAction`                                          | free |
| inline errors without saving                                     | rust-analyzer `checkOnSave`, clangd diagnostics          | free |
| format on save, code style                                       | rustfmt / clang-format                                   | free |
| project-wide search                                              | `ripgrep`                                                | free |
| build system, target and profile picker                          | `cargo metadata`, CMake targets, `compile_commands.json` | work |
| run and debug configurations                                     | `.quarry/launch.json` + `Project`                        | work |
| debugger panel: breakpoints, frames, scopes, variables, evaluate | DAP                                                      | work |
| conditional and log breakpoints                                  | DAP                                                      | work |
| hardware watchpoints (data breakpoints)                          | DAP`supportsDataBreakpoints`                             | work |
| memory view, disassembly                                         | DAP`readMemory`, `disassemble`                           | work |
| Rust `Vec` / `String` / `Option` pretty printing                 | LLDB Rust plugin formatters                              | free |
| test runner UI                                                   | `cargo test --message-format=json`, gtest/ctest listing  | work |
| embedded terminal                                                | `portable-pty`                                           | work |
| git status, gutter, blame, diff                                  | `git` CLI                                                | work |

## 5. Slices

Estimates assume solo work on a familiar stack, full days.

| Slice  | Contents                                                                                                                                                                                   | Days |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| **P0** | shell, folder open, file tree, tabs, CodeMirror mount, project detect, `.quarry/launch.json`, layout persistence                                                                           | 3–4  |
| **P1** | `ProtocolPipe`, rust-analyzer + clangd attach, diagnostics in gutter and Problems, completion, hover, goto, references, rename, code actions, inlay hints, semantic tokens, call hierarchy | 7–9  |
| **P2** | build via cargo JSON and CMake/ninja, diagnostic parsing, target + Debug/Release picker, run configs, cargo test tree, gtest/ctest discovery, ripgrep search                               | 5–6  |
| **P3** | DAP client: launch/attach, conditional and log breakpoints, stepping granularity, frames, scopes, variables, evaluate, watch, data breakpoints                                             | 7–9  |
| **P4** | memory view with paged unmapped regions, typed reads, pointer follow, disassembly view, "view in memory" from a variable row                                                               | 5–7  |
| **P5** | embedded terminal, git status / gutter / blame / diff                                                                                                                                      | 3–4  |

Total for daily-loop parity: **30–36 working days**. First slice that behaves like an IDE is P0–P2,
about three weeks.

P4's representation follows Zed's `crates/project/src/debugger/memory.rs` — pages are either mapped or
unmapped, and unmapped pages allocate nothing. Read it for the pattern; Zed is GPL-3.0 and no code is
copied into this MIT repo.

## 6. Spike before P3 — done

Run and measured: [`dap.md`](../spikes/dap.md), reproducible with `bun run scripts/dap-spike.ts`.

- `readMemory`, `disassemble` and hardware data breakpoints all work against Xcode's `lldb-dap`
  (LLVM 21.0.0); `readMemory` returned exactly the planted bytes.
- Rust pretty printing is off by default: a `Vec<u8>` arrives as `{buf, len}`. One `initCommands`
  entry importing `<sysroot>/lib/rustlib/etc/lldb_lookup.py` fixes it (`size=8`, element children,
  `"quarry"`, `Some(1234)`). P4 needs a launch flag, not a visualizer shim.
- `supportsMemoryReferences: false` is an advertisement gap only — frames still carry
  `instructionPointerReference` and `disassemble` accepts it.
- Data breakpoints fire, but `hitBreakpointIds` is `null` and the stop lands on the line after the store,
  so stops are attributed by `description` and address.
- `evaluate` is unusable for Rust: lldb-dap falls back to Objective-C++ and errors. No watch-expression
  pane until a workaround is measured.
- `realpath` the project directory before `launch`, or DWARF path canonicalisation leaves every
  breakpoint unverified.

`cargo run` is not a debugger launch. Build first, then hand `lldb-dap` the binary path from cargo JSON.

## 7. Risks

- **Rust expression evaluation.** Measured broken in the spike; a debugger watch pane does not ship until
  an escape hatch is verified.
- **`cmake` and `ninja` are not installed on the development machine.** Plain `clang++` builds must be
  first-class; CMake integration ships behind a detection hint.
- **rust-analyzer `checkOnSave` cost.** Default to `check`; expose `clippy` as a setting.
- **Full-document sync on large files.** Acceptable at project scale; measure before changing.
- **Toolchain drift.** Server flags and capabilities are probed at attach, not hard-coded per version.

## 8. Non-goals

Profiler (CPU and DFA), long-tail refactorings beyond rename and LSP code actions, 2000+ intentions,
remote development, embedded targets, database tools, Docker integration, AI assistance, plugin API,
other languages. Adding a language means re-deriving §4 for that language, not flipping a flag.

## 9. Machine toolchain facts (development box)

| Tool                                                | Location                                        |
| --------------------------------------------------- | ----------------------------------------------- |
| `rust-analyzer`, `rustfmt`, `cargo`, `rustc` 1.99.0 | `/opt/homebrew/opt/rustup/bin`                  |
| `clangd`                                            | `/usr/bin/clangd` (also in the Xcode toolchain) |
| `lldb-dap`, `clang-format`                          | only via `xcrun --find`                         |
| `cmake`, `ninja`                                    | absent                                          |
| Apple clang                                         | 21.0.0                                          |

`toolchain.rs` must probe both `PATH` and `xcrun --find`; a GUI-launched app inherits launchd's `PATH`
and will not see the rustup shims.

## 10. Decisions

- Editor is CodeMirror 6, not Monaco: smaller, no worker story, and the LSP client is hand-written in
  `src-tauri/src/lsp` (no `@codemirror/lsp-client` dependency).
- One LSP and one DAP session per project root, no per-file servers.
- The debugger targets `lldb-dap` only; GDB support is not planned.
- Build module is `build_task.rs` to avoid colliding with Cargo's `build.rs`.
- License is MIT, deliberately distinct from Zed's GPL-3.0.
