# consts-15: src/lib/lsp

Nothing in this area is only a repeated string inside itself except server ids and severity/file-change numbers. Protocol method names live in Rust (`src-tauri/src/lsp`), not here — nothing to name in this scope.

Repeated values:

- `served.ts`: server ids `"rust-analyzer"` and `"clangd"` written 7 times even inside this file (`ServerKind` union, `EXTENSIONS`, `isServerKind`, `serversForRoot`) and as literals in `session.ts`, `errors.ts` callers, tests. `isServerKind` repeats both arms; could be derived from an `ALL_SERVER_KINDS` array. But `ServerKind` is a string union used as map keys throughout, so the lift is cosmetic only.
- `diagnostics.ts` `countSeverities`: severity `1` and `2` are LSP `DiagnosticSeverity.Error`/`Warning`. Same numbers likely elsewhere in API layer (not scanned, out of scope). A `LSP_ERROR_SEVERITY`/`LSP_WARNING_SEVERITY` pair would name intent; today only two severities are counted and others ignored silently.
- `watchedFiles.ts`: `FileChangeKind = 1 | 2 | 3` is LSP `FileChangeType` Created/Changed/Deleted with no names.
- `served.ts`: separator `"::"` in `sessionId`/`isSessionId`, while `typeHierarchy.ts`, `requireSessionId` checks `root.includes("::")`. One shared `SESSIONSeparator`/constant would remove drift risk.
- `session.ts`: `CHANGE_DEBOUNCE_MS = 350` (named). `rootSignals.ts`: `MAX_DEPTH = 4`, `MAX_DIRS = 64`, `SKIP_DIRS` set (all named). `restart.ts`: `NO_RESTART_IN_FLIGHT = -1` (named).
- `root`/`running` context and path guards in `lifecycle.ts`, `paths.ts`: strings `"file not found"`, `"not among the indexed"`, `"file not open"`, `"document not open"` are one-off, no repeat.

Recommendation: low value; only the server-id `ALL_SERVER_KINDS` lift and severity/file-change named constants pay for themselves. Leave the rest — numbers are documented by type names and are not protocol surface here.
