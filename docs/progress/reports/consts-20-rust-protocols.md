# consts-20: Rust protocol modules

Scope: `src-tauri/src/lsp`, `dap`, `pty`, `watch`. Read-only scan.

## Named constants already (keep)

- `lsp/handshake_timeout.rs`: `HANDSHAKE_TIMEOUT` 20s, `STDERR_WAIT` 500ms, `STDERR_MESSAGE_LIMIT` 2000, `REQUEST_TIMEOUT` 20s, `INITIALIZE_ID` 1, `SHUTDOWN_ID` 2, `FIRST_REQUEST_ID` 100.
- `lsp/lsp_navigation.rs`: `IMPLEMENTATION_METHOD`, `TYPE_DEFINITION_METHOD`.
- `lsp/typehierarchynode.rs`: `PARENT_KEYS`, `CHILD_KEYS`.
- `dap/adapter.rs`: `ADAPTER` "lldb-dap", `REQUEST_TIMEOUT` 20s, `PUMP_POLL_INTERVAL` 250ms, `INITIALIZE_SEQ` 1, `SESSION_SEQ` 2, `FIRST_REQUEST_SEQ` 3.
- `dap/pump_events/mod.rs`: `DEFAULT_OUTPUT_CATEGORY` "stdout".
- `dap/dap_evaluate.rs`: `EVALUATE_CONTEXTS`, `DEFAULT_EVALUATE_CONTEXT`.
- `pty/output_event.rs`: `OUTPUT_EVENT` "pty://output", `EXITED_EVENT` "pty://exited", `BUF_SIZE` 8192.
- `pty/utf8_stream.rs`: `MAX_TAIL` 3 (private).
- `watch/handle.rs`: `DEBOUNCE` 250ms.
- `watch/changed.rs`: `FsChangedEvent::NAME` "fs://changed".
- `watch/excluded.rs`: `EXTRA_EXCLUDED` ["build"].
- `ignore.rs`: `DIRS`, `DIR_PREFIXES`, `FILES`.

## Bare literals to name (appear 2+ times)

- LSP method strings repeated: "textDocument/didOpen", "textDocument/didChange", "textDocument/didClose", "textDocument/didSave", "workspace/executeCommand", "textDocument/publishDiagnostics", "workspace/configuration", "textDocument/semanticTokens/full", "textDocument/hover", "textDocument/definition", "textDocument/references", "textDocument/completion", "textDocument/documentSymbol", "textDocument/inlayHint", "textDocument/signatureHelp", "textDocument/documentHighlight", "workspace/symbol", "workspace/didChangeWatchedFiles", "textDocument/prepareTypeHierarchy", "textDocument/prepareCallHierarchy". Only `IMPLEMENTATION_METHOD`/`TYPE_DEFINITION_METHOD` named. Recommend naming each used in 2+ call sites.
- DAP command strings repeated: "setBreakpoints" (2x), "continue", "threads", "scopes", "variables", "evaluate", "stackTrace", "next"/"stepIn"/"stepOut". Bare.
- Event strings bare: "dap://stopped", "dap://terminated", "dap://output", "lsp://diagnostics", "lsp://session-ended". pty/watch events named.
- `Duration::from_millis(10)` bare in `lsp/start_lsp.rs:92` (in-flight spin) and `dap/tests_5.rs` (TEST_POLL). LSP handshake uses named; this one unnamed.
- `Duration::from_millis(250)` named in adapter/handle; bare in `coalesce.rs:51` (wait fallback) and coalesce tests.
- `Duration::from_secs(20)` named in both LSP and DAP `REQUEST_TIMEOUT`; consistent.
- `Duration::from_millis(500)` named `STDERR_WAIT`; no bare reuse found.
- `Duration::from_millis(60)`, `40`, `1` only in tests.
- `8192` BUF_SIZE named; `2000` STDERR limit named.
- `rows: 24, cols: 80` bare default in `pty/spawned_child.rs` test only.
- Env var names: `SHELL`, `COMSPEC`, `TERM`, `COLORTERM`, `LANG`, `LC_ALL` bare string literals in `pty/shell_program.rs` and `output_event.rs`. `CI` in lsp tests. Consider constants but low value.
- `ignore::DIRS` named; `EXTRA_EXCLUDED` adds "build". `cmake-build-` prefix named.
- Numeric caps: `next_call_hierarchy_id: u32`, `next_request_id` start at `FIRST_REQUEST_ID` 100 (named). `AtomicU64` counter starts 0.

## Recommendations

Name method/event strings that appear in 2+ non-test call sites (LSP didOpen/didChange/didClose/didSave, executeCommand, publishDiagnostics, DAP setBreakpoints/continue/threads). Leave one-off strings. Name the 10ms in-flight spin and the 250ms coalesce fallback. Env keys stay literals (read once). No padding.
