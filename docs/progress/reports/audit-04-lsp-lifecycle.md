## Deeper layer

### Session transitions and child-process death

- start: process spawns during handshake; on handshake failure pipe is local and `ProcessPipe::Drop` kills child (`impl_processpipe_1.rs:146-149`).
- init ready: pump thread spawned; child owned by pipe inside Session Arc.
- ready: requests flow through pipe; child alive.
- crash / EOF: pump loop breaks at pump.rs:121 without setting dead, session stays in map, child may already be gone -> orphan entry (P1).
- stop_lsp: impl_lspstate removes entry, Session::stop sends shutdown+exit then pipe.kill (kills+waits) (`handshake_timeout.rs:128-138`).
- app quit: lib.rs run handler calls shutdown_all which drains and stops each session.
- project close: frontend useOneServer cleanup calls stopLsp per server.
- restart: token bump re-runs useOneServer cleanup then start.
- orphan transitions: pump EOF (above); in_flight stuck on direct/panic path (P2); detached pump threads never joined (harmless).

### Document map trace

- open inserts documents, document_ends, document_texts (`impl_lspstate.rs:59-64`); send didOpen.
- change updates all three (`impl_lspstate.rs:117-122`); send didChange.
- close removes all three plus didClose (`lsp_close_document.rs:53-63`).
- leak: open-then-cleanup race (P1) — open resolves after cleanup, no didClose sent.
- on session replace after crash, old session documents not individually closed; stop clears in-memory maps but sends no didClose before kill (server dead anyway).
- reopen after rename: new path not opened until editor tab changes; old path stays open on server.

### Dead session request path

- session_for passes dead check only when dead flag set (lsp_close_document.rs:82-84).
- EOF case (P1) leaves dead=false, so requests reach begin_request + pipe.send, fail on broken pipe, reported as cannot-send or 20s timeout.
- If dead were set, session_for errors "language server session ... is dead" synchronously, reported via reportNotice, faster.
