# Repository layout

Two trees, one rule each:

- **`src/lib`** — logic. Anything that does not render: API wrappers, models, parsers, hooks, constants.
- **`src/ui`** — rendering. Components and their stylesheets.

A feature keeps its directory name on both sides, so `editor/` appears as `src/lib/editor/theme.ts` and `src/ui/editor/Editor.tsx`. Imports cross between them through the `@/` alias; relative imports are for files in the same directory only.

Constants live in `src/lib/consts`, one module per area. Types that several modules share live next to the code that owns them, or in `src/lib/<area>/*-types.ts`.

## The 200-line rule

`scripts/check-file-size.ts` fails the gate when any file under `src`, `src-tauri/src` or `scripts` passes 200 lines. Files that predate the rule are listed in `oversized.txt`; that list may only shrink, and the check fails when a listed file has come back under the limit so the entry gets removed.

## Splitting a large file

- **TypeScript**: extract cohesive units into sibling files with explicit prop or option types. Never change behaviour: same class names, same text, same effect order.
- **Rust**: a module that outgrows the limit becomes a directory — `src/foo.rs` → `src/foo/mod.rs` plus `mod bar;` children and `pub use` re-exports, so `crate::foo::X` paths keep working and `lib.rs` needs no edit.
- **Rust, forbidden**: `include!("part1.rs")` chunking. It keeps everything in one scope, so the parts are not modules at all; it only moves lines around and produces meaningless names.
- **CSS**: `scripts/split-css.ts` splits a stylesheet into ordered section files and leaves the original path as an `@import` index, so the cascade order is preserved.

## Status

Done: backend API split into `src/lib/project/api/*`, stylesheets split, terminal, settings, debugger panels, source control, search, quick open, tests dock, run form, file-level utilities.

Remaining exceptions are listed in `oversized.txt`. The two large ones — `src/ui/App.tsx` and `src/ui/editor/Editor.tsx` — are single monolithic components and need a staged split (one extracted component or hook per change, gate between each), not a single mechanical pass.
