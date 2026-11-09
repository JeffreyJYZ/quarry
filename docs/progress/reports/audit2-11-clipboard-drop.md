# audit2-11-clipboard-drop

Read-only audit: clipboard, paste, file drop.

## P0 dropped file navigates away from app

- `src-tauri/tauri.conf.json:12-24` window has no `dragDropEnabled` set; no handler anywhere prevents default or reads dropped paths.
- Search `src` for `tauri://file-drop`, `onDrop`, `handleDrop` → none.
- No global `dragover`/`drop` `preventDefault`. Result: dropping a file onto the window is handled by the webview, which opens/navigates the file, leaving the app blank. Any `openFile` entry (`FileTree`, `useFileTree`) is never reached from a drop.

Fix: Either disable drag-drop in the window config or add a global handler doing `preventDefault` on `dragover`/`drop`, plus a `tauri://file-drop` listener that calls the existing `openFile` path for each dropped path.

## P1 tree has no "Copy path"

- `src/ui/components/TreeContextMenu.tsx:29-48` items are Open, New file, New folder, Rename, Delete, Restart language server. No copy-path item. `navigator.clipboard.writeText` is used in git rows and others but not here. Users asking to copy a path from the tree are left without a native path.

Fix: add `{ label: "Copy Path", onSelect: () => void navigator.clipboard.writeText(entry.path) }`.

## P2 editor paste of a huge string has no cap

- Editor is CodeMirror with no size guard found; pasting a multi-MB blob inserts it directly into the document and triggers syntax highlighting/reparse. No `maxPaste` or length check.

Fix: CodeMirror's default behavior accepts it. Add a transaction filter or size threshold if desired; at minimum measure.

## P3 search field paste

- `src/ui/search/SearchHead.tsx:29` and `SearchReplace.tsx:32` use plain `<input>` with no paste handler. Browser default applies; large paste runs full search per keystroke debounced? Not verified.

## Cleared

- Clipboard API calls guard `navigator.clipboard !== undefined` in several places (`useRunProcess.ts`, `TestRow.tsx`).
- No `onPaste` interception in editor; relies on CodeMirror.
- No drag handlers anywhere: root cause is absence, not partial handling.
- `preventDefault` used appropriately for context menus.
