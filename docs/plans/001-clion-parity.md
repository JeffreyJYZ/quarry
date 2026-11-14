# quarry — CLion-parity IDE for Rust and C/C++

Status: original plan, dated. Implementation has moved well past it — the app now runs the daily loop end to end (see README.md §Status); this document is kept as the parity matrix, slices and estimates.

## 1. Target

quarry is an IDE for exactly two ecosystems — Rust and C/C++ — aiming at feature parity with CLion's
**daily loop**, not at CLion's feature count. It is not a general editor and not "a lightweight Zed".

The defended definition of parity is: open a project, navigate it, read errors, fix them, build, run a
test, launch the debugger, inspect memory. CLion's long tail — dozens of refactoring engines, profiler,
DFA, embedded and database tooling — is out of scope and listed in §8.

Why this is achievable: CLion's C/C++ insight engine is clangd, RustRover's is rust-analyzer, and their
debugger front end is a GDB/LLDB client. quarry reuses all three servers and writes the IDE around them.

## 2. Stack

| Layer         | Choice                                                       | Note                                                      |
| ------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| Shell         | Tauri 2                                                      | Rust process, native menus, small footprint               |
| UI            | React 19 + Vite 8 + TypeScript                               | `@/*` → `./src/*`                                         |
| Editor        | CodeMirror 6 + hand-written LSP client (`src-tauri/src/lsp`) | hides behind a 6-method adapter so Monaco stays swappable |
| C/C++ insight | `clangd`                                                     | `--background-index --clang-tidy --header-insertion=iwyu` |
| Rust insight  | `rust-analyzer`                                              | `checkOnSave` via `cargo check` (or `clippy`)             |
| Formatting    | `rustfmt`, `clang-format`                                    | on save, per-project style file                           |
| Debugging     | `lldb-dap` over raw DAP                                      | one client serves both languages                          |
| Memory        | custom hex view over DAP `readMemory`                        | paged mapped/unmapped                                     |
| Search        | `ripgrep` binary                                             | no libgit2 or index service early                         |
| Terminal      | `portable-pty`                                               | embedded shell                                            |
| VCS           | `git` CLI first                                              | `git2` only if a seam demands it                          |
| Lint (repo)   | Biome                                                        | tabs, indentWidth 4, lineWidth 100                        |
| Format (repo) | `bun fmt` (Bun's built-in)                                   | configured by `bunfig.toml` `[fmt]`                       |

All external toolchains are **detected, never bundled**. Detection probes `PATH` and falls back to
`xcrun --find` for the Apple-shipped tools.

## 3. Architecture

Two seams in Rust, three in the frontend. Everything else is a consumer of them.

Rust (`src-tauri/src/`):

| Module             | Owns                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `protocol_pipe.rs` | Content-Length JSON-RPC framing over stdio; shared by LSP and DAP                                   |
| `toolchain.rs`     | probe and report `clangd`, `rust-analyzer`, `rustfmt`, `clang-format`, `lldb-dap`, `cargo`, `cmake` |
| `project.rs`       | root, kind (cargo / cmake / compdb), targets, profiles, build command, debug program                |
| `lsp.rs`           | one server per project root, document sync, diagnostics stream                                      |
| `dap.rs`           | one session per launch, breakpoints, memory reads, disassembly                                      |
| `build_task.rs`    | build + diagnostics parse (named this way — `build.rs` is Cargo's build script)                     |
| `pty.rs`           | terminal sessions                                                                                   |
| `git.rs`           | status, blame, diff through the `git` binary                                                        |

Frontend (`src/`):

| Module     | Owns                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------- |
| `editor/`  | adapter: mount, setText, getText, applyEdits, setDiagnostics, decorate — Monaco-swappable |
| `doc/`     | open buffers, dirty state, save, format-on-save                                           |
| `session/` | one LSP and one DAP session per project root, lifecycle and reconnect                     |

Transport is full-document sync only. Incremental sync buys latency that the servers do not need at
project scale and costs a correct edit-to-range mapping; revisit only if the pipe measurably suffers.

Launch configuration lives at `.quarry/launch.json` in the project root:

```json
{
	"name": "unit tests",
	"program": "target/debug/app",
	"args": [],
	"cwd": ".",
	"build": "cargo build"
}
```

## 4. Parity matrix

| CLion capability                                                 | Where it comes from                                                                             | Cost |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---- |
| completion, diagnostics, hover, goto def/impl/type               | LSP                                                                                             | free |
| find references, rename, signature help, inlay hints, folding    | LSP                                                                                             | free |
| call and type hierarchy                                          | LSP                                                                                             | free |
| quick-fixes / clang-tidy fixes                                   | LSP`codeAction`                                                                                 | free |
| inline errors without saving                                     | rust-analyzer `checkOnSave`, clangd diagnostics                                                 | free |
| format on save, code style                                       | rustfmt / clang-format                                                                          | free |
| project-wide search                                              | `ripgrep`                                                                                       | free |
| build system, target and profile picker                          | `cargo metadata`, CMake targets, `compile_commands.json`                                        | work |
| mixed C and C++ in one tree                                      | per-language compile commands, one link                                                         | done |
| multi-config trees (Xcode, Visual Studio, Ninja Multi-Config)    | file API targets, `--config`, no `CMAKE_BUILD_TYPE`, and a database for the built configuration | done |
| run and debug configurations                                     | `.quarry/launch.json` + `Project`                                                               | work |
| debugger panel: breakpoints, frames, scopes, variables, evaluate | DAP                                                                                             | work |
| conditional and log breakpoints                                  | DAP                                                                                             | work |
| hardware watchpoints (data breakpoints)                          | DAP`supportsDataBreakpoints`                                                                    | work |
| memory view, disassembly                                         | DAP`readMemory`, `disassemble`                                                                  | work |
| Rust `Vec` / `String` / `Option` pretty printing                 | LLDB Rust plugin formatters                                                                     | free |
| test runner UI                                                   | `cargo test --message-format=json`, gtest/ctest listing                                         | work |
| embedded terminal                                                | `portable-pty`                                                                                  | work |
| git status, gutter, blame, diff                                  | `git` CLI                                                                                       | work |

### 4.1 What the C/C++ compile-and-analysis path verifies, and where

`scripts/cpp-parity-probe.ts` is the acceptance test for the compiler half of this matrix. It builds
real projects the way CLion builds them, asks the product what it would run
(`src-tauri/examples/quarry-plan.rs` → `project_plan`), executes exactly that, and judges analysis
with a real clangd started on the reported flags. Run it with `bun scripts/cpp-parity-probe.ts`; the
`integration` CI job runs it on every push to `main`.

Verified on macOS with Apple clang 21, Homebrew GCC 16, CMake 4.4/4.5:

| capability                       | what it proves                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| presets                          | configure goes through `--preset`, lands in the preset's `binaryDir`                          |
| toolchain file                   | `CMAKE_TOOLCHAIN_FILE` reaches the configure                                                  |
| multi-target                     | a library header and an `extern` resolve; targets come from CMake's model                     |
| generator: Xcode                 | no database written by the generator → one synthesised from the file API, in the plan's tree  |
| generator: Ninja Multi-Config    | same, plus per-configuration artefacts                                                        |
| system headers                   | resolve through the compiler CMake chose (`--query-driver`)                                   |
| plain                            | a project with no CMake and no database analyses from flags derived from its build            |
| mixed-languages                  | a `.c` unit is compiled and analysed as C, a `.cpp` as C++, and the link crosses `extern "C"` |
| profile                          | `RelWithDebInfo`/`MinSizeRel` reach the compiler, and analysis uses the profile being built   |
| two-targets                      | building one target does not build the other                                                  |
| multi-config                     | one entry per source for the configuration being built, and that configuration's artefact     |
| toolchain: gcc                   | a compiler clangd cannot recognise is queried for its include paths                           |
| toolchain: gcc behind a launcher | the same, with the compiler behind a `ccache`-shaped wrapper                                  |

The Windows rows are the same probe, run with `--windows` by the `windows` CI job on
`windows-latest`. A macOS run skips them by name, so nothing on the development machine proves them;
the job's own output — the table, the details and one line per command — is the measurement, and a
row that cannot run there says why instead of passing.

| capability               | what it proves                                                                                                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| generator: Visual Studio | the generator writes no `compile_commands.json`, the file-API synthesis produces one, `--config` carries `Debug`/`Release`, and the artefact the plan names is `build/<Config>/<target>.exe`                                                             |
| toolchain: MSVC          | the database's command runs `cl.exe` with `/I…`, the hand-off's `--query-driver` names `cl.exe`, and analysis resolves a project header, MSVC's `_MSC_VER` overload and `<vector>`; a control run records whether clangd needs the query on that machine |

Two more rows run in the same `windows` job, from their own scripts, because they measure the app's
other seams rather than the compiler's:

| capability  | script                            | what it proves                                                                                                                                                                                                                                                                             |
| ----------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| test-runner | `scripts/parity-windows-tests.ts` | GoogleTest cases are discovered from `<program> --gtest_list_tests` under a 20 s kill and one runs through `--gtest_filter=Suite.Case` without its sibling's output; Cargo discovery labels the integration test with the file it lives in and runs it                                     |
| debugger    | `scripts/parity-windows-debug.ts` | a Debug build from the discovered Visual Studio generator — or the generator `PARITY_DEBUG_GENERATOR` names — launches through `lldb-dap`, a breakpoint verifies at the statement, the stopped frame names that line, `evaluate` reads a local before and after a step, and continue exits |

On Windows neither hardcodes what the image ships: the generator is discovered with `cmake --help`
plus a real configure per candidate, and `lldb-dap` is looked for on `PATH`, in `%ProgramFiles%\LLVM\bin`
and in each `…\Microsoft Visual Studio\<year>\<edition>\VC\Tools\Llvm\<arch>\bin` directory read off
disk — which is also what the product's own resolver now does, so an install that only ships LLVM
inside Visual Studio is not invisible to the app. The row then launches each candidate before using it
and takes the first that starts, printing every rejected one with its exit status, its own stderr and
the DLLs beside it: a binary can be found and still die while it loads, and that is what the first
adapter launch on the image did. A machine that is not Windows supplies those two facts instead, with
`PARITY_DEBUG_GENERATOR` and `PARITY_DEBUG_ADAPTER`, and nothing else about the row changes.

Not verified here, and therefore not claimed: cross-compilers other than the one toolchain file above,
and diagnostics parity beyond clangd's own output. The MSVC control run is reported as evidence rather
than required — when clangd answers without `--query-driver`, the row says so. Both non-compiler rows
run in the same job and their verdicts are the job's own output: the test-runner row has passed there.

The debugger row is measured **two ways, and the two are not interchangeable**: on `windows-latest` it
records that the image's adapters refuse to start, and on a developer machine it measures quarry's
request sequence. The earlier runs of the row died in its own code — the fixture writer, adapter
startup, `uv_spawn`, the adapter probe — so those were fixed before either measurement existed.

The Windows half is an image fact, not a quarry defect. On `windows-latest` the
row finds seven adapters — `PATH`, `%ProgramFiles%\LLVM\bin`, `%ProgramW6432%`, `%ProgramFiles(x86)%`,
and Visual Studio's `LLVM\x64` and `LLVM\ARM64` (the ARM64 copy is a wrong-architecture file for an
x64 host and is expected to be refused) — and **none of them starts**: `--version` exits `53 (0x35)`
on a direct spawn and answers only through `cmd.exe /c`, where the session then dies with
`The network path was not found.`, which is Win32 `ERROR_BAD_NETPATH` and the same 53 the direct spawn
returned. An adapter that ends before answering `initialize` never started, so the row prints one
`SKIP` naming the adapter, the route, the exit status and the adapter's own words, keeps
`--version`-route evidence above it, and exits 0; a session that answers `initialize` and then fails a
later step is still a `FAIL`, because from that point it is quarry's request sequence being measured.
The row also prefers the route that answered, so a session is never started differently from the probe.

**On `windows-latest` the debugger sequence is therefore unmeasurable, not failing.** That row records
that the image's own adapters refuse to start; it does not measure the sequence there.

The sequence itself is measured on a developer machine, by the same script, with the two machine facts
named instead of discovered:

```sh
PARITY_DEBUG_GENERATOR="Ninja Multi-Config" bun scripts/parity-windows-debug.ts
```

`PARITY_DEBUG_GENERATOR` is the CMake generator to configure with (`Xcode` and `Ninja Multi-Config` both
work, and both really write the artefact to `build/Debug/parity_windows_debug` — the platform's
executable suffix, so no `.exe` outside Windows). `PARITY_DEBUG_ADAPTER` names the adapter and defaults
to `PATH`, then to `xcrun --find lldb-dap` on macOS, which is the only place Xcode installs it. Nothing
else changes: the fixture, the breakpoint, the frame, both `evaluate`s, the step, the continue and the
`AdapterGone` skip are the same requests and the same assertions. Run on 2026-11-14 against Xcode's
`lldb-dap` (`LLVM 21.0.0`), it printed the probe lines, `starts (direct)`, six assertion lines and
`verdict PASS (6 assertions)`, with the adapter exiting `0 (0x0)`; two runs agreed. Without the
variable the row still SKIPs on macOS, by name, which is the CI behaviour for that platform.

So the request sequence, the breakpoint, the frame, both `evaluate`s, the step and the exit are
measured here, and what stays unmeasured is that image's own `lldb-dap`. Nothing in the product changed
for this: its launch path still spawns the adapter once, still reports the adapter's stderr and exit
status when it dies, and still fails a launch the user asked for — the skip is the row's, because a
measurement that cannot run is not a defect.

Both Windows rows analyse the configuration they built: the synthesised database holds one entry per
source for that configuration, and the rows hover the define each configuration compiles with, so a
database holding another configuration's command fails the row instead of passing on a plausible
header.

The Windows test-runner half is a second probe, `bun scripts/parity-windows-tests.ts`. It builds a
CMake project whose suite is a GoogleTest-shaped program and a Cargo project with one integration
test, then asks the product through `src-tauri/examples/quarry-tests.rs` → `test_plan`, so the dock's
own `--gtest_list_tests` parse, `--gtest_filter=Suite.Case` argv and Cargo discovery are what the row
judges:

| capability       | what it proves                                                                                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gtest: discovery | the suite and case come from `.quarry/launch.json`'s program, named `Suite.Case` under `gtest`, and the program asked is the built `.exe`                                                                                                                 |
| gtest: 20 s kill | a program that never answers is killed at the dock's own bound and reported as a note, not left to wedge the tree                                                                                                                                         |
| gtest: case run  | one case runs through `--gtest_filter=Suite.Case`, passes, and its own stdout reaches the report                                                                                                                                                          |
| cargo: discovery | `cargo test --no-run --message-format=json` names the test target's source and executable, that executable's own `--list` names the case, and it is grouped under `tests/parity.rs` rather than `src/lib.rs`, which needs `cargo.exe` resolved on Windows |
| cargo: case run  | the named test runs and the report keeps cargo's own `1 passed` summary                                                                                                                                                                                   |

The GoogleTest half vendors a header-only runner rather than `FetchContent`ing googletest: quarry
never links gtest, it only speaks the binary's `--gtest_list_tests` / `--gtest_filter=` contract, so
a vendored build would add a network fetch and a multi-minute MSVC build to a row that measures the
dock. The image ships no gtest package, and that contract is the whole of what the dock needs.

A machine that is not Windows prints one SKIP line naming the reason and exits 0, a missing Visual
Studio generator or C++ toolset skips the same way, and a fixture defect exits 2 where a product
finding exits 1 — with the failing command, its exit code and its first stderr lines. **The row's
Windows verdict is pending**: it has not run on `windows-latest` in this branch, so the claim here is
that the row exists and says why it cannot run, nothing more. Locally, the same fixtures built by
hand with Apple clang and the same `quarry-tests` binary answered: discovery named
`ParitySuite.HoldsValues` from the built program, the case run carried `parity-case-output total=5`,
a never-answering program was killed at 20.0 s with the dock's own note, and both Cargo answers
labelled `adds_two_and_three` with `tests/parity.rs` and ran it.

One defect was found by reading before the row could run: the shared resolver stat-ed a bare `cargo`
and never `cargo.exe`, so the dock's Cargo discovery could not have spawned cargo on Windows. It is
fixed in `src-tauri/src/resolve/source.rs` and unit-tested. The Cargo list also grouped
`adds_two_and_three` under `src/lib.rs` rather than `tests/parity.rs`, because cargo prints its
`Running …` headers on unbuffered stderr while the test names arrive on buffered stdout, so the one
merged `--list` pass attributed each name to whichever header won the race. Discovery now builds the
test targets with `cargo test --no-run --message-format=json`, reads each target's `src_path` and
`executable`, and lists every executable directly, so a case's label is the file it lives in and no
stream merge can change it; `parse_tests'` header rule remains only for a listing that still carries
one. The row pins that label, so grouping an integration test under the lib fails it instead of
passing on the right name.

Linux is the same probe run with `--linux` by the `linux` CI job on `ubuntu-latest`, where CLion's
own default toolchain is GCC rather than Apple clang and every artefact is an ELF file with no
`.app`/`.exe` beside it:

| capability                       | what it proves on Linux                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| presets                          | configure goes through `--preset` into the preset's `binaryDir`, with `-DCMAKE_BUILD_TYPE` from the profile  |
| toolchain file                   | `CMAKE_TOOLCHAIN_FILE` reaches the configure and its define reaches the compiler                             |
| multi-target                     | a library header and an `extern` resolve from `target_include_directories`, listed from CMake's model        |
| generator: Ninja Multi-Config    | the generator writes no database, the file API synthesis makes one in the plan's tree                        |
| system-headers                   | `std::format` and a C API resolve through `/usr/bin/c++`, which only `--query-driver` teaches clangd to read |
| plain                            | a project with no CMake analyses from flags its own build derives                                            |
| mixed-languages                  | the `.c` unit is compiled and analysed as C, the `.cpp` as C++, and the link crosses `extern "C"`            |
| profile                          | `RelWithDebInfo`/`MinSizeRel` reach the compiler, and the session follows the tree the profile built         |
| two-targets                      | `--target parity_one` writes one binary, no target writes both                                               |
| multi-config                     | each configuration writes its own artefact under `build/<Config>/`, and debug info is read with `readelf -S` |
| toolchain: gcc                   | a compiler clangd cannot recognise is queried for its include paths                                          |
| toolchain: gcc behind a launcher | the same, with the compiler behind a `ccache`-shaped wrapper                                                 |

Three things on that list are Linux-only or Linux-different, and each is named rather than assumed:
`readelf -S` replaces `otool -l` as the DWARF reader (`scripts/cpp-parity-debug-info.ts`), because ELF
keeps `.debug_info` where Mach-O keeps `__DWARF` — the row used to spawn `/usr/bin/otool`, which on
Linux prints nothing and fails the `RelWithDebInfo` half it never read; `generator: Xcode` skips by
name, since no Linux cmake can write that layout; and the GCC row's control run is reported as
evidence instead of a hard requirement, because clang and GCC there share libstdc++, so an unqueried
clangd still finds the headers and the control cannot discriminate. The Visual Studio and MSVC rows
are skipped by the same line a machine without the generator prints everywhere.

The table is the job's own measurement, not a claim transferred from macOS: the first run on
`ubuntu-latest` is what proves it, the same way the Windows rows are proved by theirs.

On Linux what stays unproven is narrower still: no debugger or test-runner row runs, the plain and
mixed-language rows compile with clang (the product's plain build names `clang`/`clang++`), so a Linux
box without clang is not covered, and no cross-toolchain beyond the one toolchain file is measured.

The generator version is discovered, never assumed: `cmake --help` names what that cmake supports,
and a runner image can list a generator whose Visual Studio instance is absent, so the probe
configures a scratch project with each candidate — newest first, with the same `-A x64` argv the
fixtures use — and prints one line per attempt. A hardcoded `Visual Studio 17 2022` failed on an image
that lists a newer generator only; the probe now prints the chosen name and every failure, so a
runner with none says why instead of skipping quietly.

## 5. Slices

Estimates assume solo work on a familiar stack, full days.

| Slice  | Contents                                                                                                                                                                                   | Days |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| **P0** | shell, folder open, file tree, tabs, CodeMirror mount, project detect, `.quarry/launch.json`, layout persistence                                                                           | 3–4  |
| **P1** | `ProtocolPipe`, rust-analyzer + clangd attach, diagnostics in gutter and Problems, completion, hover, goto, references, rename, code actions, inlay hints, semantic tokens, call hierarchy | 7–9  |
| **P2** | build via cargo JSON and CMake/ninja, diagnostic parsing, target + Debug/Release picker, run configs, cargo test tree, gtest/ctest discovery, ripgrep search                               | 5–6  |
| **P3** | DAP client: launch/attach, conditional and log breakpoints, stepping granularity, frames, scopes, variables, evaluate, watch, data breakpoints                                             | 7–9  |
| **P4** | memory view with paged unmapped regions, typed reads, pointer follow, disassembly view, "view in memory" from a variable row                                                               | 5–7  |
| **P5** | embedded terminal, git status / gutter / blame / diff                                                                                                                                      | 3–4  |

Total for daily-loop parity: **30–36 working days**. First slice that behaves like an IDE is P0–P2,
about three weeks.

P4's representation follows Zed's `crates/project/src/debugger/memory.rs` — pages are either mapped or
unmapped, and unmapped pages allocate nothing. Read it for the pattern; Zed is GPL-3.0 and no code is
copied into this MIT repo.

## 6. Spike before P3 — done

Run and measured: [`dap.md`](../spikes/dap.md), reproducible with `bun run scripts/dap-spike.ts`.

- `readMemory`, `disassemble` and hardware data breakpoints all work against Xcode's `lldb-dap`
  (LLVM 21.0.0); `readMemory` returned exactly the planted bytes.
- Rust pretty printing is off by default: a `Vec<u8>` arrives as `{buf, len}`. One `initCommands`
  entry importing `<sysroot>/lib/rustlib/etc/lldb_lookup.py` fixes it (`size=8`, element children,
  `"quarry"`, `Some(1234)`). P4 needs a launch flag, not a visualizer shim.
- `supportsMemoryReferences: false` is an advertisement gap only — frames still carry
  `instructionPointerReference` and `disassemble` accepts it.
- Data breakpoints fire, but `hitBreakpointIds` is `null` and the stop lands on the line after the store,
  so stops are attributed by `description` and address.
- `evaluate` works for Rust when the request carries the stopped frame's `frameId`; without it lldb-dap
  refuses every expression. lldb's Rust parser is a subset, so method calls and `as` casts still fall
  back to Objective-C++ and error.
- `realpath` the project directory before `launch`, or DWARF path canonicalisation leaves every
  breakpoint unverified.

`cargo run` is not a debugger launch. Build first, then hand `lldb-dap` the binary path from cargo JSON.

## 7. Risks

- **Rust expression evaluation.** Measured broken in the spike; a debugger watch pane does not ship until
  an escape hatch is verified.
- **`cmake` and `ninja` are not installed on the development machine.** Plain `clang++` builds must be
  first-class; CMake integration ships behind a detection hint.
- **rust-analyzer `checkOnSave` cost.** Default to `check`; expose `clippy` as a setting.
- **Full-document sync on large files.** Acceptable at project scale; measure before changing.
- **Toolchain drift.** Server flags and capabilities are probed at attach, not hard-coded per version.

## 8. Non-goals

Profiler (CPU and DFA), long-tail refactorings beyond rename and LSP code actions, 2000+ intentions,
remote development, embedded targets, database tools, Docker integration, AI assistance, plugin API,
other languages. Adding a language means re-deriving §4 for that language, not flipping a flag.

## 9. Machine toolchain facts (development box)

| Tool                                                | Location                                        |
| --------------------------------------------------- | ----------------------------------------------- |
| `rust-analyzer`, `rustfmt`, `cargo`, `rustc` 1.99.0 | `/opt/homebrew/opt/rustup/bin`                  |
| `clangd`                                            | `/usr/bin/clangd` (also in the Xcode toolchain) |
| `lldb-dap`, `clang-format`                          | only via `xcrun --find`                         |
| `cmake`, `ninja`                                    | absent                                          |
| Apple clang                                         | 21.0.0                                          |

`toolchain.rs` must probe both `PATH` and `xcrun --find`; a GUI-launched app inherits launchd's `PATH`
and will not see the rustup shims.

## 10. Decisions

- Editor is CodeMirror 6, not Monaco: smaller, no worker story, and the LSP client is hand-written in
  `src-tauri/src/lsp` (no `@codemirror/lsp-client` dependency).
- One LSP and one DAP session per project root, no per-file servers.
- The debugger targets `lldb-dap` only; GDB support is not planned.
- Build module is `build_task.rs` to avoid colliding with Cargo's `build.rs`.
- License is MIT, deliberately distinct from Zed's GPL-3.0.
