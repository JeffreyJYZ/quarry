# Audit: caret and scroll position per buffer

- **Scope**: `/Users/jyz/dev/monorepos/quarry`, read-only.
- **Outcome**: no per-buffer view state exists anywhere; all position data lives in the single
  `EditorView`. Switching buffers repaints that view with a different document and loses caret +
  scroll.

## Findings

### P1 — `FileBuffer` carries text only, no caret/scroll

- `src/lib/project/buffer.ts` 1-16: `FileBuffer = { path, name, text, loaded }`. No `caret`, no
  `scroll`, no saved view. Every open buffer is position-blind by construction.

Because the shell keeps one `EditorView` for the surface's lifetime (`useEditorMount.ts` builds it
once per mount, destroys on unmount), position is implicit in the view. Nothing snapshots it when
the active buffer changes.

### P1 — Switching tabs replaces the doc in place and drops position

- `src/ui/app/useWorkspace.ts` 94-97: `openPath` of an already-open path does `setActivePath(path)`
  only, which becomes a new `active` buffer in `EditorStage`. `useDocumentSync.ts` 21-28 then
  dispatches `changes: { from: 0, to: doc.length, insert: value }` for the new text.
- `useEditorEffects.ts` has no effect that restores a saved caret/scroll. The dispatch above leaves
  selection clamped to the new doc's end (or start) and the viewport at its default, so the caret
  and scroll offset from the previous file do not carry over — and, being one view, the previous
  file's position was never recorded before it was overwritten.
- This is the core lost-position transition: "switch tabs, positions forget".

### P1 — Reopening a file already open does not preserve its position either

- `useWorkspace.ts` 94-97 sets `activePath` to an existing path but reads no view state, because
  none is stored; the view keeps whatever it had from the buffer it was just showing (usually
  position 0 territory). So the user's prior caret in that file is gone.

### P2 — Closing a tab remembers content only, not position

- `src/lib/editor/closedTabs.ts` 7-27: `rememberClosed` stores the whole `FileBuffer`, and
  `FileBuffer` has no position, so reopen restores text but resets caret/scroll to 0.
- `useTabClose.ts` 37-39 picks a neighbour and `setActivePath(...)`, again no restore.

### P2 — Revealing a search hit works, but only via token; it does not scroll-into-view persist

- `useFileNavigation.ts` 35-44 `openMatch`: when the path differs it calls `openPath` and bumps
  `revealToken`; `useEditorEffects.ts` 114-129 moves caret + `scrollIntoView`. Fine for hits.
  But after that, switching away and back does not remember the revealed spot, only the token of the
  last reveal (single slot in state, not per buffer).

### P3 — Relaunch persistence

- `savePaths`/`recentFiles` persist paths only (see `useWorkspace` 92-93, 180-185). No cursor or
  scroll persisted anywhere. So a relaunch opens files at 0. No per-file view state in any storage.

### What works

- `reveal` path does scroll the caret into view (`useEditorEffects.ts` 114-129).
- Closed-tab reopen retains edits (`closedTabs.ts` 12-14).
- Tab activation clears reveal (`tabs.activate` → `clearReveal`), sensible.

## Concrete fix sketch

1. Extend `FileBuffer` with optional `caret: number` and `viewState`/`scroll` (or a CM
   `EditorState` snapshot handle).
2. In `useEditorEffects` (or a new effect keyed by `activePath`), before the doc swap, read
   `view.state.selection.main.head` and viewport top; write into the buffer keyed by the previous
   path. Then on load, dispatch a transaction restoring selection + `EditorView.scrollIntoView`.
   Best done via a `Map<path, { selection, scroll }>` updated from an `UpdateListener`, since CM
   `EditorState` is serialisable.
3. `openPath` already-open path: restore that buffer's position instead of leaving the view as-is.
4. `closedTabs`: keep the captured position in `FileBuffer`; `reopen` applies it via the same path.
5. Relaunch: persist view state alongside `savePaths` (or accept lost-on-relaunch as a non-goal,
   but document it).

## Cleared

- No hidden per-buffer state in `localStorage`/`sessionStorage` (only commit draft/history) — so
  position truly is not saved; nothing to rescue.
- `EditorView` is genuinely one instance (one mount/unmount); no duplicate view cache.
- `revealTarget`/`revealToken` mechanism exists and is the one position-restoring code path.

No gate run, no build, no edit performed.
