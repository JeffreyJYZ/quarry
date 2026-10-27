# `evaluate` contexts: measured, per language

`dap_evaluate` sends DAP `evaluate` for the dock's Evaluate expression field. Which `context` to send,
and whether the field can work at all for Rust, was open: `docs/spikes/dap.md` recorded
(`evaluate` is broken for Rust, 2026-10-22) that every variant failed. That verdict is wrong today,
and wrong for a reason worth knowing: **those requests carried no `frameId`.**

Reproduce everything below with `bun run scripts/dap-eval-contexts.ts` (exit 0 = every attempt
answered with a value or with a message, and the UI's default context evaluated every expression to
its expected value). The script builds one CMake C project (`-DCMAKE_BUILD_TYPE=Debug`) and one cargo
project under `$TMPDIR`, stops each on a line breakpoint, and speaks raw Content-Length framed DAP.

| Item               | Value                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Adapter            | `/Applications/Xcode.app/Contents/Developer/usr/bin/lldb-dap` (`xcrun --find lldb-dap`)                    |
| Adapter version    | LLVM 21.0.0, `liblldb: lldb-2103.0.34.103`, Apple Swift 6.4 toolchain                                      |
| C target           | `cmake` 4.x from Homebrew, `-DCMAKE_BUILD_TYPE=Debug`, stopped at `main.c:4` (`int sum = a + b;`)          |
| Rust target        | rustc from `/opt/homebrew/opt/rustup/bin`, cargo `build` (debug), stopped at `black_box((&v, &s, n, tag))` |
| Rust init commands | `command script import <sysroot>/lib/rustlib/etc/lldb_lookup.py`, the session default                      |
| Request shape      | `{"expression": …, "context": …, "frameId": <top frame of the stop>}`                                      |

Values are verbatim from the adapter's `result` and `type` fields. Addresses are absent; nothing here
is ASLR-dependent.

## Context × language

Rust locals at the stop: `n: u32 = 4` (`v.len()` with a 4-byte `v`), `s = "quarry"`.

| Context     | C `a`                  | C `a + b`              | Rust `n`                | Rust `n + 1`            | Rust `s`                                        |
| ----------- | ---------------------- | ---------------------- | ----------------------- | ----------------------- | ----------------------------------------------- |
| `watch`     | `2` : `int`            | `5` : `int`            | `4` : `unsigned int`    | `5` : `unsigned int`    | `"quarry"` : `alloc::string::String`            |
| `variables` | `2` : `int`            | `5` : `int`            | `4` : `unsigned int`    | `5` : `unsigned int`    | `"quarry"` : `alloc::string::String`            |
| (omitted)   | `2` : `int`            | `5` : `int`            | `4` : `unsigned int`    | `5` : `unsigned int`    | `"quarry"` : `alloc::string::String`            |
| `repl`      | `(int) $0 = 2` : `int` | `(int) $1 = 5` : `int` | `(unsigned int) $0 = 4` | `(unsigned int) $1 = 5` | `(alloc::string::String) $2 = "quarry" {` … `}` |

The same five expressions with `context: "watch"` but no `frameId` in the request — every one, on both
languages:

```text
error: evaluate failed: can't evaluate expressions when the process is running.
```

The adapter's message is the bare `can't evaluate expressions when the process is running.`; the
`evaluate failed:` prefix is quarry's own (`request` in `impl_session.rs`).

Three measured facts:

1. **`watch`, `variables` and an omitted `context` all work, on both languages.** The value is the
   bare rendering, the type arrives in the adapter's `type` field, and the rustup `lldb_lookup.py`
   providers are what turn `s` into `"quarry"` instead of a raw struct — that formatter line is
   already a session default (`docs/spikes/dap.md`, "Ship `initCommands` as a default").
2. **`repl` works but is the wrong thing to render.** It prefixes lldb's REPL variable number
   (`(int) $0 = 2`) and, for a container, appends the child expansion on further lines:
   `(alloc::string::String) $2 = "quarry" {` `[0] = 'q'` … `}`. A single-line field would show all
   of it.
3. **Omitting `frameId` is not "use the top frame".** The same request without it fails for C and
   Rust alike with `can't evaluate expressions when the process is running.`, even though the program
   is stopped. That is the whole of the 2026-10-22 failure: shape, not language support.

## What the UI sends

- **Default context: `watch`.** `DEFAULT_EVALUATE_CONTEXT` in `src-tauri/src/dap/dap_evaluate.rs`,
  asserted by the script. It renders the value alone and leaves the type to its own field.
- **`frameId` is always sent** when the dock has one: `StopView.frameId`, else the top frame's id. The
  field is disabled until a frame exists, so the field never provokes the "process is running" reply
  in normal use — but that reply is what a caller without a frame id gets, and it is shown verbatim.
- **`context` is validated against `watch`, `repl`, `hover`, `clipboard`, `variables`**; anything else
  is an error naming the accepted set. `hover` and `clipboard` were not exercised here — the measured
  claim covers `watch`, `repl`, `variables` and the omitted case only.
- **A refusal is shown, never swallowed.** `evaluation_from` rejects a body with no `result` string,
  and an adapter failure reaches the field as the adapter's own message in the danger colour. There is
  no path that renders an empty success.

## Rust verdict

**Rust expression evaluation works on this machine today** — `n`, `n + 1` and `s` all evaluate in
`watch`, and `s` uses the rustup formatter. The earlier "broken for Rust" verdict was measured with
requests that omitted `frameId`; the language was never the problem.

## Unverified

- `context: "hover"` and `context: "clipboard"`; only `watch`, `repl`, `variables` and omitted were run.
- Enumerations, closures, `&mut` borrows and expressions with side effects (`x += 1`) — none attempted.
- Any adapter other than Xcode's LLVM 21.0.0 `lldb-dap`.
- Whether a stale `frameId` from a previous stop errors or answers about the older frame: the dock
  drops its answer when the stop changes, so it never sends one.
