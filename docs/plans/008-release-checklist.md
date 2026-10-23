# Release checklist

Checklist for cutting a quarry release. Run top to bottom; do not ship on any red item.

## 1. Pre-flight gates

Run from the repository root unless noted.
- `bun run gate` — runs `bun run verify` then `bun test`. Proves TypeScript types (`bun check`), Biome formatting and lint (`biome check .`), and the frontend unit tests (`bun test`) over `src/quickopen/rank.ts`, `src/run/splitArgs.ts`, `src/debug/memory/hex.ts` and `src/project/buffer.ts`.
- `bun run build` — runs `bun run typecheck` then `vite build`. Proves the frontend bundles cleanly to `dist/`.
- `cargo test` (run in `src-tauri/`) — proves the Rust unit tests, including the build-task and diagnostic parsing tests.
- `cargo check --all-targets` (run in `src-tauri/`) — proves the whole Rust crate compiles for every target, including tests and benches.
- `cargo clippy --all-targets -- -D warnings` (run in `src-tauri/`) — proves the Rust crate passes clippy with warnings denied. Clean on the current tree with no `#[allow(clippy::…)]` added.
- CI green on the commit being released, per `.github/workflows/ci.yml`.

Also run before committing: `cargo fmt --check` must be clean. Note `src-tauri/src/lsp.rs` is not rustfmt-clean, so format only the file being edited, for example `rustfmt --edition 2024 src/dap.rs`, rather than a crate-wide `cargo fmt`.

## 2. Smoke matrix

Run the scripts under `scripts/`. Each exercises real toolchains, not mocks.
- `bun run scripts/lsp-smoke.ts` — initialize handshake against a language server. Depends on `rust-analyzer` installed and on `PATH`.
- `bun run scripts/lsp-ux-smoke.ts` — navigation response shapes (hover, completion, definition, references). Verified against rust-analyzer 1.99.0.
- `bun run scripts/dap-spike.ts` — debugger capabilities, memory, breakpoints and formatters. Depends on `lldb-dap` reached through `xcrun`, and on the Rust pretty-printer `initCommands` loading `lldb_lookup.py`.
- `bun run scripts/dap-eval-probe.ts` — Rust evaluate attempts. Expected to report failures; that is its result, not a regression.
- `bun run scripts/cxx-smoke.ts` — clang diagnostic shape and the missing-cmake path. Depends on `clang` (via `xcrun`) and on `cmake`/`ninja` being absent on this machine, which exercises the missing-toolchain branch.

Environment facts that must hold: rust-analyzer component installed; `cmake` and `ninja` absent, so C/C++ builds fall back to the plain clang path in `src-tauri/src/build_task.rs`; `lldb-dap` and `clang-format` reachable only through `xcrun`.

## 3. Build and bundle

Verified command (measured): `bun run tauri build --bundles app`. The `beforeBuildCommand` in `src-tauri/tauri.conf.json` runs `bun run build` first, so the frontend is rebuilt into `dist/` before bundling. The `--bundles app` flag restricts the build to the macOS `.app` bundle and skips the `.dmg` (and other targets) to save time.

Measured facts from a real run:
- command: `bun run tauri build --bundles app`
- artefact: `src-tauri/target/release/bundle/macos/quarry.app`
- size: 5.42 MiB
- wall time: about 2.5 minutes (release Rust compile dominates, about 2m26s)

Product name: `quarry`. Bundle identifier: `land.jyz.quarry`. Bundle targets: `all` (`bundle.active` is true).

Artefacts land under `src-tauri/target/release/bundle/` (platform bundles such as the macOS `.app` and `.dmg`), with the release binary at `src-tauri/target/release/quarry`.

Launch smoke step (automated, run after the build):
`bun run verify:bundle` checks the version strings agree across `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, that `src-tauri/target/release/bundle/macos/quarry.app` exists with its size, the binary is executable, the code signature state via `codesign --verify --deep --strict` (reported, not fatal for an ad-hoc local build), and a bounded launch that must appear, stay alive and exit cleanly.
## 4. Version bumping

The version lives in three places and they must agree before release. Checked against the current tree (all agree at `0.1.0`):
- `package.json`: `"version": "0.1.0"`
- `src-tauri/Cargo.toml`: `version = "0.1.0"`
- `src-tauri/tauri.conf.json`: `"version": "0.1.0"`

Bump all three together. A mismatch between them leaves the bundle, the crate and the npm metadata disagreeing. Run `bun run verify:bundle` afterwards to confirm all three agree.

## 5. Known gaps to state in release notes

Quote only provable facts:
- Rust expression evaluation is unusable: `evaluate` returns nothing usable across `repl`/`watch`/`hover`, `settings set target.language rust` changes nothing, and `setExpression` kills the adapter. No watch-expression pane ships; only variables-tree watching and memory views.
- Remote development, embedded targets, profilers and a plugin API are absent (explicit non-goals).
- C/C++ builds need clang or cmake; when cmake is absent the fallback is a plain clang build, and cmake and ninja are not installed on this machine.
- The embedded terminal and the debugger were not exercised in a real desktop window by any automated test; the backend and components are present but window-level verification is manual.

## 6. Do not ship if

- Any pre-flight gate fails.
- Any smoke script fails (except the expected failures of `dap-eval-probe.ts`).
- `cargo fmt --check` is dirty.
- The working tree is uncommitted.
- `bun run verify:bundle` reports FAIL.
