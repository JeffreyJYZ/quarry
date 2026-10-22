# quarry

An IDE for Rust and C/C++ — built to match CLion on the daily loop, and nothing else.

Scaffold state: the shell (Tauri 2 + React 19 + Vite + TypeScript + Biome) is in place and shows an
empty dark workspace. No project model, language server or debugger code yet.

## Stack

- **Shell** — Tauri 2
- **UI** — React 19, Vite 8, TypeScript, Biome
- **Editor** — planned: CodeMirror 6 with `@codemirror/lsp-client`
- **Insight** — planned: `clangd` and `rust-analyzer`, detected, never bundled
- **Debugger** — planned: `lldb-dap` over raw DAP, including a hex memory view

## Commands

```sh
bun install
bun run tauri dev     # desktop app
bun run dev           # browser-only UI
bun run check         # tsc --noEmit + biome check
bun run fmt           # biome check --write
```

## Plan

[`docs/plans/001-clion-parity.md`](docs/plans/001-clion-parity.md) — parity matrix, architecture seams,
slices P0–P5 with estimates, the DAP spike, and the non-goals that keep "parity" honest.

## License

MIT, see [`LICENSE`](LICENSE).
