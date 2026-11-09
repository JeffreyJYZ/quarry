# consts-07 run/tests scan

## Files scanned

- src/ui/run/_, src/ui/tests/_, src/lib/consts/_, src/lib/run/_

## Inline numeric literals found

- RunLog.tsx:24 scroll-bottom threshold `24` px; `:66` status toast delay `2000` ms (×1).
- useDockFilters.ts:162/:165 toast delay `2000` ms (×2).
- TestRow.tsx:31/:45 toast delay `2000` ms (×2); :54 duration flip `1000` ms.
- useRunProcess.ts:9 `MAX_LINES = 2000` trailing-history cap.
- TestOutput.tsx / parts.ts use `OUTPUT_LINE_CAP = 200` from consts/tests.ts; first N lines text duplicates count.

## Repeated labels

- "Copy output", "Copy argv", "Copied", "copy failed", "running", "killed", "output" appear as inline string literals in multiple components.
- exit status strings diverge: lib/run/exitStatus.ts says "stopped"/"terminated by signal"/"exited with code 0"/"exited with code N"; src/ui/tests/parts.ts runTabStatus says "running"/"killed"/"exit N". Same concept, two surfaces.

## Status glyphs

- `RUNNING_GLYPH = "◦"` + `OUTPUT_LINE_CAP = 200` live in src/lib/consts/tests.ts but are run+test shared; file name tests.ts is misleading scope.
- `RUNNING_GLYPH` consumed by TestRow only; no run-ui consumer uses it.

## Duplications with consts and APIs

- `MAX_LINES` (2000) should live alongside `OUTPUT_LINE_CAP` in run consts, not inline in hook.
- Toast delay 2000 ms repeated in 3 files (RunLog, useDockFilters, TestRow) — should be one `TOAST_DISMISS_MS`.
- Duration flip 1000 ms and scroll threshold 24 px are UI tuning; either stay local or move to a shared ui const.
- exit-status wording should collapse to one module: keep lib/run/exitStatus.ts as source, make parts.runTabStatus call it instead of reimplementing.

## Where each should live

- src/lib/consts/run.ts: add `RUN_LINE_HISTORY_CAP = 2000`, `TOAST_DISMISS_MS = 2000`, `MS_PER_SECOND = 1000`, output scroll threshold.
- Move `OUTPUT_LINE_CAP`/`RUNNING_GLYPH` from consts/tests.ts to consts/run.ts (or shared consts/ui.ts); keep re-export in tests/parts for back-compat.
- Labels: put canonical labels in consts/run.ts or a ui labels const; components import.

## Top targets for const extraction

1. Toast delay 2000 ms — highest duplication (5 sites).
2. Line caps (200 display vs 2000 history) — distinct, name both.
3. exit-status wording — highest semantic drift risk.
