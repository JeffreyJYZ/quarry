# Audit: secrets and filesystem permissions

## Findings

P1 — `src-tauri/tauri.conf.json:19` — `app.security.csp` is `null`, disabling the webview CSP entirely. Any injected script (XSS, compromised dependency) runs with full Tauri command access. Set a real CSP (default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' if needed; connect-src 'self' ipc: http://ipc.localhost).

P2 — `.gitignore` (whole file) — `.quarry/` (project settings, `settings.json`) is not ignored. `write_project_settings` in `src-tauri/src/settings/settings_core.rs:121-141` writes `.quarry/settings.json` with `fs::write` (default mode 0644) into the project tree, which often is a git repo; the file carries absolute paths and run configurations and can be committed by accident. Add `.quarry/` to `.gitignore`, and write the file with mode 0600 on unix.

P2 — `src-tauri/src/settings/settings_core.rs:96-106` and `:121-141` — `write_settings`/`write_project_settings` use `fs::write` (creates 0644). Settings include `last_root`, `open_files`, `recent_roots`, `run_configurations` (paths/commands). Restrict to 0600 via `OpenOptions` + `Permissions::from_mode(0o600)` on unix, mirroring the test fixture in `src-tauri/src/workspace/tests_group_1.rs:122`.

P2 — `src-tauri/src/git/build_hunk_patch.rs:112-113` — temp patch path is predictable (`quarry-hunk-<id>.patch` in `std::env::temp_dir()`). A local attacker can pre-create a symlink at that name and redirect the write / feed `git apply`. Use `tempfile::NamedTempFile` (or a mkstemp-style unique name) and remove in a Drop/finally; the `remove_file` at line 124 already runs but only after.

P3 — `src-tauri/tauri.conf.json` (whole) — no `fs` plugin scope declared (good, none present); capabilities in `src-tauri/capabilities/default.json` are minimal. No wider filesystem scope found. Updater pubkey and endpoint are hardcoded as expected; signing key is read from env/file at release time only (`scripts/release-local.ts:164,235`), never shipped.

## Checked, no issue

- No `console.log`/`println!` of tokens, passwords or URLs that ship; only `eprintln!` skip messages in tests (`src-tauri/src/lsp/tests_2.rs:38,43,146`).
- No credential or secret stored in source; signing key lives at `~/.tauri/quarry-updater.key` (referenced by path only).
- No temp file creation in production besides the hunk patch (above).
- `.gitignore` covers `src-tauri/target`, `dist`, `node_modules`, `.DS_Store`. Missing `.quarry/` is the only gap noted.
- Updater uses HTTPS endpoint and a pinned pubkey; `TAURI_SIGNING_PRIVATE_KEY` only in CI env (`.github/workflows/release.yml:160-161`).
- Capabilities (`default.json`) grant only `core:default`, `opener:default`, `dialog:default`, updater allow-*, `process:allow-restart`; no `fs` plugin.
- No predictable temp dir under a shared location besides the hunk patch.
