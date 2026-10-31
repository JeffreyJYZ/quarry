# Problems dock: persistence, keyboard, fix failures

## Changes

- `src/lib/problems/model.ts`: `filterProblemFiles` and `flatProblems` now accept an optional text query (default `""`) and a shared `matchesProblemText` helper filters on path/name/message/source. Backwards compatible.
- `src/ui/problems/parts.ts`: persistence moved from `sessionStorage` to `localStorage` for grouping, and added `storedAllowed`/`storeAllowed` and `storedTextFilter`/`storeTextFilter` so severity set and text filter survive remount and restart.
- `src/ui/problems/ProblemsPanel.tsx`: loads all three filters from storage, persists on change, threads `textFilter` into both filtered views, distinguishes "No problems" from "No problems match the filter \"…\"" empty states.
- `src/ui/problems/ProblemsHead.tsx`: added a text filter input.
- `src/ui/problems/ProblemsList.tsx`, `src/ui/problems/FlatProblems.tsx`: ArrowUp/ArrowDown move a visible `selected` row, Enter opens its location, row gets `.selected`, `scrollIntoView({ block: "nearest" })`.
- `src/ui/problems/ProblemRow.tsx`: `selected` + `rowRef` props for visible selection and scroll.
- `src/ui/problems/useProblemActions.ts`: `fetchActions` throws descriptive errors when there is no project root or no language server session; `openMenu` sets `menuError` when no code actions instead of silently closing.
- `src/ui/problems/problems.css` (new): styles for text filter, selected row.

## Why

Grouping used session storage (lost on restart); severity and text filter were not persisted at all. Keyboard navigation was absent. The Fix button silently did nothing when a server returned no actions or was unavailable. Dock tab count is the raw error total and is not recomputed against the active filter; the panel's head toggles are the authoritative filtered view, and the tab stays a headline count.

## Verification

- `bun check src/ui/problems src/lib/problems` (no errors)
- `bun test src/lib/problems` (3 pass)
- `bun run scripts/unstyled-classes.ts` (0)

## Rejected ideas

- Lifting filter state into TestsDock to recompute the tab count: out of scope (cannot edit TestsDock); kept the headline count and explained the mismatch.
- Adding a separate text-filter storage key per severity: unnecessary; one query string suffices.
