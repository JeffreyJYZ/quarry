# consts-01-app-hooks

Area: `src/ui/app/*.ts`. Magic numbers and repeated string literals in hooks (delays, limits, retry counts, key names, event names, default sizes). Scan only; no edits.

## Magic numbers

- `20` — `src/ui/app/useFileOpening.ts:9` (`RECENTS_LIMIT`). Used once here (`:40`). Same `20` appears in other modules as unrelated caps (`HISTORY_CAP`, `DOCUMENT_CACHE_LIMIT`, `TAIL`, terminal min cols, font max). Not a shared concept; keep a named const in this file. Could optionally align with `DOCUMENT_CACHE_LIMIT` if recents are meant to mirror the document cache, but no evidence — leave as `RECENTS_LIMIT`.
- `400` — `src/ui/app/useSessionPersistence.ts:139` (`window.setTimeout(write, 400)`). One use. `400` also appears in `src/lib/editor/semanticTokens.ts:13` (`REFRESH_MS`) and `src/lib/debug/buildCommand.ts:12` (`MAX_PENDING`); unrelated. Debounce delay is this hook's detail; name it in place (`SESSION_WRITE_DEBOUNCE_MS`).
- `520` — `src/ui/app/usePanels.ts:21` (`useState(520)` disasm split width). One use; default panel size. Keep named const in place (e.g. `DEFAULT_DISASM_WIDTH`). Not duplicated (the `520` in `tooltipSpace.test.ts:5` is a test rect, unrelated).
- `2500` — `src/ui/app/useSaveBuffers.ts:10` (`SAVE_STATUS_MS`). One use (`:60`). Keep named const; no other occurrence.

## Retry counts

None found in `src/ui/app/*.ts`.

## Event names / key names / string literals

- DOM event names (`"keydown"`, `"mousedown"`, `"visibilitychange"`, `"focus"`) are standard and each appears in several hooks; no app-specific event name duplicated. Nothing to move.
- No `localStorage`/`sessionStorage`/`dispatchEvent`/`CustomEvent` usage in this directory.
- Repeated app string literals found are either import paths or command IDs already centralized (`MENU_COMMAND_IDS` in `src/lib/consts/app.ts`); not magic.
- `"user"`/`"problems"`/`"debugger"`/etc. are union literals tied to their type; single-use per file, leave.

## Already well-placed

- `RECENTS_LIMIT`, `SAVE_STATUS_MS` already named consts in-file.
- `disasmWidth` initial value `520` is the one un-named magic number worth a named const.

## Nothing worth moving

No value in this directory is duplicated in a way that warrants `src/lib/consts/*`. The four numbers above are one-file details; only `520` lacks a name.
