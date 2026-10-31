# Terminal links

Scope: `src/ui/terminal/terminalLinks.ts`, `src/lib/terminal/urls.ts`, `src/ui/terminal/useXterm.ts`.

## Changes

- `urls.ts` (new): `findUrls` scans one line for `http`/`https` addresses and returns character offsets. Trailing sentence punctuation is dropped, and a closing bracket is kept only when the address itself opened it, so `(see https://a/b)` links `https://a/b` while `…/Rust_(language)` keeps the parenthesis. `www.` without a scheme, `ftp:` and a bare `http://` are not links.
- `terminalLinks.ts` (new): an xterm `ILinkProvider` registered per emulator. It walks the buffer line's cells to build the text, so a wide character (CJK, emoji) does not shift the range — a character offset and a cell offset stop agreeing after one appears.
- `useXterm.ts`: registers the provider when the emulator is created and disposes it with the emulator, so a restarted tab gets a fresh one and a closed tab leaks none.
- Activation needs Cmd (or Ctrl). A plain click stays with the terminal, which uses it for selection and for a TUI that reports its own mouse events.
- `urls.test.ts` (new): 8 cases covering offsets, ports, query strings, sentence punctuation, balanced and unbalanced brackets, two addresses on a line, and the non-links.

## Why

CLion's terminal makes a URL in output clickable; ours was plain text, so a link from a test failure or a dev server had to be copied by hand. The provider is written rather than added as `@xterm/addon-web-links` because the addon's regex is fixed and it cannot tell a cell offset from a character offset.

## Verification

- `bun check`: no type errors in 431 files.
- `bun test src/lib/terminal`: 39 pass, 0 fail.
- `bunx biome lint src/ui/terminal src/lib/terminal`: zero errors.
- Not verifiable without a running app: that Cmd-click reaches `openUrl` through the Tauri ACL. `opener:default` and `tauri_plugin_opener::init()` are both already in place (`src-tauri/capabilities/default.json`, `src-tauri/src/lib.rs`).
