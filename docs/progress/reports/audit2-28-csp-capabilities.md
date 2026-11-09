# Audit 28 — CSP, capabilities, asset scope, updater

Scope: `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`. No source edits.

## Findings

### P0 — CSP disabled (`tauri.conf.json:25-27`)

`"security": { "csp": null }` injects no Content-Security-Policy at all. With no CSP, any injected script (XSS, a compromised dependency, a tampered bundled asset) runs with full capability access, and the updater/install/restart grants below become reachable. Fix: set a strict CSP, e.g. `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: https://asset.localhost; connect-src 'self' https://github.com`.

### P1 — `opener:default` grants file-open the app never uses (`capabilities/default.json:8`)

Only use site is `src/ui/terminal/terminalLinks.ts:71` calling `openUrl(found.url)` for terminal link clicks. `opener:default` also grants `open_path`, so a compromised frontend could open arbitrary local files/paths via the OS opener. Fix: replace `opener:default` with the narrower `opener:allow-open-url` (and scope the URL pattern) so only URL opening is permitted.

### P2 — no capability is unused, but `process:allow-restart` is broad (`capabilities/default.json:13`)

It backs `src/lib/updates/store.ts:149` `relaunch()` after an update. Needed, but any frontend code can restart the process; pair with the CSP fix above so it is not reachable by injection. No code-level mitigation available beyond capability scoping.

### P3 — updater endpoint and window config

- Updater endpoint `tauri.conf.json:45` is HTTPS GitHub `releases/latest/download/latest.json`, signed with the pubkey at `:43`. Signature verification is the trust anchor; endpoint itself is HTTPS. No finding beyond standard supply-chain risk (a compromised GitHub release would still need the private signing key).
- Window config `tauri.conf.json:13-23` has no `url` field, so it loads only the bundled `frontendDist` (`../dist`). No remote content is permitted. OK.
- No `assetProtocol` scope and no `fs` plugin are configured; nothing to widen. OK.

## What I cleared

- No capability is granted that no command needs (`core:default`, `opener`, `dialog`, `updater:*`, `process:allow-restart` all have call sites).
- No remote-content window or asset scope wider than the project.
- Updater transport is HTTPS + signed.
