# DAP spike: what `lldb-dap` supports here

Measured, not assumed. Reproduce with `bun run scripts/dap-spike.ts` (exit 0 = every required step passed; `--json` prints the full report). The script generates its own throwaway cargo project under `$TMPDIR`, builds it, and speaks raw Content-Length framed DAP over stdio.

| Item            | Value                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Adapter path    | `/Applications/Xcode.app/Contents/Developer/usr/bin/lldb-dap`                                             |
| Adapter version | `LLVM version 21.0.0`, `liblldb: lldb-2103.0.34.103`, Apple Swift 6.4 toolchain                           |
| Target          | Rust `dap-spike` binary from `cargo build` (debug), rustc 1.99.0 via `/opt/homebrew/opt/rustup/bin/cargo` |
| Machine         | macOS arm64 (Apple silicon), Xcode 21 lldb-dap                                                            |
| Stop of record  | `dap_spike::inspect` at `src/main.rs:12`, one line breakpoint, verified                                   |

Addresses below are ASLR-dependent and differ per run; instruction text, hex bytes, type strings and dataId shapes do not.

## Capabilities (from the `initialize` response)

| Capability                          | Measured |
| ----------------------------------- | -------- |
| `supportsReadMemoryRequest`         | yes      |
| `supportsDisassembleRequest`        | yes      |
| `supportsDataBreakpoints`           | yes      |
| `supportsMemoryReferences`          | **no**   |
| `supportsMemoryEvent`               | **no**   |
| `supportsWriteMemoryRequest`        | yes      |
| `supportsSetVariable`               | yes      |
| `supportsConditionalBreakpoints`    | yes      |
| `supportsHitConditionalBreakpoints` | yes      |
| `supportsLogPoints`                 | yes      |
| `supportsEvaluateForHovers`         | yes      |
| `supportsRestartRequest`            | no       |
| `supportsTerminateRequest`          | no       |

`supportsMemoryReferences: false` is only about _advertising_ references. The `stackTrace` response still carries `instructionPointerReference` on each frame (`0x1000014B8` here), and `disassemble` accepts it. Do not gate the disassembly UI on that flag; use the frame field and fall back to nothing if it is absent.

## Variables: stock lldb-dap renders raw structs

Top frame locals, verbatim:

```text
tag      '\x01'                                                     unsigned char
v        alloc::vec::Vec<unsigned char, alloc::alloc::Global> @ 0x16fdfdc10
s        alloc::string::String @ 0x16fdfdc28
o        core::option::Option<u32> @ 0x16fdfdc40
raw      0x0000000100669730 "ޭ\xbe\xef"                              unsigned char *
n        8                                                          unsigned int
```

`v` children: `buf = alloc::raw_vec::RawVec<unsigned char, alloc::alloc::Global> @ 0x16fdfdc10`, `len = 8`. `buf` expands to `inner` and `_marker`, so the user reaches the bytes only through `inner` → `ptr`/`cap`. `s` children: `vec`. `o` children: `$variants$`.

So stock: **the `Vec<u8>` and the `String` do not pretty-print** — they arrive as the raw struct, with no element list. `Option` shows an enum discriminant node, not `Some(1234)`.

## Variables: with rustup's LLDB providers loaded

`launch` with `initCommands: ["command script import <sysroot>/lib/rustlib/etc/lldb_lookup.py"]` (what `rust-lldb` does; here `<sysroot>` = `/Users/jyz/.rustup/toolchains/stable-aarch64-apple-darwin`) gives, verbatim:

```text
v        size=8
s        "quarry"
o        Some(1234)
```

`v` children: `[0] = '\xde'`, `[1] = '\xad'`, `[2] = '\xbe'`, `[3] = '\xef'`, `[4] = '\0'`, `[5] = '\x11'`, `[6] = '"'`, `[7] = '3'`. `s` children: `[0] = 'q'` … `[5] = 'y'`.

One `initCommands` entry is enough on rustc 1.99.0; that toolchain ships no `lldb_commands` file, and `lldb_lookup.py` registers its providers from `__lldb_init_module`. Rust 1.96.1 does ship `lldb_commands`, so the loader must `command source` it when present.

## `readMemory` on the known buffer

`readMemory` at `raw`'s address, `count: 8`, returned base64 that decodes to exactly the planted bytes (one run; the address varies, the bytes do not):

```text
0x0000000100669730 = de ad be ef 00 11 22 33
```

`raw`'s value string is `0x0000000100669730 "ޭ\xbe\xef"`, so a client must take the leading `0x…` token, not the whole value, before using it as `memoryReference`.

## `disassemble` at the frame's instruction pointer

