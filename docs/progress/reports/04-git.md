# Source Control pane: commit recall, honest amend, diff hunk nav

## Changes

- `src/lib/git/useCommit.ts`: persist the commit draft to `localStorage` keyed by root, loaded on mount, so it survives tab switches and app restarts; keep a capped history of recent commit messages (20) with `recall("up"|"down")` and `recallIndex` for up/down-arrow recall in the textarea. `changeMessage` resets recall and saves the draft; successful commit pushes the message onto history and clears the draft.
- `src/ui/git/CommitBox.tsx`: ArrowUp/ArrowDown in the textarea drive `onRecall`; when amend mode is open with nothing staged, show an explicit notice and disable the Amend button; amend error line already prints the guard reason.
- `src/ui/git/DiffView.tsx`: scroll to the first hunk on load and add Prev/Next hunk navigation buttons with a counter; refs per hunk container.
- `src/ui/git/git.css` (new): styles for the recall hint, amend notice and hunk nav bar; imported by `CommitBox` and `DiffView`.

## Why

Commit message was `useState("")` and died on unmount, so switching tabs or restarting lost it; up-arrow recall was absent. Amend could be triggered with an empty index, silently rewriting a commit with no content. Diff opened at the top and had no way to jump between hunks.

## Verification

- `bun check`
- `bun test src/lib/git`
- `bun run scripts/unstyled-classes.ts` (0)

## Left out

- Word-level diff (per-hunk navigation chosen instead).
- Amend message-only rewrite (blocked when nothing staged, per honesty requirement).
- Stage-all/unstage-all already present with counts and clean-tree guard.
