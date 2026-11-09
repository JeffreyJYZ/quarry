# Startup instrumentation audit

No measurement exists today, so startup slowness is unarguable. Proposal plus cost assessment from reading the code.

## What to measure

1. Process start → first paint (Rust `run()` entry in `src-tauri/src/lib.rs:33` to React `ReactDOM.createRoot` in `src/ui/main.tsx:6`).
2. Settings read (`useSettings` mount, `src/ui/app/useSettings.ts:38-51`; Rust `settings::read_settings`).
3. Project open (`useWorkspace.openRoot` → `openProject`, `src/ui/app/useWorkspace.ts:55-77`).
4. Session restore (`useSessionPersistence`, serial `readTextFile` loop).
5. Toolchain probe (`toolchains()`, `src-tauri/src/toolchain.rs:23-27`, 8 subprocesses).
6. Root signals scan (`rootSignals.ts` → `useLspWiring`, blocks LSP start).
7. LSP start (`useLspServers` after signals resolve).

## Where a timestamp is cheap

- Rust: `std::time::Instant::now()` at `lib.rs:33` run() entry; store in `tauri::State` or emit via `println!` in debug builds. Cheap, no deps.
- Frontend: `performance.now()` at `main.tsx:6` before createRoot, and `performance.mark`/`measure` at each milestone. Zero cost, browser-native.
- Cross-boundary: a single `startup_metrics` Tauri command returning a struct; frontend stamps its own marks and the Rust stamp comes back with first invoke.

## Surface without telemetry service

- Dev-only: `console.table` of marks in dev builds (`import.meta.env.DEV`), plus a `?startup=1` query flag printing to console.
- A hidden "Diagnostics" panel or status-bar tooltip listing last startup breakdown; persisted to `localStorage` so a slow launch is capturable.
- Optional: write `~/Library/Logs/quarry/startup.json` from Rust on exit; no network, no service.

## Likely dominant cost (from code)

- Root signals scan (P1 in audit-41) blocks all LSP start; serial directory IPC, up to 64 dirs.
- Session restore serial file reads (P1); a large file stalls the rest.
- Toolchain probe up to 8 `xcrun` subprocesses in series (P2).
- Rust process start + webview load likely sub-100ms and not the bottleneck.

## Smallest useful change

1. Add `performance.mark("quarry:start")` in `src/ui/main.tsx` before createRoot and `performance.mark("quarry:first-paint")` after first render; log `performance.measure` in dev.
2. Stamp `Instant` in `lib.rs:33` and expose via a `startup_stamp` command returning elapsed ms; call once on mount.
3. Persist a JSON breakdown (marks + toolchain duration) to localStorage and print it in dev console; no telemetry service.
4. Gate further optimization on the measured numbers rather than guesses.

## What I cleared

- No existing instrumentation anywhere in src (grep found none).
- No network/telemetry calls at startup (`audit-41` confirmed no update check on launch).
- Rust `open_project` is fast (canonicalize + ancestor walk only).
