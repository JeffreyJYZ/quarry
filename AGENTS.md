# quarry

Rust and C/C++ IDE. Tauri 2 + React 19 shell; clangd, rust-analyzer and lldb-dap do the real work.

- **Scope: Rust + C/C++ only**, CLion parity on the daily loop. Never a general editor.
- **CLion is the reference for both UI and features** — reverse-engineer it with the `rea` MCP tools when the target behaviour is unclear, instead of guessing; screenshots live in the gitignored `docs/reference/`.
- **Plan is `docs/plans/001-clion-parity.md`** — parity matrix, slices, estimates, non-goals; read before feature work.
- **Non-goals stay non-goals**: profiler, remote, embedded, DB, Docker, AI, plugin API, other languages.
- **Toolchains are detected, never bundled** — probe `PATH` then `xcrun --find`; GUI launch carries launchd's PATH.
- **Machine paths**: rustup shims `/opt/homebrew/opt/rustup/bin`; `lldb-dap` and `clang-format` only via `xcrun`; `cmake`/`ninja` absent.
- **No `cargo run` as a debug launch** — build first, pass `lldb-dap` the binary from cargo JSON.
- **Rust module is `build_task.rs`**, never `build.rs` (Cargo's build script).
- **`src/` only**, `@/*` maps to `./src/*`; no root-level `lib/`.
- **Gates: `bun check` for types, `bun fmt --check` for formatting, `biome lint` for lint, `bun test` for frontend units, `bun run gate` before a commit** — hard tabs 4 wide, print width 100; warnings fail, so leave zero.
- **C/C++ formatting always expands every brace pair** — `clang-format` gets the nearest `.clang-format` plus `AllowShort*: Never|None|false`, so a one-line body never survives a format.
- **`bun fmt` is the formatter, configured in `bunfig.toml` `[fmt]` (`useTabs`, `tabWidth = 4`, `printWidth = 100`)** — Biome no longer formats; it lints only, so `biome check` would flag tab/width drift the formatter owns.
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
- **A dispatched unit's report is a claim, not evidence**: check the call site exists, not just the helper — one shipped an unused `resolveDebugArtifact` and an unwired panel, another left its `lib.rs` registration out, which fails only at runtime.
- **Updater signing key: private `~/.tauri/quarry-updater.key` (no password), public key in `src-tauri/tauri.conf.json` `plugins.updater.pubkey`** — never print or commit the private one, never rotate it once a release ships, or every installed app orphans.
- **A local `bun run tauri build` needs `TAURI_SIGNING_PRIVATE_KEY` set** (the key path or content) because `bundle.createUpdaterArtifacts` is on; without it the bundler refuses to produce updater artefacts.
- **Alphas publish from this Mac with `bun run release:local`** — signed macOS bundle, `latest.json`, release, then a check that the public manifest serves it.
- **CI builds all three platforms only for `quarry-beta*` and `v*` tags**, or a manual dispatch; `scripts/bump-version.ts` keeps the three version files in step.
- **The workflow builds Windows, so Rust must compile there**: gate every `std::os::unix`, `PermissionsExt` and `from_mode` behind `#[cfg(unix)]`; a macOS-only build hides it until CI.
- **Linux bundles AppImage and Windows nsis only** — the deb and msi bundlers reject the hyphen in `X.Y.Z-alpha.N` (`invalid version`), AppImage and nsis accept it.
- **Main agent may push alpha tags and publish test releases here; subagents never push, tag or release.** Tag `quarry-alphaN` pairs with version `X.Y.Z-alpha.N` (`bun scripts/bump-version.ts alpha`), and a stable tag is `v<version>`.
- **Verification ladder: `bun run gate` and `bun run build`; Rust adds `cargo test`, `cargo check --all-targets`, `cargo clippy --all-targets -- -D warnings`**; LSP work adds `scripts/lsp-*.ts`, debugger work `scripts/dap-*.ts`. The DAP evaluate probe is expected to fail.
