# Rust build-task consts

Scope: `src-tauri/src/build_task/**` (non-test).

## Already centralized

- `cmakeoutcome.rs`: `PLAIN_CLANG_SOURCE_CAP` 200, `PLAIN_CLANG_MAX_DEPTH` 6, `PLAIN_CLANG_IGNORED_DIRS`, `PLAIN_CLANG_SOURCE`, `DEFAULT_CLANG_SUMMARY`, `TEXT_SEVERITIES`, `CMAKE_PROGRAM` consumed via default_cargo.
- `default_cargo.rs`: `DEFAULT_CARGO`, `CARGO_ENV`, `SOURCE`, `SUMMARY_LIMIT` 200, `DEFAULT_SUMMARY`, `CMAKE_PROGRAM`, `CMAKE_SOURCE`, `CMAKE_CONFIG_DEBUG/RELEASE`, `DEFAULT_CPP_SUMMARY`.
- `newest_executable.rs`: `MAX_DEPTH` 4, `SKIPPED`, `NOT_PROGRAMS`.

## Move to a build_task consts module

- `collect_plain_clang_sources.rs:25,27,130` compiler names `clang`/`clang++`, repeated at 25/27 (select) and 130 (argv). Move all compiler/program names to one module.
- `collect_plain_clang_sources.rs:131` `-std=c17` / `-std=c++20` → `-std=c17`/`-std=c++20` consts.
- `collect_plain_clang_sources.rs:137-139` flags `-g`, `-O0`, `-fno-color-diagnostics`; trailing `-o` is a flag name, fine to keep; move `-g`/`-O0`/`-fno-color-diagnostics`.
- `collect_plain_clang_sources.rs:127` extension check `ext == "c"`; central source list lives in `extensions.ts` on frontend but Rust side has no equivalent; consider a shared `c extensions` const.
- `collect_plain_clang_sources.rs:91,132` build output path `.quarry/build`; hardcoded twice. Const.
- `newest_executable.rs:0o111` mode bits in `is_executable`; document as unix const.
- `parsedbuild.rs` cargo reasons/levels: `"compiler-message"`, `"build-finished"`, `"compiler-artifact"`, child levels `"error"|"warning"`; fine as inline match patterns, but a consts table would clarify. Low value.
- `split_severity.rs:TEXT_SEVERITIES` already there; severities 1..4 inline in `absolute_path.rs:severity` and `default_cargo`? Would benefit from named severity consts, but probably leave (one map).

## Magic numbers

- 200 (summary limit) and 200 (cap) distinct but same numeral; keep separate names.
- 6 ignored dirs depth; 6 and 4 and 5 already named.
- `u8` severity scale 1-4 documented inline.

## Diagnostic regexes

None in build_task; diagnostics parsed via JSON and severity markers already in `TEXT_SEVERITIES`.

## Conclusion

No diagnostic regexes. Most magic numbers already moved. Remaining work: centralize compiler names, std flags, clang flags, and `.quarry/build` output path in a Rust consts module beside build_task, alongside existing `PLAIN_CLANG_*`.
