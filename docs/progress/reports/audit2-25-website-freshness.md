# Website freshness audit

Scope: `website/content/docs/*`, landing page, against `src/`, `src-tauri/`, parity plan and release workflow.

## P1

1. `website/content/docs/install.mdx:8-9` — "There is no Windows or Linux build yet." False. `.github/workflows/release.yml:75-86` builds `windows-latest` and `ubuntu-22.04` (AppImage) plus macOS universal. Fix: drop the sentence; list all three platforms.

2. `website/content/docs/language-servers.mdx:65` — "evaluate is still broken for Rust through lldb-dap, which is why watch expressions are pinned variables rather than arbitrary expressions." Stale. `docs/spikes/evaluate.md` and `src-tauri/src/dap/dap_evaluate.rs` show evaluate works for Rust with a `frameId`; the dock sends one. Watch expressions are arbitrary evaluate now, not just pinned. Fix: rewrite the Known limits bullet to match `docs/spikes/evaluate.md` (hover/clipboard contexts, closures, `&mut`, side effects unmeasured).

3. `website/content/docs/contributing.mdx:59-61` — release flow `git tag quarry-alphaN && git push origin main quarry-alphaN`. Violates the landing rule (branch + PR, never push to main; bump inside the feature branch). Fix: replace with branch → push to `bot` → PR → merge → tag from merged main, per AGENTS "Landings go through a pull request".

## P2

4. `website/content/docs/install.mdx:35-36` — "A release build is `bun run tauri build`; it produces `quarry.app` and a dmg under `src-tauri/target/release/bundle/`." Local alphas are universal (`--target universal-apple-darwin`) and ship from `target/universal-apple-darwin/release/bundle/`. Fix: name the universal path or say `bun run release:local`.

5. `website/content/docs/contributing.mdx:59` — "bump-version.ts alpha … across the three version files." The script bumps four (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `website/package.json`) plus `Cargo.lock`. Fix: "four version files (and Cargo.lock)".

## Cleared

- Settings path `~/Library/Application Support/land.jyz.quarry/settings.json` matches `settings_path` (`app_config_dir` + identifier `land.jyz.quarry`).
- Theme list (8) matches `src/lib/themes/builtin/*.ts`.
- Shortcuts table renders from `SHORTCUT_GROUPS` (`src/lib/consts/app.ts`), so it tracks code.
- Evaluate claim in `debugging.mdx` matches `docs/spikes/evaluate.md`.
- Editor shortcut claims (Cmd+D, Cmd+Shift+L, Cmd+U, Cmd+Alt+L, Cmd+Alt+S) match `SHORTCUT_GROUPS`.
- Projects detection signals match `rootSignals.ts` (Cargo.toml, CMakeLists.txt, compile_commands.json, C/C++ source).
