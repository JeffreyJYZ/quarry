# LSP feature audit (Rust backend)

Scope: `src-tauri/src/lsp/*`. Requests, params, and response parsing checked against LSP 3.17.

## Findings

### P2 — `uri_to_path` fails to decode a percent-escape at the end of a URI

- File: `src-tauri/src/lsp/position.rs:55-73` (`uri_to_path`)
- Bug: loop guard `bytes[index] == b'%' && index + 2 < bytes.len()` requires `index + 2` to be strictly less than length, so a `%XX` whose last byte sits at `index + 2 == len - 1` is skipped. The `%` and the two hex digits are then emitted literally; `String::from_utf8` may still succeed on ASCII hex, producing a wrong path, or the result is rejected. Servers that percent-encode the final character of a path return locations/edits the IDE cannot resolve.
- Fix: change guard to `index + 3 <= bytes.len()`.

### P3 — `lsp_change_document` no-op path keeps stale state on identical input

- File: `src-tauri/src/lsp/impl_lspstate.rs:105-115`
- Detail: when `old_text == text` the handler re-inserts the existing version and returns without `didChange`; `document_ends` is not refreshed. Content identical so low impact, but a forced resync after a server-side reload sends nothing.
- Fix: acceptable as-is; document intent or refresh ends.

### P3 — `runFlycheck` is sent to every server on open

- File: `src-tauri/src/lsp/impl_lspstate.rs:79-93`
- Detail: `workspace/executeCommand` with `rust-analyzer.runFlycheck` is emitted (notification, id stripped) to clangd and others. Unknown command; ignored but may log an error.
- Fix: gate on `session.server == "rust-analyzer"` before sending.

## Checked, no issue

- Method names all match LSP 3.17: hover, definition, references, implementation, typeDefinition, completion, documentSymbol, documentHighlight, rename, codeAction, signatureHelp, inlayHint, semanticTokens/full, prepareCallHierarchy, prepareTypeHierarchy, callHierarchy/incomingCalls|outgoingCalls, typeHierarchy/supertypes|subtypes, workspace/symbol, workspace/executeCommand, didOpen/didChange/didClose/didSave.
- Params: position params carry textDocument.uri + position; references adds context.includeDeclaration; completion adds context.triggerKind: 1; codeAction carries range + context.diagnostics; rename carries newName. Null results handled.
- Versioning: didOpen version 1, didChange increments and sends version in textDocument. Both full-sync and incremental branches include version.
- Incremental change range computed in UTF-16 units with surrogate-pair floor boundary; replacement text is the suffix after the first differing code unit.
- path_to_uri/uri_to_path round-trip apart from the trailing-escape guard above; file:/// form correct because absolute paths begin with /.
- Response parsing: locations handle Location and LocationLink; hover flattens string/Markup/MarkedString/array; symbols handle both DocumentSymbol and SymbolInformation; workspace edits handle both changes and documentChanges including nested textEdit.
- workspace/configuration answered with one null per requested item.
- Semantic token data parsed in delta form; unknown type index yields empty kind.

## Out of scope / not checked

- Frontend UTF-16 position computation and CodeMirror to LSP coordinate conversion (backend only forwards u32).
- LSP capability negotiation beyond the advertised minimal set.
- rust-analyzer/clangd method availability at specific versions.

## Deep layer: literal request shapes vs LSP 3.17

### `position_params` (hover, definition, implementation, typeDefinition, documentHighlight, signatureHelp, completion? no)

```
{ "textDocument": { "uri": "file:///..." }, "position": { "line": L, "character": C } }
```

Conforms. `textDocument` omits `version`, allowed. Character interpreted by server as UTF-16.

### `completion_params`

```
{ "textDocument": {...}, "position": {...}, "context": { "triggerKind": 1 } }
```

Conforms (triggerKind 1 = Invoked). Does not set `triggerCharacter`. For manual invocation that is correct. `completionItem.snippetSupport: false` advertised; insertText preferred insertion behavior default. Fine.

### `references_params`

adds `context: { includeDeclaration: true }`. Conforms.

### `lsp_rename`

```
{ "textDocument": { "uri" }, "position": {...}, "newName": "..." }
```

Conforms. No version field; allowed.

### `lsp_code_actions`

```
{ "textDocument": { "uri" }, "range": {start,end same position}, "context": { "diagnostics": [] } }
```

Conforms. Zero-width range and empty diagnostics is valid. clangd answers quickfixes whose diagnostic range matches; passing an empty diagnostic list can still yield source actions? clangd's `textDocument/codeAction` filters actions to given diagnostics, so with `[]` only `source.*`/refactor actions that do not bind to a diagnostic will return. A real quickfix tied to a diagnostic needs that diagnostic in context. rust-analyzer similarly. Severity: if frontend always passes [], quickfix-by-diagnostic actions are missed unless frontend supplies diagnostics. This is a backend API limitation: `lsp_code_actions` has no diagnostics parameter. P2.

### `lsp_symbols` (documentSymbol)

```
{ "textDocument": { "uri" } }
```

Conforms.

### `lsp_workspace_symbols`

```
{ "workspace/symbol", { "query": "..." } }
```

Conforms. Empty query returns workspace symbols for some servers, none for others; acceptable.

### `lsp_semantic_tokens`

```
{ "textDocument": { "uri" } }
```

Conforms. Server returns `{ data, resultId? }`. Backend reads `result.data` only and loses `resultId`, so `textDocument/semanticTokens/full/delta` cannot be used; full re-request each time. Not a correctness failure. clangd and rust-analyzer both need `Capabilities.semanticTokens.tokenTypes` legend; advertised in initialize capabilities. Conforms.

