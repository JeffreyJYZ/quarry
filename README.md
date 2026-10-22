# quarry

A focused IDE for **Rust and C/C++ only**, built to match CLion on the loop you actually run every day:
open a project, navigate it, read the errors, fix them, build, run a test, start the debugger, look at
memory.

It does not try to be a general editor. It does not try to match CLion's feature count. The three
things a CLion user would miss if they moved — clangd-grade C/C++ insight, rust-analyzer-grade Rust
insight, and an LLDB debugger with variables, watchpoints, disassembly and a hex memory view — are
exactly what this is built around. Those engines already exist; quarry is the IDE around them.

Scaffold state: the shell runs and shows an empty dark workspace. No project model, language server or
debugger code yet — see the plan.

## What "parity" means here

Parity is defined as the daily loop, not the menu tree:

| In scope                                                               | Out of scope                                 |
| ---------------------------------------------------------------------- | -------------------------------------------- |
| completion, diagnostics, hover, goto, references, rename, code actions | long-tail refactorings and intentions        |
| build targets, profiles, run and debug configurations                  | CPU and memory profilers (DFA)               |
| breakpoints (conditional, log, data), frames, scopes, evaluate, watch  | remote development, embedded targets         |
| memory view with paged unmapped regions, disassembly                   | databases, Docker, AI assistance, plugin API |
| tests, project-wide search, terminal, git                              | any language other than Rust and C/C++       |

The full matrix, module seams, slices and estimates are in
[`docs/plans/001-clion-parity.md`](docs/plans/001-clion-parity.md).

## Stack

| Layer      | Choice                                                                        |
| ---------- | ----------------------------------------------------------------------------- |
| Shell      | Tauri 2                                                                       |
| UI         | React 19, Vite 8, TypeScript, Biome                                           |
| Editor     | CodeMirror 6 with `@codemirror/lsp-client` (behind a swappable adapter)       |
| Insight    | `clangd`, `rust-analyzer` — detected on `PATH` and via `xcrun`, never bundled |
| Debugger   | `lldb-dap` over raw DAP, one client for both languages                        |
| Formatting | `rustfmt`, `clang-format`                                                     |

## Commands

```sh
bun install
bun run tauri dev     # desktop app
bun run dev           # browser-only UI
bun run check         # tsc --noEmit + biome check
bun run fmt           # biome check --write
```

## License

MIT, see [`LICENSE`](LICENSE). Zed, which has a comparable debugger memory view, is GPL-3.0 and no code
is copied from it.
