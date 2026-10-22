# quarry

Rust and C/C++ IDE. Tauri 2 + React 19 shell; clangd, rust-analyzer and lldb-dap do the real work.
- **Scope: Rust + C/C++ only**, CLion parity on the daily loop. Never a general editor.
- **Plan is `docs/plans/001-clion-parity.md`** — parity matrix, slices, estimates, non-goals; read before feature work.
- **Non-goals stay non-goals**: profiler, remote, embedded, DB, Docker, AI, plugin API, other languages.
- **Toolchains are detected, never bundled** — probe `PATH` then `xcrun --find`; GUI launch carries launchd's PATH.
- **Machine paths**: rustup shims `/opt/homebrew/opt/rustup/bin`; `lldb-dap` and `clang-format` only via `xcrun`; `cmake`/`ninja` absent.
- **No `cargo run` as a debug launch** — build first, pass `lldb-dap` the binary from cargo JSON.
- **Rust module is `build_task.rs`**, never `build.rs` (Cargo's build script).
- **`src/` only**, `@/*` maps to `./src/*`; no root-level `lib/`.
- **Biome is the gate**: tabs, indentWidth 4, lineWidth 100; `bun run check` before a commit.
- **`bun` only** — never npm; `bun run build` keeps `run` (built-in subcommand).
- **Full-document LSP sync only**; revisit only on a measured stall.
- **One LSP and one DAP session per project root.**
- **Never publish a crate named `quarry`** — use `quarry-app`, `quarry-lsp`, `quarry-dap`; frontend `@jyz/quarry-*`.
- **MIT.** Zed is GPL-3.0: read its debugger code for patterns, copy nothing.
- **`.gitignore` carries `.DS_Store`** at the top level.