### `lsp_inlay_hints`

```
{ "textDocument": { "uri" }, "range": {start 0:0, end document_end} }
```

Conforms. `document_end` computed in UTF-16 units. Correct.

### `lsp_signature_help`

```
{ "textDocument", "position" }   // no context
```

Conforms (`triggerKind`/`isRetrigger` optional). clangd and rust-analyzer both answer. Good.

### `lsp_implementation` / `lsp_type_definition`

```
same as position_params
```

Conforms.

### call hierarchy

prepare: position_params -> CallHierarchyItem[].
incoming/outgoing: `{ "item": <raw item> }`. Conforms. Item echoed verbatim including `data`, required for clangd's USR and rust-analyzer's internal id. Good.

### type hierarchy

prepare: position_params -> TypeHierarchyItem[].
supertypes/subtypes: `{ "item": ... }`. Conforms. Backend prefers cached raw item (with data), fallback rebuilds minimal item (no `data`) which may fail to resolve subsequent parents. P3 for rebuild path.

### initialize

```
{ processId, rootUri, capabilities, workspaceFolders }
```

`capabilities` includes hover contentFormat, completion snippetSupport false, definition linkSupport true, semanticTokens requests full/range false + types/modifiers + formats relative. No `textDocument.synchronization` capability advertised. LSP allows, but servers may default to full sync; backend always sends both full and incremental delta forms regardless. rust-analyzer treats incremental if client advertises `textDocument.synchronization.didChange` supported? Actually didChange is sent by client; server adapts to notification, but without `change` capability in initialize, some strict servers (clangd) may assume full document on every change and mis-apply incremental ranges as full text, causing corruption. clangd does support incremental if `textDocument.synchronization.change` includes Incremental. Since not advertised, risk. P1-ish (mostly advisory; clangd defaults incremental anyway). Fix: advertise `textDocument.synchronization = { didSave: true, willSave: false, willSaveWaitUntil: false, dynamicRegistration: false, change: 2 }` and `textDocument.didSave.includeText` optional. At minimum set change: 2.

### didOpen

includes languageId. Conforms.

### didChange incremental

range start/end in UTF-16; replacement text is suffix from first differing UTF-16 position. If first differing char is mid-surrogate (emoji high surrogate changed), floor_char_boundary steps back to preceding boundary; comment says UTF-16 boundary. Actually LSP positions are UTF-16 code units, so if high surrogate differs we already floor? Condition increments p by UTF-16 width, and surrogate pair counted as 2; if high surrogate same but low differs, p advances by 2 together? Wait loop compares old_u[p] == new_u[p] code unit by code unit; if high surrogate equal and low surrogate differs, loop exits with p at high surrogate position (not between), so fine. The between-halves case only happens if first differing code unit is the low surrogate while high surrogates equal? They can't differ only in low while high equal? Actually replacing 😀 with 😁: high surrogates differ (😀 high D83D, 😁 high D83D same! low surrogates differ DE00 vs DE01). Loop exits at low surrogate index p=2? old_u = [D83D, DE00], new_u = [D83D, DE01]; loop: p=0 equal (D83D), p=1 unequal → p=1. floor_char_boundary(old,1): char 😀 width2, count+2 >1 -> returns 0. So range starts at char before emoji, replacement text new_u[0..]="😁" (wait new_u[p..] with p=0 = "😁"), replacing "😀" (old_u[0..]=😀). Correct, because range start 0 end 2. Good.

### didSave

```
{ "textDocument": { "uri" } }   // no text, no version
```

Conforms; text optional. rust-analyzer triggers flycheck on didSave. Good.

## Response readers — assumed-present fields

- parse_hover: requires `contents` key; if missing returns None (result.get("contents")?). Good. MarkupContent `value` missing -> empty.
- parse_locations: single object path uses parse_location requiring uri or targetUri; returns None if absent -> skipped. Good. range fallback to 0.
- parse_symbols: SymbolInformation path requires location.range; if missing skipped. DocumentSymbol requires name+range. Good.
- parse_document_highlights: requires range start/end as objects. Good.
- parse_inlay_hints: position required with line/character numbers (strict, drops hint if absent). Good.
- parse_completion: isNull handling? `parse_completion` match result; Null arm falls into `_ => (empty, false)`, returns empty list not None. Fine.
- parse_signature_help: requires signatures array via `?` -> returns None if missing? Actually `result.get("signatures").and_then(as_array)?` returns None if absent. Good.
- parse_code_actions: expects array; if object returns empty. Standard servers return array.
- parse_workspace_symbols: requires location.uri; entries without skipped.
- parse_workspace_edit: handled.

## UTF-16 boundary conclusions

- Backend simply forwards L/C to servers. `document_end`, `incremental_range`, offset conversion use UTF-16. Rust `str::encode_utf16` correct.
- Position decoding from server responses uses u64->u32 no conversion; fine.
- Path URI decoding off-by-one can shift which file a location points to (P2).
- CodeMirror toLspPosition appears to compute character as `pos-line.from` where pos is CodeMirror's UTF-16-ish offset; CodeMirror's line positions are UTF-16 code units, so matches LSP. Fine.

## Additional functional risks

- `textDocument/codeAction` with diagnostics [] may suppress quickfixes (P2 above).
- initialize lacks synchronization capability (P1 recommendation).
- `uri_to_path` trailing percent decode (P2).
