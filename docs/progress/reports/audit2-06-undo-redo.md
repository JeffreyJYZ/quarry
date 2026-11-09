# Audit: undo/redo and dirty state

Scope: `src/ui/editor/*`, `src/ui/app/useWorkspace.ts`, `src/ui/app/useDocumentSync.ts`, `src/lib/project/buffer.ts`, `src/lib/project/save.ts`, `src/ui/app/useSaveBuffers.ts`, `src/ui/app/useTabClose.ts`.

## Findings

### P1 — External document replacements are recorded as undoable edits

File: `src/ui/editor/useDocumentSync.ts:29`

```ts
view.dispatch({ changes: { from: 0, to: doc.length, insert: value } });
```

The single `EditorView` (mounted once in `src/ui/editor/useEditorMount.ts:22-46`) is reused for every tab. When the active buffer changes, `useDocumentSync` replaces the whole document through a normal change transaction, which CodeMirror's `history()` (installed in `src/ui/editor/createEditorView.ts:70`) records. Consequences:

- Switching tabs leaves the previous file's text in the undo stack; undo on the new file reverts toward the old file's content.
- A disk reload or any externally pushed `value` becomes an undo step, so undo jumps back to pre-reload text.
- The view is never destroyed on tab close, so closed-file edits remain in the shared history.

Fix: dispatch external replacements with `Transaction.addToHistory.of(false)` (import `Transaction` from `@codemirror/state`), or reconfigure the history extension / recreate the view per file. Also clear `emittedRef` handling stays as-is.

### P2 — Rename edits mark buffers dirty without a save path

File: `src/lib/refactor/apply.ts:46-49`

```ts
const nextText = applyEdits(buffer.text, fileEdit.edits);
setBuffers((current) =>
	current.map((b) => (b.path === fileEdit.path ? { ...b, text: nextText } : b)),
);
```

Only `text` is updated; `loaded` is untouched, so `isDirty` (`src/lib/project/buffer.ts:11-13`) returns true. For open files the edits are never written to disk, so the dirty flag is arguably correct; but if the rename flow is expected to persist, there is no `markSaved` call and no write. Decide and make consistent: either write + `markSaved`, or document that rename leaves an unsaved buffer.

### P2 — Duplicate tabs on one path are not possible, but histories are shared anyway

File: `src/ui/app/useWorkspace.ts:94-97`

```ts
if (buffersRef.current.some((buffer) => buffer.path === path)) {
	setActivePath(path);
	return;
}
```

Opening an already-open path activates it rather than creating a second tab, so "two tabs, one path" cannot occur. The remaining history issue is the shared single view (P1), not per-path independence.

### Cleared

- `isDirty` correctly compares `text !== loaded` (`src/lib/project/buffer.ts:11-13`).
- `markSaved` sets both `text` and `loaded` to the written text (`src/lib/project/buffer.ts:16-18`), and `saveBuffer` calls it on both success branches (`src/lib/project/save.ts:85,106`).
- `savePaths` updates the buffer with `outcome.buffer` (`src/ui/app/useSaveBuffers.ts:123-125`), so a successful save clears the dirty dot.
- `useTabClose.close` asks before closing only when `isDirty` (`src/ui/app/useTabClose.ts:44-45`); `saveClose` closes only on `ok` (`:53-54`).
- No "buffer marked clean but isn't" found in the save path.
- No "save that does not clear dirty flag" found for normal saves.

## What was cleared

Normal save flow clears dirty state correctly. Tab-close prompt uses `isDirty`. No separate reload-from-disk command exists in the app, so reload-related history leakage is limited to externally pushed values (P1). No evidence of two independent histories per path beyond the single shared view.
