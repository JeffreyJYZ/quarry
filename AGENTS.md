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
- **Gates: `bun check` for types, `bun lint` + `bun fmt` for Biome, `bun run verify` before a commit** — tabs, indentWidth 4, lineWidth 100; warnings fail, so leave zero.
- **Biome stays the formatter even though Bun ships `bun fmt`** — `bun fmt` ignores `biome.json` and rewrites to two spaces, and `biome check` verifies formatting without writing while `bun fmt` writes.
- **No `typescript` dependency**: `bun check` is the type checker and `vite build` transpiles; verified by removing the package and passing both (2026-10-22).
- **`bun` only** — never npm; `bun run build` keeps `run` (built-in subcommand).
- **Full-document LSP sync only**; revisit only on a measured stall.
- **One LSP and one DAP session per project root.**
- **Never publish a crate named `quarry`** — use `quarry-app`, `quarry-lsp`, `quarry-dap`; frontend `@jyz/quarry-*`.
- **MIT.** Zed is GPL-3.0: read its debugger code for patterns, copy nothing.
- **`.gitignore` carries `.DS_Store`** at the top level.
- **`lldb-dap` is Xcode's LLVM 21.0.0**; `readMemory`, `disassemble` and data breakpoints work — measured in `docs/spikes/dap.md`.
- **Rust pretty printing needs `initCommands: ["command script import <sysroot>/lib/rustlib/etc/lldb_lookup.py"]`** — without it `Vec`/`String` arrive as raw structs, silently.
- **Never gate memory or disassembly on `supportsMemoryReferences`** — it is false while frames carry `instructionPointerReference` and both requests work.
- **`evaluate` is broken for Rust** (falls back to Objective-C++, errors) — no watch-expression pane until a workaround is measured.
- **Data breakpoint `dataId` is `<hex>/<size>` with no `0x`**, `hitBreakpointIds` is null, and the stop reports the line after the store.
- **`realpath` the project directory before `launch`** — `/var/…` versus `/private/var/…` leaves every breakpoint unverified.
- **`cargo fmt` in `src-tauri` rewrites `lsp.rs`** — that file is not rustfmt-clean, so a crate-wide format adds an out-of-unit diff. Format the one file instead: `rustfmt --edition 2024 src/dap.rs`.
