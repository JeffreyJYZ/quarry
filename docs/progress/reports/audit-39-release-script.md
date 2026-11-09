# Audit 39 — release pipeline

## Findings

P0 — scripts/release-local.ts:337-348 manifest verification fetches `/releases/latest/download/latest.json`. For alpha tags `gh release create` is called without `--latest`, so `/releases/latest` points at the last stable release, never the alpha just published. The check validates a stale manifest (or fails for a valid alpha) and cannot prove the new version serves. Fix: fetch `/releases/download/${tag}/latest.json`.

P0 — scripts/release-local.ts:318-335 `gh release create` uploads all assets in one invocation; a mid-upload failure leaves a half-created release (tag + partial assets) on GitHub and the script exits. No rollback/cleanup and no per-asset retry. Fix: on failure delete the just-created release/tag, or upload assets one at a time with verification; document manual recovery.

P1 — scripts/verify-bundle.ts:7,10-19 reads arch-only paths `src-tauri/target/release/bundle/macos/quarry.app` and `quarry.app.tar.gz` instead of the universal ones under `src-tauri/target/universal-apple-darwin/release/bundle/`. A universal build's artefacts never match, so the check inspects a stale arch-only build (or nothing). Fix: point `APP_PATH`/`UPDATER_TAR` at the `universal-apple-darwin` bundle dir.

P1 — scripts/release-local.ts:30-39 `readVersions()` compares only `package.json`, `tauri.conf.json`, `Cargo.toml`. `website/package.json` and the `quarry` crate entry in `src-tauri/Cargo.lock` are not read, and `versionDrift` in scripts/release-manifest.ts:7-9 compares only three. AGENTS.md requires all five to agree. Fix: extend `VersionTriplet` and `readVersions()` to include `website/package.json` and the `quarry` entry in `Cargo.lock`, fail on any drift.

P1 — scripts/bump-version.ts:14-18,66,88-107 reads/writes four files but never `Cargo.lock` (the fifth). It runs `cargo update -p quarry` to refresh the lock, but post-bump verification never re-reads `Cargo.lock` to confirm the quarry crate version moved. Fix: parse the `[[package]] name = "quarry"` entry's `version` before/after and include it in the agreement checks.

P1 — scripts/release-local.ts:133-144 `notesFromGit()` uses `git describe --tags --abbrev=0 HEAD`, which can resolve to a tag on an unrelated reachable branch or a lightweight tag rather than the immediately preceding release tag. Fix: constrain to annotated release tags on the current branch and verify it is an ancestor.

P2 — scripts/release-local.ts:164-166 only checks `~/.tauri/quarry-updater.key` exists; it does not verify readability or that `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (hardcoded `""` at line 235) matches the key. A password-protected key or permission failure surfaces only mid-build. Fix: verify the key is readable and the password assumption is stated; warn/probe before building.

P2 — scripts/release-local.ts:239 `makeDmg`/`detachVolumes` run inside the build branch; on `--skip-build` the dmg may be regenerated at line 248 without a freshness check against the app. Minor; note only.

## Checked, no issue

- scripts/release-local.ts:254-269 signature/version guard correctly decodes the minisign comment and rejects a stale archive signed for a different version.
- scripts/release-local.ts:270-274 archive mtime vs app binary mtime check present.
- scripts/release-local.ts:229-241 build passes `--target universal-apple-darwin`.
- scripts/bump-version.ts:33-38 pre-bump agreement check across the four files it reads.
