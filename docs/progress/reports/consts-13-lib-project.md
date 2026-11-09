# consts-13: src/lib/project

Scan: `/Users/jyz/dev/monorepos/quarry/src/lib/project/**` (23 files, ~1.7k lines) plus `src/lib/consts/projects.ts`.

## Findings

- No caps, limits, retry counts or mime/extension lists live in `src/lib/project`. The only numeric constants found are `STALE_MS`/`RECENT_LIMIT`, and those already live in `src/lib/consts/quickopen.ts` (`RECENT_LIMIT = 30`, `STALE_MS = 30_000`), imported via `src/lib/project/api` paths only indirectly.
- Extension lists already have a home: `src/lib/consts/extensions.ts` (the single source referenced by `fileKind`, `editor/languages`, `lsp/served`, `lsp/rootSignals`, `generate/model`). `src/lib/project/save.ts` computes `extensionOf` locally but only compares to `"json"`/`"jsonc"` inline; that's a format-dispatch check, not a list, and moving it would split logic from its only caller.
- Command names (e.g. `"read_launch_config"`, `"create_file"`, `"lsp_execute_command"`) each appear exactly once, inside their own wrapper in `src/lib/project/api/*`. No duplication across files; no const home needed. `commands.test.ts` already guards the invoke-vs-handler parity by scanning source.
- `src/lib/consts/projects.ts` holds `KINDS`/`STANDARDS` (new-project dialog data), correctly placed; nothing there to relocate.
- Repeated small literals in `watch.ts`/`save.ts` (`"ignore"/"reload"/"conflict"`, `"json"/"jsonc"`, `/`) are local enum/branch values, not shared constants.

## Verdict

Nothing worth moving. `src/lib/project` is an API/wrapper + pure-logic layer; its constants are either single-use or already homed in `src/lib/consts/*` (extensions, quickopen, projects).
