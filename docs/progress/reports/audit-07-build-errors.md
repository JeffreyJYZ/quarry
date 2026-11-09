# Audit 07 — build execution and diagnostics

## Findings

### P1 — Cargo child diagnostics are pinned to the parent's span

- `src-tauri/src/build_task/parsedbuild.rs:90-114` `diagnostics_for`: every child from `message["children"]` is pushed with `diagnostic_at(&anchor, …)`, where `anchor` came from the parent message's primary span. The child's own `spans` are never consulted.
- A child that points at a different file/line (the common case for "expected `u32`, found `&str`" notes, trait errors, and macro expansion sites) is therefore reported at the parent's location, or dropped from the panel's index of the real file. Fix: resolve each child's anchor independently with `anchor_span(child, build_root)` and fall back to the parent anchor only when the child has no located span.

### P1 — C/C++ diagnostic paths are joined to the build dir, not the source dir

- `src-tauri/src/build_task/split_severity.rs:84-92` `absolute_text_path` joins a relative compiler path to `build_root`.
- `src-tauri/src/build_task/absolute_path.rs:82-121` `run_cmake_build` calls `parse_text_diagnostics(&text, Path::new(build_root))`, so that build root is what gets passed for both configure and build output. clang/cmake print paths relative to the source tree, so the joined path points into a directory that holds no such file and the click opens nothing. Fix: thread `source_root` (the `-S` argument) through to `parse_text_diagnostics` and join against it, keeping `build_root` for cargo only.

### P2 — A build cannot be cancelled and never times out

- `src-tauri/src/build_task/default_cargo.rs:109-138` `run_build`, `src-tauri/src/build_task/absolute_path.rs:78-121` `run_cmake_build`, and `src-tauri/src/build_task/collect_plain_clang_sources.rs:13-64` `run_plain_clang_build` all drive the child with `Command::output()` (or `resolve::command(...).output()`). There is no kill handle and no deadline, so a cancelled or hung build keeps consuming a blocking thread and the child keeps running after the UI gives up. Fix: spawn with piped stdio and a kill handle on a reader thread, mirroring `src-tauri/src/test_task/capture.rs`, and honour a cancellation flag / timeout; kill the child on drop.

### P2 — A failed plain-clang build still reports an artifact

- `src-tauri/src/build_task/collect_plain_clang_sources.rs:57-63`: `artifact: Some(build_dir.join(name)…)` is set unconditionally, including when `output.status.success()` is false. Run/Debug then launches a binary the build never produced (or a stale one). Fix: set `artifact` to `Some(...)` only when `success` is true, matching `run_cmake_build`.

### P3 — A failed cargo build with empty stderr says it succeeded

- `src-tauri/src/build_task/default_cargo.rs:128-138` plus `src-tauri/src/build_task/absolute_path.rs:59-72` `summarize`: when stderr has no non-empty line and `parsed.unlocated` is empty, the summary falls back to `DEFAULT_SUMMARY` (`"cargo build succeeded"`), regardless of `output.status.success()`. Fix: choose the fallback based on the exit status (a non-zero exit yields a failure summary such as `"cargo build failed"`), or surface `output.status` in the summary path.

### P3 — Error children are discarded

- `src-tauri/src/build_task/parsedbuild.rs:100-102` keeps only children whose level is `error` or `warning`; `note`/`help` children of a failing diagnostic are dropped. They usually carry the "expected X, found Y" line. Fix: keep `note` children as severity-4 help diagnostics at the child's own span (see P1), or at minimum append their text to the parent message.

## Checked, no issue

- `run_build` uses `parsed.success.unwrap_or_else(|| output.status.success())`, so a missing `build-finished` line does not flip a failing exit code to success.
- `run_cmake` (`cmakeoutcome.rs:28-43`) and `run_plain_clang_build` check `output.status.success()`; spawn failures propagate as `Err`.
- `run_cmake_build` skips the build step when configure fails and leaves `success = false`.
- No sequential pipe read in this module: every site uses `Command::output()`, which drains stdout and stderr concurrently; no deadlock from ordering.
- `plain_clang_argv.rs`/source walk fixed to depth 6 (do not re-report).

## Second layer

### Real trigger lines -> wrong output

- Child-span misattribution (`parsedbuild.rs:90-114`): input stream
  `{"reason":"compiler-message","message":{"level":"error","message":"mismatched types","spans":[{"file_name":"src/main.rs","line_start":4,"line_end":4,"column_start":5,"column_end":9,"is_primary":true}],"children":[{"level":"error","message":"expected `i32`, found `&str`","spans":[{"file_name":"src/helper.rs","line_start":9,"line_end":9,"column_start":1,"column_end":4,"is_primary":true}]}]}}`
  Row the user sees: one diagnostic at `…/src/main.rs:4:5` titled `error: expected `i32`, found `&str``. The real site `src/helper.rs:9:1` never appears in the panel.

- Build-not-found-as-success (`default_cargo.rs:128-138`): cargo invocation that exits 1 with no stderr and no compiler messages (for example a build script that prints nothing before failing, or a killed run). Result: `success = false`, `diagnostics = []`, `summary = "cargo build succeeded"`. The status bar and the result disagree; nothing names the failure.

### Branches of the parsers and where they yield zero diagnostics on a failing build

- Rustc JSON (`parsedbuild.rs:66-88`, `diagnostics_for`): a compiler message with `spans: []` (crate-discovery errors such as `error[E0463]: can't find crate for …`, or build-script compile failures reported by cargo) returns `ParsedLine::Unlocated(text)` and contributes no diagnostic. On a build that fails only with such messages, the panel stays empty even though `success` is false. Children whose level is neither `error` nor `warning` (notes/help) are also dropped at `parsedbuild.rs:100-102`.
- Clang text (`split_severity.rs:14-21`, `split_position`): a failing link produces lines such as `/usr/bin/ld: main.o: in function 'main': main.cpp:(.text+0x14): undefined reference to 'foo'` and `collect2: error: ld returned 1 exit status`. The first has no `": error:"` marker; the second has the marker but `split_position` sees head `collect2` and returns `None`. Result: zero diagnostics for a link failure. The same applies to `clang: error: no such file or directory: 'foo.c'` (head `clang`, no colon-number). `cmake --build` failures that print make rules (`make[2]: *** [CMakeFiles/…] Error 1`) likewise produce no diagnostic.
- CMake configure (`absolute_path.rs:82-121`): configure errors such as `CMake Error at CMakeLists.txt:5 (foo): …` are not in `path:line:column: severity: message` form, so `parse_text_diagnostic` returns `None` and the configure failure is reported only through `success` and the summary.
- No-output failure: covered above — an empty stdout from cargo with a non-zero exit gives `success = false`, `diagnostics = []`.

### Artifact claim path

- Warning-only plain-clang build: clang exits 0, so `run_plain_clang_build` (line 58) sets `success = true` and `artifact = Some(.quarry/build/<name>)`; the binary exists, so the claim is correct, but only because status happened to be success. On a compile error, clang exits 1 and usually leaves no output file, yet `artifact` is still `Some(.quarry/build/<name>)` (line 62), so Run/Debug receive a path that does not exist on disk. The CMake and cargo paths gate `artifact` on `success` already; only the plain-clang path does not.
