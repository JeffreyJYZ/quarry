# Audit 37 — weak tests

Scope: `src/**/*.test.ts` + `src-tauri/src/**/tests*.rs`. Read-only audit; no code changed.

## Findings

- P3 — `src/lib/debug/presets.test.ts:136-143` (`validatePresets`) — assertions only check `not.toBeNull()` / `toBeNull()`, never the error message or which entry failed. A validator that always returns a non-null sentinel passes. Fix: assert the returned error names the offending index/field.
- P3 — `src/lib/updates/capabilities.test.ts:31` — `called.length === REQUIRED.length` guards renaming, but `REQUIRED` is hand-maintained alongside the store; a store that drops `update.download()` entirely still passes because `called` shrinks and the filter still matches the (empty) subset. Fix: also assert `store` contains both call sites via a direct `expect(store).toMatch(/update\.download\(/)`.
- P3 — Rust `src-tauri/src/git/tests_2.rs:55-67` — `is_ok()`/`is_err()` only, no payload/value check; a function returning `Ok(())` for every input passes. Fix: assert on the validated value/message.
- P3 — `src/lib/themes/themes.test.ts:49` — `for (const token of THEME_TOKENS) expect(isHexColor(theme.tokens[token])).toBe(true)`; a theme missing a token would throw before asserting, masking the gap as an error not a failure. Fix: assert `theme.tokens[token]` is defined first, then hex.

## Checked, no issue

- No `.skip`/`.todo`/`xit`/`xdescribe`/`#[ignore]`/`should_panic` found in either tree.
- No `expect(true)` / mock-`toHaveBeenCalled` patterns in TS tests (no mocks used at all).
- No Rust `assert!(true)` / trivially-true assertions found.
- `capabilities.test.ts` does guard the renamed-API case explicitly (line 32).
