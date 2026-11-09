# Audit 48 — status surfaces

## Findings

### P1 — LSP status chip reports "lsp starting" for files with no server

**File:** `src/ui/app/OverlaysMount.tsx:35-45`
**What:** `server` prop returns `"lsp starting"` whenever `model.lspStatuses?.[kind]` is `undefined`. That value is `undefined` when the server is _not enabled for this root_ (map omits the key in `useLspServers`), not while it is still coming up. So opening a `.rs` file in a project with no `Cargo.toml`, or a `.c` file in a Rust-only project, shows a chip claiming the server is starting forever. Conversely an enabled server's status begins as `null`, so the intended "starting" state is never shown for the case it was meant for.
**Why:** `status === undefined` is used as a proxy for "not resolved yet", but the map distinguishes enabled (present, possibly null) from disabled (absent).
**Fix:** treat an absent key as "no server" (`null`/hide). Show "lsp starting" only when the kind is enabled and its status is still `null`; track enabled-ness explicitly (e.g. pass the running/enabled set, or keep disabled kinds in the map as `null` with a separate "starting" sentinel).

### P2 — status chip stays green after a server crashes

**File:** `src/lib/lsp/session.ts:38-51` (`useOneServer`)
**What:** On `startLsp` rejection the hook calls `report` but never updates `status`, so a server that succeeded once and later dies keeps its last `LspStatus` and the chip keeps showing its name.
**Why:** status is only ever set on success and cleared on unmount; there is no failure transition.
**Fix:** `setStatus(null)` (or an "unavailable" sentinel) in the rejection branch; if crash detection is needed later, surface the reported error as the chip text instead of the stale name.

### P3 — restart notice can outlive its trigger if overwritten

**File:** `src/ui/app/useShell.ts:101`, `src/ui/app/useLspWiring.ts:52-62`
**What:** `onRestarted` clears the notice only when `current === RESTART_NOTICE`. If another notice replaces it before the restart settles, completion does not clear anything and the replacement stays (correct-ish), but if the replacement was transient the original restart notice is already gone and cannot be cleared. Minor; the main restart-stays bug was fixed in `54795c2`.
**Why:** clearing is name-matched rather than token-matched.
**Fix:** track the restart token that owns the current notice and clear only when that token settles.

### P3 — dead status: `useOneServer` initial `null` conflates "starting" with "unavailable"

**File:** `src/lib/lsp/session.ts:33`
**What:** `useState<LspStatus | null>(null)` has no distinct "starting" value, which is why `OverlaysMount` resorted to the `undefined` hack above. The state is set but its meaning is overloaded.
**Fix:** introduce an explicit tri-state (`null` = unavailable, `undefined`/sentinel = starting) or a separate `starting` boolean.

## Checked, no issue

- `src/ui/app/AppView.tsx:30-43` notice line has a `dismiss` button.
- `src/ui/app/useBuild.ts:42-54` `building` resets in `finally`.
- `src/lib/tests/useTests.ts:120-155` `runAllProgress` cleared in `finally`.
- `src/lib/updates/store.ts` progress cleared on success/failure.
- `src/ui/quickopen/useQuickOpen.ts:52-72` `busy` cleared in `finally` with token guard.
- restart notice state machine `src/lib/lsp/restart.ts` has tests covering old-servers and stale-token cases.
