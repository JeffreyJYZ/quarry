# Formatter decision: keep Biome

## Facts

- `bun fmt` (Bun 1.x builtin) was run in a scratch copy of six repo files (`src/App.tsx`, `src/editor/Editor.tsx`, `src/styles.css`, `src/debug/memory/memory.css`, `docs/plans/001-clion-parity.md`, `package.json`) with `.editorconfig` set to tabs / 4 / width 100.
- It changed all six files. Every difference was cosmetic: tab indentation converted to two spaces, import lists rewrapped, CSS `font-family` lists rewrapped, and one blank line added in the Markdown code block. No structural change.
- Check mode exists: `bun fmt --check` (exit 1 if a file needs formatting). `--dry-run` does not exist; `--doctor` does.
- Bun's formatter does not read `biome.json`: with a `biome.json` specifying tabs and lineWidth 100 and no `.editorconfig`, a deliberately two-space file was left unchanged. Bun honors its own flags (`--use-tabs`, `--print-width`) and `.editorconfig`, not Biome config.
- Bun fmt touches Markdown (`docs/plans/001-clion-parity.md`): code-block indentation tabs became spaces and a blank line was added.

## Recommendation

Keep Biome as the formatter. Bun's output conflicts with the repo's tab-based style unless every invocation passes `--use-tabs --print-width=100`, and it ignores `biome.json`, so the two tools cannot share one config; standardizing on Biome keeps formatting and linting in one source of truth.

## Command sets

- Under `bun fmt` + `biome lint`: `bun fmt --no-script --use-tabs --print-width=100 .` then `bun lint` (`biome lint --write .`). Lint and format remain separate tools with separate configs.
- Under `biome check`: `bun run verify` (`bun run typecheck && biome check .`), or `biome check --write .` for write mode, which formats and lints in one pass.
