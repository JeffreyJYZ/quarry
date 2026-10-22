# quarry

A focused IDE for **Rust and C/C++ only**, built to match CLion on the loop you actually run every day:
open a project, navigate it, read the errors, fix them, build, run a test, start the debugger, look at
memory.

It does not try to be a general editor. It does not try to match CLion's feature count. The three
things a CLion user would miss if they moved — clangd-grade C/C++ insight, rust-analyzer-grade Rust
insight, and an LLDB debugger with variables, watchpoints, disassembly and a hex memory view — are
exactly what this is built around. Those engines already exist; quarry is the IDE around them.

## Status

Most of the daily loop runs end to end for a Cargo project. This is what the app actually does today,
read off `src-tauri/src/lib.rs` and `src/`:
- **Project and shell**: open a folder, detect `cargo` / `CMakeLists.txt` / `compile_commands.json`,
  report which toolchains were found on `PATH` or via `xcrun`, browse a lazily expanded file tree, open
  files in tabs, save, restore the last project and open tabs on startup.
- **Editing**: CodeMirror 6 with Rust and C/C++ highlighting, a breakpoint gutter, diagnostics drawn
  as squiggles plus gutter markers, format on save through `rustfmt` or `clang-format` (with a warning
  when the formatter is unavailable or fails), and format on demand. Shortcuts: `Cmd+S` save,
  `Cmd+Alt+S` save all, `Cmd+Alt+L` format, `Cmd+F` in-file search, `Cmd+Alt+F` project search,
  `F12` / `Shift+F12` / `Cmd+Click` for definition and references, `Cmd+K` for the shortcut sheet.
- **Insight**: one language server per project root — `rust-analyzer` for Cargo, `clangd` for CMake or
  `compile_commands.json` — with full-document sync. Diagnostics stream into the editor and the Problems
  dock, grouped by file with severity, line and message. Hover, go-to-definition, references and
  completion commands are wired; hover, completion (CompletionList with real labels), definition (LocationLink[]) and references (24) are verified against rust-analyzer 1.99.0 via `bun run scripts/lsp-ux-smoke.ts`.
- **Build**: `build_project` runs `cargo build --message-format=json` and merges its machine-readable
  diagnostics into the Problems dock.
- **Run**: `run_program` / `stop_program` stream `run://output` lines and one `run://exited`. Backend
  and event contract only; no run panel in the UI yet.
- **Debug**: `lldb-dap` sessions launched from a `.quarry/launch.json` preset, composed for an
  unconfigured Cargo project (which also passes the Rust formatter `initCommands`), or attached to a
  running process by pid. Line breakpoints with verified and pending states, conditional and hit-count
  breakpoints, threads, frames, scopes, variables, hardware watchpoints, a paged hex memory pane and a
  disassembly pane.
- **Search**: `rg`-backed palette with results grouped by file, keyboard navigation, and a visible cap
  when the result set is truncated.
- **Tests**: `list_tests` and `run_test` feed a Tests dock with pass/fail status.
- **Source control**: a Git view with status, per-file diff, and an open-in-editor flow, plus
  `git_status` and `git_file_diff` commands.

Still missing, and named here so it is not mistaken for done:
- **No embedded terminal.**
- **No `evaluate`, so no watch expressions** — Rust expression evaluation cannot be made to work through
  `lldb-dap` here: `evaluate` returns nothing usable across `repl`/`watch`/`hover`, `settings set target.language rust`
  changes nothing, and `setExpression` kills the adapter. A watch pane can only offer variables-tree watching and
  memory views until a different adapter or toolchain is measured (see `docs/spikes/dap.md`, "Evaluate probe
  (2026-10-22)").
- **C/C++ builds are not wired.** `build_project` refuses any project kind other than Cargo, and the
  no-preset launch composition is Cargo-only. A preset that names an already-built binary is the C/C++
  debug path. C/C++ builds also need `cmake`, which is not installed on this machine.
- **No remote development, embedded targets, profilers, databases, Docker, AI assistance or plugin API.**

## What "parity" means here

Parity is defined as the daily loop, not the menu tree:

| In scope                                                               | Out of scope                                 |
| ---------------------------------------------------------------------- | -------------------------------------------- |
| completion, diagnostics, hover, goto, references, rename, code actions | long-tail refactorings and intentions        |
| build targets, profiles, run and debug configurations                  | CPU and memory profilers (DFA)               |
| breakpoints (conditional, log, data), frames, scopes, evaluate, watch  | remote development, embedded targets         |
| memory view with paged unmapped regions, disassembly                   | databases, Docker, AI assistance, plugin API |
| tests, project-wide search, terminal, git                              | any language other than Rust and C/C++       |

That table is the target, not the current state; the Status section above is the current state. The full
matrix, module seams, slices and estimates are in
[`docs/plans/001-clion-parity.md`](docs/plans/001-clion-parity.md), and the slice documents are indexed
in [`docs/plans/README.md`](docs/plans/README.md).

## Stack

| Layer      | Choice                                                                        |
| ---------- | ----------------------------------------------------------------------------- |
| Shell      | Tauri 2                                                                       |
| UI         | React 19, Vite 8, TypeScript, Biome                                           |
| Editor     | CodeMirror 6, with a hand-written LSP client over the shared framed pipe      |
| Insight    | `clangd`, `rust-analyzer` — detected on `PATH` and via `xcrun`, never bundled |
| Debugger   | `lldb-dap` over raw DAP, one client for both languages                        |
| Formatting | `rustfmt`, `clang-format`                                                     |
| Build      | `cargo build --message-format=json`                                           |
| Search     | the `rg` binary                                                               |

## Commands

```sh
bun install
bun run tauri dev     # desktop app
bun run dev           # browser-only UI
bun check             # type check (bun builtin, all cores)
bun fmt               # biome format --write .
bun lint              # biome lint --write .
bun run verify        # type check + biome check, the commit gate
bun run build         # type check + vite build
```

Rust tests run from the Tauri crate: `cd src-tauri && cargo test`.

## Smoke scripts

- `scripts/lsp-smoke.ts` — initialize handshake against a language server.
- `scripts/lsp-ux-smoke.ts` — navigation response shapes (hover, completion, definition, references).
- `scripts/dap-spike.ts` — debugger capabilities, memory, breakpoints and formatters.
- `scripts/dap-eval-probe.ts` — Rust evaluate attempts.
- `scripts/cxx-smoke.ts` — clang diagnostic shape and the missing-cmake path.

## License

MIT, see [`LICENSE`](LICENSE). Zed, which has a comparable debugger memory view, is GPL-3.0 and no code
is copied from it.
