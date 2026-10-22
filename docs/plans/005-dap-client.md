# Debugger session core

Parent plans: [`001-clion-parity.md`](001-clion-parity.md) §6, [`003-diagnostics.md`](003-diagnostics.md).
Measurement basis: [`dap.md`](../spikes/dap.md).

## Goal

A `lldb-dap` session the UI can drive: launch a built binary, set line breakpoints, run, stop, walk
threads, frames, scopes and variables, read memory, disassemble, and arm a hardware watchpoint. No
debugger UI in this slice — the commands and events only.

## Anatomy of a session

1. `dap_launch` spawns `lldb-dap` with `realpath`'d cwd, sends `initialize`, then `launch` with
   `{ program, args, cwd, stopOnEntry, initCommands }`, and waits for the `initialized` event. It does
   not send `configurationDone`.
2. The caller sets breakpoints, then calls `dap_configuration_done`; the adapter runs and emits `stopped`.
3. Every later command is one DAP request correlated by `seq`, with a 20 s timeout.

Passing the Rust formatter entry in `initCommands` is mandatory — without it `Vec`/`String` arrive as raw
structs, silently.

## Contracts

Commands live in `src-tauri/src/dap.rs` and are registered in `lib.rs`; types (`LaunchConfig`,
`DapSession`, `DapThread`, `DapFrame`, `DapScope`, `DapVariable`, `DapBreakpoint`, `MemoryDump`,
`DisassembledInstruction`, `DataBreakpointInfo`, `DapStoppedEvent`) live in `types.rs` and are frozen.

Events: `dap://stopped` (`DapStoppedEvent`), `dap://terminated` (`{ session }`).

Rules carried from the spike:
- `dataId` arrives without `0x`; pass it through untouched, `accessType: "write"`.
- `hitBreakpointIds` is null on a watchpoint stop — attribute by `description` and address.
- Do not gate memory or disassembly on `supportsMemoryReferences`.
- No `evaluate`: it falls back to Objective-C++ and errors on Rust.
- Watchpoint stops report the line after the store; the UI draws the stop where the adapter says.

## Next slice

Debugger UI: launch bar, breakpoint gutter, frames, variables tree, memory hex pane with paged unmapped
regions, disassembly pane, watchpoints. That slice owns the frontend; this one owns only the session.
