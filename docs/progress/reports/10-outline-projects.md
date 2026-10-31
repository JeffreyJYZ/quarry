# 10-outline-projects

Filtering the outline by symbol name, plus an empty state.

## Scope

Area: src/ui/outline/**, src/lib/outline/**. No edits outside.

## Gap — outline filter

- Verify: src/ui/outline/Outline.tsx already filters rows with filterSymbolIndices and shows an empty state; Escape did not clear the input, and the empty-state wording was "No symbols match".
- Fix: add onKeyDown Escape to clear the filter; change empty state to "No symbol matches"; move filter styles into src/ui/outline/outline.css imported by the component.

## Files changed

- src/ui/outline/Outline.tsx:10 imports outline.css; lines 129-138 filter input Escape handling; line 144 empty state.
- src/ui/outline/outline.css: new stylesheet for filter wrap/input.

## Verification

- bun test src/lib/outline: 5 pass.
- bun run scripts/unstyled-classes.ts: 0 of 116 classes.
- bun check: blocked by pre-existing errors in src/ui/editor/useEditorContextMenu.ts (outside this area); outline files type-check.
