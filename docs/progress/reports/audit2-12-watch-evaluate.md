# Audit 2.12 — debugger watch/evaluate story

Area: debugger watch/evaluate. Spike source: `docs/spikes/evaluate.md`.

## What ships today

- Evaluate field: `src/ui/debug/dock/EvaluateField.tsx` + `src/lib/debug/useEvaluate.ts`, rendered at `src/ui/debug/dock/DebugDockBody.tsx:102`. One free-text expression, Enter evaluates in the selected frame, Escape clears, answer beside field, error in danger colour.
- Watch points: `src/ui/debug/WatchSections.tsx` renders pinned variables and data-breakpoint watch points.
- Hover tooltip in editor (`src/ui/editor/extensionsBehaviour.ts:163`) uses LSP `hover`, not `dapEvaluate`. No evaluate-on-hover anywhere.
- Memory pane and disassembly resolve expressions through `src/lib/debug/memory/resolve.ts` via `dapEvaluate`.

## Findings

### P1 — Stale "evaluate unavailable for Rust" strings in shipped UI

- `src/ui/debug/WatchSections.tsx:44` — "Expression evaluation is unavailable for Rust, so only pinned in-scope variables can be watched."
- `src/ui/debug/WatchSections.tsx:80` — "Evaluate is unavailable for Rust, so no watch expressions."
- Why: contradicts `docs/spikes/evaluate.md` (Rust `n`, `n + 1`, `s` evaluate in `watch` context with a `frameId`) and the shipped `EvaluateField`. Misleads users into thinking evaluate is Rust-disabled.
- Fix: remove both notes or reword to describe actual limits (no closures/`&mut`/side effects measured).

### P1 — Docs still claim evaluate broken for Rust

- `AGENTS.md:55` — "evaluate is broken for Rust (falls back to Objective-C++, errors)".
- `AGENTS.md:82` — "The DAP evaluate probe is expected to fail."
- `website/content/docs/language-servers.mdx:65` — "`evaluate` is still broken for Rust through `lldb-dap`".
- `docs/plans/002-run-debug-one-click.md:145` — "`evaluate` watch pane (measured broken for Rust)."
- Why: contradicts shipped behaviour and spike; README already moved it to "works within measured limits".
- Fix: update these four to match README/spike; note `docs/spikes/dap.md` superseded section.

### P2 — README lists a working feature under "Still missing"

- `README.md:148-155` — "Expression evaluation works, within measured limits" sits under "Still missing, and named here so it is not mistaken for done".
- Why: audit-34 flagged; it is a working feature, not missing.
- Fix: move into the working list or delete the entry.

### P3 — Failure text does not explain the frameId cause

- `src/ui/debug/dock/EvaluateField.tsx:50` renders `describeError(reason)` verbatim. Adapter message for a missing frame is "can't evaluate expressions when the process is running." (`docs/spikes/evaluate.md:40`).
- Why: user sees a misleading "process is running" message if evaluate is somehow called without a frame; field is disabled until a frame exists (`EvaluateField.tsx:22`, `live`), so this path is rare, but the message names the symptom not the cause (no frameId).
- Fix: optional — append "(needs a stopped frame)" or guard; low priority since normal use never triggers it.

## frameId workaround usage

Both evaluate call sites pass `frameId`:

- `src/lib/debug/useEvaluate.ts:44` → `dapEvaluate(session, text, frameId)` where `frameId = view.frameId ?? view.frames[0]?.id` (`EvaluateField.tsx:21`).
- `src/lib/debug/memory/resolve.ts:35` → `dapEvaluate(options.session, trimmed, options.frameId)`; callers (`DisasmPane.tsx:108`, `MemoryPane.tsx:112`) forward their `frameId` prop.

No call site omits `frameId`. The documented workaround is used everywhere. `context` is never passed from the UI, so the backend default `"watch"` (`src-tauri/src/dap/dap_evaluate.rs:32`) applies — matching the spike's measured best context.

## Cleared

- No evaluate-on-hover exists; hover tooltip is LSP-based, so no second evaluate path to audit.
- `dapEvaluate` signature requires `frameId: number | null` as third positional; callers cannot accidentally drop it without a type error.
- Rust backend validates context against the five documented values (`dap_evaluate.rs:26-27`, `evaluate_context`).
- No watch-expression pane beyond the single Evaluate field; nothing else claims to evaluate expressions.
