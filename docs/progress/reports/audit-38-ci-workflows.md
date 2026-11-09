# Audit 38 — CI workflows

Scope: `.github/workflows/ci.yml`, `.github/workflows/release.yml`. Compared against `scripts/gate.ts` (the local gate).

## Ranked findings

### P1 — Release builds never run the gate or CI; tag pushes bypass CI entirely

- `.github/workflows/ci.yml:3-7` triggers only on `push: branches: [main]` and `pull_request`. A `quarry-alpha*`/`v*` tag push (`.github/workflows/release.yml:14-18`) does not run CI, and `release.yml`'s `build` job (line 61) runs `bun install` then `tauri-action` with no typecheck, format, lint, tests, cargo check/test/clippy. So a red tree can ship if it reaches a tag.
- Fix: add `push: tags` to CI triggers, or make `release.yml` run `bun run gate` before build; gate is already self-contained.

### P1 — `unstyled-classes.ts` runs locally as part of UI work but is absent from CI and from `gate.ts`

- `scripts/gate.ts:22-43` lists 9 steps; `bun run scripts/unstyled-classes.ts` (AGENTS: "UI work adds … count must be 0") is not among them. `scripts/unstyled-classes.ts` exists. So a class dropped during a restructure is never caught in CI.
- Fix: add `{ name: "unstyled classes", command: "bun", args: ["scripts/unstyled-classes.ts"] }` to `STEPS` in `scripts/gate.ts`.

### P2 — `tauri-apps/tauri-action@v0` is on a stale major

- `.github/workflows/release.yml:150` pins `tauri-apps/tauri-action@v0`. Pinning a floating `@v0` tag is not reproducible.
- Fix: pin a concrete version instead of the floating `@v0`.

### P2 — `node -p` in the release version step assumes Node on the runner

- `.github/workflows/release.yml:122` uses `node -p "require('./src-tauri/tauri.conf.json').version"` while only `oven-sh/setup-bun@v2` is installed (line 100). GitHub-hosted runners ship Node, so it passes today, but it is an undeclared dependency.
- Fix: replace with a bun invocation reading the same file.

### P3 — Release `build` job does not cache the Rust toolchain's targets beyond `rust-cache`

- `.github/workflows/release.yml:102-110` sets up rust with `targets: ${{ matrix.rustTargets }}` and caches via `swatinem/rust-cache@v2`. Minor; not a correctness issue.
- No change required.

## Checked, no issue

- YAML validity: both workflow files parse with Ruby's YAML, no invalid-trigger failure.
- CI gate parity: `ci.yml:39-40` runs `bun run gate`, which is exactly `scripts/gate.ts` (9 steps: file size, types, docs-deps, format, lint, frontend tests, cargo fmt/check/test/clippy). CI then runs `bun run build` (line 42-43). Local `bun run gate` matches CI's gate step one-to-one.
- Rust toolchain caching: `Swatinem/rust-cache@v2` in ci (`ci.yml:27`) and `swatinem/rust-cache@v2` in release (`release.yml:108`), both keyed to `src-tauri`.
- Platform guards: Linux deps step is `if: matrix.platform == 'ubuntu-22.04'` (`release.yml:94`); macOS-only universal target set via matrix args. No unguarded platform-specific command found.
- Release triggers: only `quarry-beta*` and `v*` tags plus `workflow_dispatch` (`release.yml:4-18`), matching documented tags.
- Action majors: `actions/checkout@v4`, `oven-sh/setup-bun@v2`, `dtolnay/rust-toolchain@stable` are current; only `tauri-action@v0` is stale (above).
- Smoke scripts (`scripts/*-smoke.ts`) are intentionally omitted from CI per `ci.yml:37-38` (need rust-analyzer/lldb-dap). Documented, not a gap.
