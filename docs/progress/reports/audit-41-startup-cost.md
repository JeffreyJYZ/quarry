# Startup path audit

Ranked findings. Each cites real file:line.

## P1 — LSP start waits on a recursive filesystem scan

`src/lib/lsp/rootSignals.ts:72-93` (`useRootSignals`) returns `null` until `probeRootSignals` resolves. `src/ui/app/useLspWiring.ts:26-34` passes those signals into `useLspServers`, so no language server starts until the scan finishes. The scan walks up to `MAX_DEPTH 4` / `MAX_DIRS 64` directories (`rootSignals.ts:7-8`, `scanForCpp` lines 95-121), issuing one `listDir` IPC per directory in series-ish batches. On a large tree the first frame paints with no diagnostics/completion and the status chip stays empty until the scan returns.

Perceived: editor appears, but LSP features are dead for the duration of the scan; on a big repo this can be seconds.

Fix: start LSP servers with a default/empty signal set and let `probeRootSignals` update them, or run the scan off the critical path and re-evaluate when it resolves. Cache already exists (`rootSignals.ts:25`); warm it on project open rather than on first LSP wiring.

## P1 — Session restore reads every open file serially

`src/ui/app/useSessionPersistence.ts:65-92`: after `openProject`, it loops `for (const path of settings.openFiles)` and `await readTextFile(path)` one at a time (line 76). A session with many tabs restores them sequentially; `restoredRef` only flips true in `finally` (line 109), so anything gated on restore waits for the slowest file.

Perceived: window opens, then tabs populate one by one; a single large file stalls the rest.

Fix: `Promise.all` over `settings.openFiles` (or at least batched), with per-file try/catch preserved. Alternatively defer non-active buffers until after first paint.

## P2 — Toolchain probe shells out serially on mount

`src/ui/app/useSettings.ts:38-51` calls `toolchains()` on mount unconditionally. `src-tauri/src/toolchain.rs:23-27` maps `TOOLS` (8 entries) through `probe` serially; `probe` -> `resolve::resolve` -> `via_xcrun` spawns `xcrun --find` per missing tool (`resolve/source.rs:114-126`). Up to 8 subprocesses in series before the status bar reports tool availability.

Perceived: "missing toolchains" indicator stays stale for the probe duration; usually sub-second but measurable on cold caches.

Fix: parallelize in Rust (thread per tool, or `std::thread::scope`), or at least short-circuit xcrun calls for tools already on PATH. Not a first-frame blocker but cheap to fix.

## P2 — `scanForCpp` budget is shared by reference across siblings

`rootSignals.ts:117-119` passes the same `budget` object into parallel child scans, so `budget.count` races between concurrent branches and `MAX_DIRS` is not enforced deterministically. Not a startup blocker, but can let the scan run longer than intended on wide trees.

Fix: give each branch its own counter or make the budget atomic; minor.

## Checked, no issue

- `src/ui/editor/LazyEditor.tsx:4` lazy-loads the CodeMirror editor chunk; initial bundle does not pull language packages.
- `src/ui/styles.css` is 51 lines; not a large initial stylesheet.
- Session restore sets `cancelled` flags and cleans up (`useSessionPersistence.ts:49,112-114`), so an unmount mid-restore does not crash.
- `toolchains()` failure is swallowed (`useSettings.ts:44-46`), so a probe error does not block the UI.
- Rust `open_project` (`project/cargo_manifest.rs:48-51`) only canonicalizes + walks ancestors; no subprocess, no build. Fast.
- `rootSignals` caches by root (`rootSignals.ts:25`), so repeat opens are instant.

## What the user perceives, in order

1. Window + React mount, editor chunk lazy-loaded: first frame shows chrome with empty editor (fast).
2. `useSessionPersistence` effect starts: settings read, then (if `lastRoot`) `openProject` + serial file reads; tabs appear as files load.
3. `useSettings` effect fires `toolchains()`: status bar tool list fills after up to 8 probes.
4. LSP wiring waits for `rootSignals` scan: completion/diagnostics appear last.
5. No automatic update check on launch; updates are manual via menu (`shellCommands.ts:180`), so no network cost at startup.
