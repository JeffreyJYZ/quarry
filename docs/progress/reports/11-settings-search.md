# Settings search

Added an in-place search field to the settings page that filters settings rows.

## Changed

- `src/ui/settings/settingsSearch.ts` (new): `rowMatches`, `filterSections`, and the `useSettingsSearch` hook. The hook keeps the query in state, resets it when `open` or `tab` changes, and runs `filterSections` over the settings body after each render.
- `src/ui/settings/settingsSearch.test.ts` (new): covers `rowMatches` (case-insensitive hit, miss, blank, whitespace-only).
- `src/ui/settings/SettingsPage.tsx`: wired `bodyRef` onto `.settings-body`, rendered `.settings-search` before the close button, and showed `.settings-empty` when a non-blank query matches nothing.
- `src/ui/settings/settings/1-settings-backdrop.css`: added `.settings-search` and `.settings-empty` rules.

## Verification

- `bun check`: no type errors.
- `bun test`: all pass.
- `bunx biome lint src/ui/settings`: zero errors.
