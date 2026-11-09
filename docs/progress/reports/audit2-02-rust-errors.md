# audit2-02: Rust error strings

Scope: `src-tauri/src/**/*.rs` (non-test), every `format!` that becomes a Tauri command `Result::Err`. Read-only.

## Findings

### P1

- `src-tauri/src/build_task/default_cargo.rs:88-93` `cpp_not_wired` — message says "C/C++ builds are not wired yet", but `run_plain_clang_build` exists and is the `CompileCommands`/`Unknown` branch. A C/C++ user hitting this mis-dispatch path is told the feature does not exist. Fix: reword to "this cargo branch only builds Cargo projects; use the C/C++ build branch".

### P2

- `src-tauri/src/build_task/cmakeoutcome.rs:54-56` `missing_cmake_error` — "CMake is not on PATH: C/C++ support needs CMake installed" names no remedy. Compare `format/run.rs:126` which tells the user `xcode-select --install` / `brew install clang-format`. Fix: append `install CMake (brew install cmake) or the Xcode command line tools`.
- `src-tauri/src/build_task/collect_plain_clang_sources.rs:30-32` — "{compiler} is not on PATH: C/C++ support needs {compiler} installed" same gap; no install hint. Fix: add `install the Xcode command line tools (xcode-select --install)`.
- `src-tauri/src/resolve/source.rs:86-88` — "{program} was not found on PATH, in the toolchain directories, or through xcrun" with no remedy. Fix: name the relevant install (rustup for cargo/rustc/rust-analyzer; xcode-select for clang tools).

### P3

- `src-tauri/src/git/git_stage.rs:14-15` — "git stage failed: {error}" / "git unstage failed: {error}" keep the cause but drop which path and root; a multi-file failure reads as a generic git error. Fix: include `{path}` and `{root}`.
- `src-tauri/src/pty/output_event.rs` spawn errors ("cannot open pty", "cannot spawn shell in {cwd}") include cause but no remedy; acceptable, low priority.

## Cleared

- `format/run.rs` missing() and `format_start_failure.rs` start_hint() — good remedy text.
- `new_project/create_project.rs` validation errors name the offending value.
- `settings/settings_core.rs` write paths include the path.
- No `.map_err(|_| ...)` discarding cause except `max_frame_bytes.rs:98` (parse of a content-length, cause is "not an integer", redundant) and `max_text_bytes.rs` (UTF-8, cause is "not valid UTF-8", redundant). Both justified.
- No bare "failed" strings without a subject; all `{error}` wrappers retain the cause.
