# Audit 2-15: artifact selection for Run/Debug

Files inspected: `src-tauri/src/build_task/newest_executable.rs`, `src-tauri/src/build_task/parsedbuild.rs`, `src-tauri/src/build_task/absolute_path.rs`, `src-tauri/src/build_task/collect_plain_clang_sources.rs`, `src-tauri/src/build_task/default_cargo.rs`, `src/lib/run/buildThenRun.ts`, `src/lib/debug/profile.ts`, `src/lib/debug/useBuildBinary.ts`.

## Findings

- P0 `src-tauri/src/build_task/newest_executable.rs:45-55,75-87` — `walk` recurses into `target/debug/deps` (not in `SKIPPED`) and `is_candidate` only filters by extension, so a cargo build that also compiled tests can select a test binary (an executable with no extension) as the app. Fix: skip `deps`, `examples`, `build` and `incremental` dirs; or, for cargo, prefer the `compiler-artifact` path over the heuristic.
- P1 `src-tauri/src/build_task/parsedbuild.rs:57,82-85` — `parsed.artifact` is overwritten by every `compiler-artifact` message, including test binaries, so the last one in stream order wins rather than the binary the target names. Fix: keep the artifact only when its path is not under `deps/`, or match the requested target's binary name.
- P1 `src-tauri/src/build_task/collect_plain_clang_sources.rs:57-63` — `artifact` is `Some(...)` even when `output.status.success()` is false, so a failed plain-clang build reports a binary that was never produced. Fix: set `artifact` only when `success` is true, matching `run_cmake_build` (`absolute_path.rs:115-119`).
- P2 `src-tauri/src/build_task/newest_executable.rs:62-67` — tie-break is by path, not by build intent, so two executables written in the same millisecond pick the lexicographically smaller one. Fix: prefer the newest by mtime only and return `None`/error when ambiguous, or name-match the target.
- P2 `src/lib/run/buildThenRun.ts:67-71` — a successful build with a blank `artifact` (library, text-only build) leaves `config.program` unchanged, so Run can launch a stale or wrong binary instead of failing. Fix: treat a missing artifact as a failure for Run, mirroring `resolveDebugArtifact` for release (`src/lib/debug/profile.ts:15-27`).
- P3 `src-tauri/src/build_task/newest_executable.rs:32-36` — returns a lossy `String`; the path is passed as one argv element to `runProgram`, so spaces do not break the launch itself, only the displayed `argv` line (`useRunControls.ts:129`) which joins with spaces.

## Cleared

- `newest_executable` does filter stale files by `since` (`is_candidate` `modified >= since`) and returns `None` for missing dirs (`tests_5.rs:75-80`).
- CMake sets `artifact` only on success (`absolute_path.rs:115-119`).
- Debug release path already fails on missing artifact (`profile.ts:26`).
- No evidence of a path-with-space launch failure beyond display.
