# Audit 35 — docs site (website/) reuse of the app

## Findings

### P2 — docs-deps.ts silently skips unresolved `@/`/`~/`/relative imports

- File: `scripts/docs-deps.ts:70-119`
- What: when a relative/`~/`/`@/` specifier resolves to no candidate file, the loop simply does not enqueue it and records nothing. A misspelled or moved import path therefore passes the gate instead of failing.
- Why it matters: the gate's whole job is to catch breakage that only surfaces on Vercel; an unresolved path would still fail the build, but only after push.
- Fix: when no candidate exists, push `{ file, specifier }` as an "unresolved import" offender and exit non-zero.

### P3 — docs-deps.ts glob is limited to `**/*.{ts,tsx}`

- File: `scripts/docs-deps.ts:56`
- What: a future `.js`/`.jsx`/`.mdx`/`.mts` file under `website/src` with imports would not be scanned.
- Why it matters: latent gap; no such file exists today, but the coverage claim ("walks the whole graph") is false for those extensions.
- Fix: broaden the glob (or scan every file and skip non-source by extension).

### P3 — dynamic imports are only matched when the specifier is a string literal

- File: `scripts/docs-deps.ts:40`
- What: `import(\`…\`)` (template literal) is not parsed. None exist today.
- Fix: also match `import(` calls and extract any embedded string literal; or document the limitation.

## Checked, no issue

- All four `@/` imports in `website/src` (`ThemeTokens.tsx`, `ShortcutTable.tsx`) resolve to existing modules and named exports (`themeVariables`, `oneDark`, `oneLight`, `SHORTCUT_GROUPS`) — `src/lib/themes/apply.ts`, `builtin/one-dark.ts`, `builtin/one-light.ts`, `src/lib/consts/app.ts`.
- Transitive graph (40 files) contains no bare third-party imports beyond those declared in `website/package.json`; `bun scripts/docs-deps.ts` passes.
- All internal `/docs/*` links in `website/content` map to existing slugs/pages in `website/src/lib/nav.ts`.
- `vercel.json`: `buildCommand`/`installCommand`/`outputDirectory` consistent with `website/` layout; `framework: null` appropriate for static export.
- Versions in sync: root `package.json`, `website/package.json`, `src-tauri/tauri.conf.json` all `0.1.0-alpha.79`.
- `website/public/icon.svg` present.
- `docs dependencies` step present in `scripts/gate.ts:25`.
