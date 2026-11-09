# `evaluate` contexts: measured, per language

`dap_evaluate` sends DAP `evaluate` for the dock's Evaluate expression field. Two readings of this
used to fight each other in the repository: `docs/spikes/dap.md` recorded that every variant failed
for Rust (2026-10-22), while the shipped Evaluate field answers. Both were measured, of different
requests. The difference is neither the language nor the context. It is two things:

1. whether the request carries the stopped frame's `frameId`;
2. whether the expression is Rust syntax lldb's parser accepts.

Reproduce everything below with `bun run scripts/dap-eval-contexts.ts` (exit 0 = every attempt
answered with a value or with a message, and the UI's default context evaluated every expression to
its expected value). The script measures each variable in a fixed order. It builds one CMake C
project (`-DCMAKE_BUILD_TYPE=Debug`) and one cargo project under `$TMPDIR`, stops each on a line
breakpoint, and speaks raw Content-Length framed DAP.

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

## The frame id is the precondition, not the language

Each row is a fresh lldb-dap session on a freshly stopped process, so the first request's shape is
the only variable:

| Request                                                  | C `a`                                                            | Rust `n`                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| no `frameId`, as the **first** request on the fresh stop | `error: can't evaluate expressions when the process is running.` | `error: can't evaluate expressions when the process is running.` |
| the same session, with the stop's `frameId`              | `2` : `int`                                                      | `4` : `unsigned int`                                             |
| no `frameId`, **after** a successful frame-id request    | `error: can't evaluate expressions when the process is running.` | `error: can't evaluate expressions when the process is running.` |
| `frameId`, after the session had just refused a request  | `2` : `int`                                                      | `4` : `unsigned int`                                             |

So the refusal comes from the missing `frameId`, not from state drift and not from the language: it
happens as the first request on a stopped process, it survives successful requests, and a request
with the frame id works in the very session that just refused one. Omitting `frameId` is not "use
the top frame". The adapter's message is the bare `can't evaluate expressions when the process is
running.`; the `evaluate failed:` prefix is quarry's own (`request` in `impl_session.rs`).

## Context × language

Rust locals at the stop: `n: u32 = 4` (`v.len()` with a 4-byte `v`), `s = "quarry"`.

| Context     | C `a`                  | C `a + b`              | Rust `n`                | Rust `n + 1`            | Rust `s`                                        |
| ----------- | ---------------------- | ---------------------- | ----------------------- | ----------------------- | ----------------------------------------------- |
| `watch`     | `2` : `int`            | `5` : `int`            | `4` : `unsigned int`    | `5` : `unsigned int`    | `"quarry"` : `alloc::string::String`            |
| `variables` | `2` : `int`            | `5` : `int`            | `4` : `unsigned int`    | `5` : `unsigned int`    | `"quarry"` : `alloc::string::String`            |
| `hover`     | `2` : `int`            | operators refused      | `4` : `unsigned int`    | operators refused       | `"quarry"` : `alloc::string::String`            |
| `clipboard` | `2` : `int`            | `5` : `int`            | `4` : `unsigned int`    | `5` : `unsigned int`    | `"quarry"` : `alloc::string::String`            |
| (omitted)   | `2` : `int`            | `5` : `int`            | `4` : `unsigned int`    | `5` : `unsigned int`    | `"quarry"` : `alloc::string::String`            |
| `repl`      | `(int) $0 = 2` : `int` | `(int) $1 = 5` : `int` | `(unsigned int) $0 = 4` | `(unsigned int) $1 = 5` | `(alloc::string::String) $2 = "quarry" {` … `}` |

`hover` refuses an operator in either language — `<'+' (plus)> is not allowed in DIL legacy mode` —
while a bare variable and a `String` answer. Three measured facts:

1. **`watch`, `variables`, `clipboard` and an omitted `context` answer every expression, on both
   languages.** `hover` answers a bare variable but runs lldb's legacy expression mode, which refuses
   operators. The value is the bare rendering and the type arrives in the adapter's `type` field.
   The rustup `lldb_lookup.py` providers are what turn `s` into `"quarry"` instead of a raw struct —
   that formatter line is already a session default (`docs/spikes/dap.md`, "Ship `initCommands` as a
   default").
2. **`repl` works but is the wrong thing to render.** It prefixes lldb's REPL variable number
   (`(int) $0 = 2`) and, for a container, appends the child expansion on further lines:
   `(alloc::string::String) $2 = "quarry" {` `[0] = 'q'` … `}`. A single-line field would show all
   of it.
3. **The context is not the cause of any failure that matters here.** Every failure measured is the
   missing `frameId`, Rust syntax lldb will not parse, or `hover`'s legacy mode refusing an operator.

## Rust syntax: a subset, not the language

Measured with the frame id attached, `watch` context:

| Expression   | Result                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------- |
| `n`          | `4` : `unsigned int`                                                                         |
| `n + 1`      | `5` : `unsigned int`                                                                         |
| `s`          | `"quarry"` : `alloc::string::String`                                                         |
| `v[0]`       | `'\xde'` : `unsigned char`                                                                   |
| `v.len()`    | falls back to Objective-C++, errors (`called object type 'unsigned long' is not a function`) |
| `tag as u32` | falls back to Objective-C++, errors (`expected ';' after expression`)                        |

A method call and an `as` cast both produce the adapter's own header:

```text
Expression evaluation in Rust not supported. Falling back to default language. Ran expression as 'Objective C++'.
```

That string is what the 2026-10-22 verdict quoted for the whole language. It is a parser gap, not a
language-support gap: locals, arithmetic, field and index access all answer. Do not promise arbitrary
Rust expressions in a watch pane; do offer the field.

## What the UI sends

- **Default context: `watch`.** `DEFAULT_EVALUATE_CONTEXT` in `src-tauri/src/dap/dap_evaluate.rs`,
  asserted by the script. It renders the value alone and leaves the type to its own field.
- **`frameId` is always sent** when the dock has one: `StopView.frameId`, else the top frame's id. The
  field is disabled until a frame exists, so the field never provokes the "process is running" reply
  in normal use — but that reply is what a caller without a frame id gets, and it is shown verbatim.
- **`context` is validated against `watch`, `repl`, `hover`, `clipboard`, `variables`**; anything else
  is an error naming the accepted set.
- **A refusal is shown, never swallowed.** `evaluation_from` rejects a body with no `result` string,
  and an adapter failure reaches the field as the adapter's own message in the danger colour. There is
  no path that renders an empty success.

## Rust verdict

**Rust expression evaluation works on this machine, with two named preconditions.** The request must
carry the stopped frame's `frameId`, and the expression must be inside lldb's parser subset: `n`,
`n + 1`, `s` and `v[0]` evaluate in `watch`, `variables`, `clipboard` and the omitted context, while
`hover` takes a bare variable only; method calls (`v.len()`) and `as` casts do not parse at all.
The earlier "broken for Rust" verdict was measured with requests that omitted `frameId`, and quoted
the ObjC++ fallback of expressions lldb cannot parse; the language was never the problem, and the
parser gap is not the whole language.

## Unverified

- Enumerations, closures, `&mut` borrows and expressions with side effects (`x += 1`) — none attempted.
- Any adapter other than Xcode's LLVM 21.0.0 `lldb-dap`.
- Whether a stale `frameId` from a previous stop errors or answers about the older frame: the dock
  drops its answer when the stop changes, so it never sends one.
- `repl` with a container in the UI — measured in the script, never rendered by the field.
