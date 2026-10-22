# Plan index

The plan is one parent document and one document per slice, plus the spike that measured the debugger
adapter. Read `001` first: it defines scope, seams and the slice breakdown, and every later document
assumes it. Then read the slices in numeric order, which is also build order. The spike is last, because
it is evidence rather than direction.

| File                                                 | Decides                                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [`001-clion-parity.md`](001-clion-parity.md)         | Parent plan: what parity means, the parity matrix, Rust and frontend module seams, slices P0–P5 with estimates, risks and non-goals. |
| [`002-p0-project-model.md`](002-p0-project-model.md) | P0 slice: shell, project detection, lazy tree, tabs, editor mount. Fixes the four command contracts and the unit file sets.          |
| [`003-diagnostics.md`](003-diagnostics.md)           | Language server attach (rust-analyzer or clangd), full-document sync, diagnostics event and Problems panel, cargo build diagnostics. |
| [`004-search.md`](004-search.md)                     | Project search: ripgrep argv, result cap and truncation, palette behaviour, status bar slot.                                         |
| [`005-dap-client.md`](005-dap-client.md)             | Debugger session core: `lldb-dap` launch, breakpoints, threads, frames, scopes, variables, memory, disassembly, data breakpoints.    |
| [`006-remaining-parity.md`](006-remaining-parity.md) | Status of the daily loop, remaining gaps ranked by value, definition of done, and risks.                                             |

## Spike

| File                                   | Measures                                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`../spikes/dap.md`](../spikes/dap.md) | Xcode's `lldb-dap` against a Rust binary: memory, disassembly and data breakpoints work; Rust pretty printing needs `initCommands`; `evaluate` is broken. |