`disassemble` with `memoryReference: <instructionPointerReference>`, `instructionCount: 4`, `resolveSymbols: true`:

```text
0x1000014B8 add     x11, sp, #0x60
0x1000014BC add     x0, sp, #0xc0
```

## Data breakpoints

`dataBreakpointInfo` works for both a stack local and a static, and returns a dataId with **no`0x` prefix** — the shape is `<hex>/<byte-size>`:

| Watch                             | dataId        | description                               | accessTypes                  |
| --------------------------------- | ------------- | ----------------------------------------- | ---------------------------- |
| local `n` (u32)                   | `16FDFDCBC/4` | `4 bytes at 16FDFDCBC n`                  | `read`, `write`, `readWrite` |
| static `dap_spike::COUNTER` (u32) | `10004CD50/4` | `4 bytes at 10004CD50 dap_spike::COUNTER` | `read`, `write`, `readWrite` |

`setDataBreakpoints` with `{ dataId, accessType: "write" }` returned `verified: true`. It actually fired: after arming the watch on the static, dropping the line breakpoint and continuing, the process stopped with `reason: "breakpoint"`, `description: "watchpoint 1"` inside `dap_spike::inspect`, and re-reading the static's 4 bytes showed `16` (it was `8` at the first stop, and the second call adds `8`). Verdict: **hardware data breakpoints work end to end.**

Two caveats worth knowing before P3 builds on it. `hitBreakpointIds` is `null` on that stop, so a stop cannot be attributed by id — only by `description` (`"watchpoint 1"`) and by re-reading the watched address. And the reported stop line is `12`, the line _after_ the store on line 11; LLDB reports the post-store PC, so watchpoint stops land one line late in the gutter.

## `evaluate` is broken for Rust

`evaluate` with `{"expression": "*raw@8", "context": "watch"}`:

```text
error: evaluate failed: Expression evaluation in Rust not supported. Falling back to default language. Ran expression as 'Objective C++'.
error: <user expression 0>:1:5: expected ';' after expression
error: <user expression 0>:1:5: definition of class NSNumber must be available to use Objective-C numeric literals
```

So a Rust watch/expression pane cannot rely on `evaluate` as-is: lldb-dap falls back to Objective-C++ and fails on Rust syntax.

## What this means for P3/P4

- **No Rust visualizer shim is needed in P4.** Stock `lldb-dap` renders `Vec`/`String` as raw structs, but one `initCommands` line (`command script import <sysroot>/lib/rustlib/etc/lldb_lookup.py`) gives `size=8` with element children, `"quarry"` and `Some(1234)`. The session needs the sysroot, which it can derive from the detected toolchain.
- **Ship `initCommands` as a default, not a nicety.** `rust-lldb` parity depends on it, and the regression is invisible in the protocol: the same `variables` call simply returns `buf`/`len` instead of elements.
- **Do not gate memory or disassembly on `supportsMemoryReferences`.** It is `false` here while frames carry `instructionPointerReference` and both `readMemory` and `disassemble` work; treat it as an advertisement, not a gate.
- **Data breakpoints are viable**, but P3 must match stops by `description`/address rather than `hitBreakpointIds` (null), and P4's gutter should show the watchpoint stop on the reported line even though it sits just past the store.
- **Do not build a Rust watch pane on `evaluate` yet.** It errors with `Expression evaluation in Rust not supported` and falls back to Objective-C++; verify a workaround before scoping evaluate/watch into P3.

## Unverified

- Any adapter other than Xcode's LLVM 21.0.0 `lldb-dap`; the Linux/LLVM upstream build and older Xcode versions were not run.
- A Rust-side workaround for `evaluate` (other `context` values, a DAP `expressions` request, or lldb's `frame variable` escape hatches) — measured as broken, not measured as unfixable.
- Conditional breakpoints, log points, hit conditions: advertised `yes`, never exercised.
- `setDataBreakpoints` with `accessType: "read"` or `"readWrite"`, and the missing `canPersist` field (absent in the response).
- Attach to a running process; only `launch` was tested.
- `readMemory` across page boundaries, unmapped pages and paged first/partial counts — the shape P4's hex view needs.
- Pretty printers on the beta/nightly toolchains; only rustc 1.99.0 stable was loaded.
- Anything about C/C++ targets; this spike used a Rust binary only.

## Gotcha found while building this

`mktemp -d` yields `/var/folders/…`, which is a symlink to `/private/var/folders/…`. LLDB canonicalises the DWARF source path, so `setBreakpoints` sent with the `/var/…` path never verifies. Resolve the project directory with `realpath` before launching, or every breakpoint stays pending.
