# Audit 19 — language detection and syntax highlighting

Read-only. Files inspected: `src/lib/consts/extensions.ts`, `src/lib/files/fileKind.ts`, `src/lib/editor/languages.ts`, `src/lib/editor/languageLabel.ts`, `src/lib/lsp/served.ts`, `src/lib/lsp/rootSignals.ts`, `src/lib/generate/model.ts`, `src/lib/project/save.ts`, `src/ui/editor/useFormatDocument.ts`, `src-tauri/src/lsp/position.rs`, `src-tauri/src/format/max_input_bytes.rs`, `src-tauri/src/build_task/collect_plain_clang_sources.rs`.

## Findings

- P1 `src-tauri/src/lsp/position.rs:86` — Rust-side `language_id` lists `"c" | "h" | "cc" | "cpp" | "hpp" | "cxx" | "hh"` but omits `hxx`, while the frontend table includes it (`extensions.ts:11`, `languages.ts:34`). A `.hxx` file therefore gets `languageId: "plaintext"` when opened in clangd. Fix: add `"hxx"` to that match arm.
- P1 `src-tauri/src/format/max_input_bytes.rs:25` — `C_FAMILY` is `["c", "h", "cc", "cpp", "cxx", "hh", "hpp"]`, also missing `hxx`, so `formatter_for`/`format_document` report no formatter for `.hxx` even though the frontend treats it as C++. Fix: add `"hxx"` (and keep the array length in step).
- P2 `src/lib/consts/extensions.ts:11` — `CPP_EXTENSIONS` does not include `.cu`, `.m` or `.mm`, and nothing else in the repo maps them. They fall through to `generic`/plain text in `fileKind.ts`, `languageNameForPath` (`languages.ts:37`), `served.ts`, and `generate/model.ts`. Either add them to the C/C++ family or document them as unsupported; current state silently leaves them unhighlighted and unserved.
- P2 `src/lib/project/save.ts:18-21` and `src/ui/editor/useFormatDocument.ts:11-14` — both keep a private `extensionOf` instead of importing `@/lib/consts/extensions`. The private copies use `path.lastIndexOf(".")` directly, so dotfiles such as `.gitignore` yield `"gitignore"` where the central function returns `""` (`extensions.ts:20-26`), and backslash paths are not normalized. Fix: import and call the central `extensionOf`.
- P2 `src-tauri/src/build_task/collect_plain_clang_sources.rs:118` — `is_plain_clang_source` accepts only `c`/`cc`/`cpp`, so a no-build-system C/C++ project whose sources are `.cxx`, `.h`, `.hpp`, `.hh` or `.hxx` collects nothing and reports "no build system". Fix: match the full C/C++ extension set (or at least the source extensions clang accepts).
- P3 `src/lib/editor/languages.ts:20-38` — `.clang-format`, `CMakeLists.txt` (`fileKind.ts:28` maps it to `generic`) and `*.cmake` resolve to `null`/plain text. `.clang-format` is YAML and could be highlighted; CMake has no mode at all. Fix: map `.clang-format` to `yaml`, and either add a CMake language mode or leave CMake files explicitly unsupported rather than silently plain.
- P3 `src-tauri/src/lsp/position.rs:86` and `src-tauri/src/format/max_input_bytes.rs:25` — the two Rust-side tables are hand-maintained duplicates of `CPP_EXTENSIONS` with no compile-time link to the frontend list, so they already drifted on `hxx`. Fix: add a parity check or generate both from one list.

## Checked, no issue

- All five named consumers import the single source: `fileKind.ts:3`, `editor/languages.ts:8`, `lsp/served.ts:3`, `lsp/rootSignals.ts:2`, `generate/model.ts:8`.
- `.rs` is covered in all four places: `extensions.ts:14`, `languages.ts:33`, `served.ts:8`, `position.rs:85`, `max_input_bytes.rs:70`.
- The requested config names that are mapped work: `Cargo.toml` (toml), `Cargo.lock` (toml), `Cargo.toml.orig` (toml), `compile_commands.json` (json), `.cargo/config` (toml) (`languages.ts:10-29`, `fileKind.ts:23-24`).
- `CPP_EXTENSIONS` includes `hxx` on the frontend and tests assert it is classified, highlighted, served and generated (`extensions.test.ts:32-67`).
- `extensionOf` is case-insensitive and handles backslashes, nested paths, dotfiles and trailing dots (`extensions.ts:20-26`, `extensions.test.ts:14-28`).
- `languageLabel` delegates to `languageNameForPath` and only falls back to the raw extension for unknown files (`languageLabel.ts:4-10`).
- Root-signal probing uses `isCppPath` for the bounded scan and explicit names for `Cargo.toml`/`compile_commands.json`/`CMakeLists.txt` (`rootSignals.ts:40-47,110`).
- `generateItems` dispatches on `isRustPath`/`isCppPath`, so unknown extensions yield no items (`model.ts:155-170`).
- Backend formatter dispatch is case-insensitive and reports taplo for `.toml` (`max_input_bytes.rs:63-75`).
