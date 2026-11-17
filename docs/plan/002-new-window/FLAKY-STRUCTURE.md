# Flaky Structure Palette highlight

CI on `main` (run `44035305736`, gate at `d5091344`) failed one frontend test while the same suite is
green locally ten runs in a row:

```
(fail) the File Structure popup > opens with the caret's symbol highlighted [8.48ms]
 1436 pass / 1 fail
```

The test is `src/ui/structure/StructurePalette.test.tsx:96`. It renders with `cursor: { line: 4 }`,
`waitFor`s the text `helper` to appear, then asserts the `helper` button carries an `active` class and
`main` does not.

## What to settle, not assume

Decide which of these is true, from the component's code:

1. the highlight is applied in a state update that lands a tick after the rows, so the row can be
   visible before it is highlighted — the test then asserts a transient frame, and the honest fix is
   to wait for the settled state (and say so in the assertion, not by weakening it); or
2. the highlight is set during the same render as the rows, and something else races (the load
   resolving twice, a stale effect, a key that changes) — then the component has a real defect and
   the test is telling the truth.

Prefer fixing the cause over the assertion. If the answer is (1) and the one-frame gap is real,
consider whether the component should derive the highlight instead of setting it in an effect — a
row that appears unhighlighted and then highlights is a visible flicker, not just a test detail.

## Proof required

A fix that cannot fail before it passes is not a fix. Reproduce deterministically: whatever timing
the race depends on, force it (a `load` that resolves behind a couple of awaited ticks, a slower
scheduler, repeated runs in a loop) and show the test failing first. Then show it passing, and run
the file at least 20 times in a loop green.

## Rules

- Files: `src/ui/structure/**` only (`StructurePalette.tsx`, its hooks, its tests). No Rust, no
  `src/lib/**`, no other surface.
- No file over 200 lines, tests included. Tabs 4 wide, print width 100; `bun fmt` then
  `bun fmt --check`.
- `rg` / `fd` / `bun`; `bun test <path>` for the file, `bun check`, `bunx biome lint .`,
  `bun scripts/check-file-size.ts`.
- Never launch the app, never use `agent-desktop`, never move the user's cursor.
- No push, tag, release, PR or `bun run gate`. Commit on your branch.
- Write files as you go; do not paste file contents into your reply. Final message: at most 150
  words plus the failing-then-passing output.
