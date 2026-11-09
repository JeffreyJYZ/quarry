# Audit 30 — Updater flow

## Findings

### P1 — `deps.fetchGithub()` has no timeout, can hang `checkForUpdates` in "checking" forever

- `src/lib/updates/deps.ts:20-35` — `fetch` + `response.json()` with no abort/timeout. `store.ts:62` awaits it inside the checking phase; the phase guard at `store.ts:25` then blocks every later check, so the 30-min poll (`poll.ts:10`) no-ops and the panel stays "checking…".
- Fix: wrap both fetch and json in `withTimeout` (already exists in `notes.ts:81`), or an AbortController with ~8s.

### P1 — `restartWithUpdate` is not re-entrant; double click double-installs and double-relaunches

- `src/lib/updates/store.ts:130-150` — no guard. `UpdateSlot.tsx:27` and `UpdatesSection.tsx:41` both fire `void restartWithUpdate()` on click; nothing disables the button or guards phase.
- Fix: guard on `state.phase === "ready"` + a module-level `installing` flag; disable buttons while installing; set phase to "downloading"/"failed" appropriately.

### P1 — Notes timeout fix covers only the notes path; the github-version path is unfixed

- `notes.ts:53-72` uses `withTimeout` for fetch+json. `deps.ts:20-35` (the github-version fetch used by `store.ts:60-66`) does not. The "fixed" note does not cover every path.
- Fix: apply the same bounded fetch to `fetchGithub`.

### P2 — Download failure discards the offer and keeps the handle open

- `store.ts:119-126` sets `offer: null` on failure, so the user cannot retry install from the ready state; `currentHandle` is never closed on the failure path (compare `closeHandle` at `store.ts:12`).
- Fix: keep `offer` on failure, call `closeHandle()` before setting failed, expose a retry.

### P2 — No cancel for an in-flight download; progress is null when contentLength missing

- `store.ts:103-112` — `update.download` has no abort signal; `progressPercent` (`model.ts:67-78`) returns null when total unknown, so the panel shows "Downloading…" with no percentage and no cancel.
- Fix: accept an AbortController through deps if the plugin supports it; at minimum render indeterminate progress and a "Cancel" that calls `releaseOffer`.

### P2 — `restartWithUpdate` install failure leaves phase "failed" but offer retained; double relaunch possible

- `store.ts:136-146` calls `update.install()` then `relaunch()` unconditionally on success; on install throw it sets failed and returns, but relaunch still runs only on the success branch — OK. But no guard against concurrent calls (see P1).

### P3 — Poll timer: effectively never stops while the app lives

- `poll.ts:3-15` returns a cleanup; `useShellEffects.ts:9` wires it to `useEffect`. Cleanup only runs on unmount, which never happens for the root. Not a leak per se, but there is no backoff or max-retry; a permanently failing check re-runs every 30 min forever. Low impact.

## Checked, no issue

- `poll.ts` cleanup clears both `setTimeout` and `setInterval` — no timer leak on unmount.
- `notes.ts` `withTimeout` covers both `fetch` and `response.json()`; parse is sync.
- Download progress events update state; success path sets phase "ready".
- Capability file (`src-tauri/capabilities/default.json`) lists `updater:allow-download`, `updater:allow-install`, `process:allow-restart`; matches `capabilities.test.ts`.
- `checkForUpdates` re-entry guard prevents concurrent checks.
- `releaseOffer` closes the handle and resets state.
