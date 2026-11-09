# consts-10: search, quickopen, palette

## search

- `src/lib/consts/search.ts` owns `SEARCH_RENDER_LIMIT=300`, `PREVIEW_LIMIT=200`.
- `src/lib/search/model.ts` re-exports both, and adds a local `LINE_CLIP=240` (clipLine) not in consts. Candidate to centralize.
- `groupMatches` default param re-types the cap: `limit = SEARCH_RENDER_LIMIT`. Re-typed, not re-defined; fine but redundant.
- `buildPreview` default param `limit = PREVIEW_LIMIT`.
- Empty states hardcoded in `SearchPalette.tsx`: "No matches.", "searching…", "Type a pattern, then Enter…", "Press Enter to search this project.", "invalid regular expression". And `SearchReplace.tsx`: "preview truncated (cap {PREVIEW_LIMIT})", "preview is stale", summary template.
- `parts.ts` `searchSession` object holds toggle defaults + lastQuery; not consts (session state, OK).
- `invalidQuery` in parts.ts.

## quickopen

- `src/lib/consts/quickopen.ts` owns `STALE_MS=30_000`, `RECENT_LIMIT=30`.
- `parts.ts` re-exports both, but hardcodes `200` in `recordRecent` (`if (recent.length > 200)`). That 200 is the `recent` array cap, distinct from `RECENT_LIMIT=30` (rendered recent). Magic; candidate const `RECENT_STORE_LIMIT`.
- `rank.ts` magic: `1000` boundary weight, tier 0..5, recent/sameDir 0/1 flags. Scoring weights not consts; probably fine inline but noted.
- Empty states: "No files indexed", "No matches", "filter active: …" in QuickOpen.tsx.

## palette

- `CommandPalette.tsx` hardcodes recent slice `8` (`slice(0, 8)`) — candidate const.
- Empty state "No commands." hardcoded.
- `setTimeout(..., 0)` for run deferral.

## notes

- `SEARCH_RENDER_LIMIT`/`PREVIEW_LIMIT` already in consts; `LINE_CLIP`, recent-store 200, command recent 8 are not.
- No debounce anywhere; search runs on Enter only.
- Re-typing cap in default params is harmless.
