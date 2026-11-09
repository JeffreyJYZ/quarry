# Rust test quality audit (audit2-26)

Scope: every `tests*.rs` module under `src-tauri/src` (56 files, ~7k lines).

Searches run (`rg` over `src-tauri/src`):

- `assert!(true` / `assert_eq!(true, true)` — none.
- `#[ignore]` on any test — none.
- early-return on the interesting branch (`if ... { return` / bare `return;` in test bodies) — only 3 `return;` occurrences, none gating a branch.
- stripped-boilerplate tautology grep (`assert_eq!(x, x)`) — none.
- error-string assertions (`contains`/`starts_with` on an `Err`) — present but each sits beside a behavioural check in the same test (e.g. `src-tauri/src/git/tests_2.rs:16-26` pairs the message with a char-count bound; `src-tauri/src/new_project/tests_2.rs` pairs `"not available"` with the edition list).

Result: no test in the audited set can pass trivially. Every inspected module carries assertions against computed output, file bytes, JSON shape, or both branches of a match. Fixtures observed (e.g. the porcelain v2 stream in `src-tauri/src/git/tests_1.rs:29-39`, JSON payloads in `src-tauri/src/dap/tests_*.rs`) mirror the shapes the parsers/serializers actually emit; nothing contradicts `mod.rs`/handler code that I read.

Cleared: `assert!(true)`, ignored tests, tautological self-assertions, branch-skipping early returns. Note: a fixture/shape-vs-production mismatch could not be ruled out exhaustively without running the gate (forbidden here); static comparison of a sample (git, dap, launch, settings, format) found no mismatch.
