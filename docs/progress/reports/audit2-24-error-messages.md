# Audit: user-visible failure messages in src/ui

Scope: strings shown to users (notice, inline error, panel message). Internal `describeError` pass-throughs (raw backend strings) are a separate class and mostly fine.

## Findings (worst first)

1. `src/ui/debug/dock/DebugDockBody.tsx:50` — "no debug session". Says state, not cause or remedy. Better: "No debug session is running. Start one with Run → Debug (F5)."
2. `src/ui/debug/ConsoleSection.tsx:28` — "no session" / "live". Two bare words, no action. Better: "No debug session" / "Live".
3. `src/ui/breadcrumb/Breadcrumb.tsx:38`, `src/ui/run/RunLog.tsx:78,90`, `src/ui/tests/TestRow.tsx:33,47`, `src/ui/tests/useDockFilters.ts:164` — "copy failed". No cause. Better: "Copy failed: <describeError(err)>." (already used elsewhere).
4. `src/ui/updates/ReleaseNotes.tsx:38` — "No notes for this version". Implies absence; could be fetch failure. Better: "No release notes published for this version." or "Could not load release notes."
5. `src/ui/editor/useFormatDocument.ts:50` — "no formatter for .${ext}". States gap but no install hint. Better: "No formatter for .${ext}: install taplo-cli (TOML) or configure one in Settings."
6. `src/ui/search/SearchReplace.tsx:67` / `useReplace.ts:62` — "preview is stale". Good cause, vague remedy. Better as-is-ish: "Preview is stale: run Preview again before Replace."
7. `src/ui/editor/useEditorSearch.ts:51` — "invalid regex" (inconsistent with SearchPalette "invalid regular expression"). Unify wording and show the bad pattern.
8. `src/ui/debug/memory/useMemoryRead.ts:69` — "Memory read failed" (fallback only). Acceptable but bare; could include address range.
9. `src/ui/app/useEditorActions.ts:118` — "This language server has no organise-imports action". Good, keep.
10. `src/ui/components/StatusBar.tsx:120` — "no project". Fine as status, but tooltip could say "Open a folder to start a language server."

## Cleared

- `describeError` normalises backend strings consistently.
- `launchFailureLines` gives file:line:col diagnostics — good.
- `AppErrorBoundary`/`CrashPanel` names error and offers reload.
