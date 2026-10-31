# Run dock fixes

## Changes

- `src/lib/run/useRunProcess.ts` start/stop: clear dead-process state on run; immediate running reset on stop; ref tracking for output filtering.
- `src/lib/run/exitStatus.ts` (new): distinct text for killed, signal (null code), success, failure.
- `src/ui/run/RunLog.tsx`: use exitStatus; show cwd in head; keep exit line.
- `src/ui/tests/RunDock.tsx`: show program/args/cwd summary before launch and when idle.
- `src/lib/run/targets.ts`: documented session-stick behavior (no mtime available; rejected newest-artefact picker).

## Verification

- bun check (scoped to changed files: 41 files, 0 errors; full project check blocked by unrelated in-progress `src/ui/editor/useEditorContextMenu.ts`)
- bun test src/lib/run (49 pass, 0 fail)
- bun run scripts/unstyled-classes.ts (0 of 116)

## Rejected ideas

- Target picker by newest artefact: RunTarget carries no mtime; build artifact replacement happens in buildThenRun. Session persistence already in useRunTargets.
- Clearing output on stop: would hide the run just stopped; start already clears.
