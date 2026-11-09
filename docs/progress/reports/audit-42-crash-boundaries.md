# Audit 42 — failure containment / crash boundaries

Scope: read-only. Verified against source.

## Findings

### P0 — Error boundary is root-only, so one panel's throw blanks the whole window

- `src/ui/main.tsx:6-11` wraps `<App />` once in `<AppErrorBoundary>`. There is no boundary around the editor surface, the dock, or any individual panel.
- `src/ui/app/AppErrorBoundary.tsx:27-33` renders `CrashPanel` in place of its entire `children` once `failure !== null`. Because its children is the whole `<App />`, a throw in any leaf takes down the whole tree — chrome, project, tabs — leaving only the crash panel.
- What the user sees: "quarry stopped drawing this window" + reload button, even for a bug in one panel. Reload reopens the last project (acceptable recovery, but total loss of in-memory state).
- Fix: nest boundaries. Keep the root one as last resort; add a boundary per major region (editor surface, dock, left rail) so a throw in one panel degrades that panel only and the rest stays usable. `CrashPanel` already supports per-region messaging if given a `message`.

### P1 — No global handler for unhandled promise rejections or window errors

- `src/ui/main.tsx` installs no `window.addEventListener("error")` / `"unhandledrejection"`. Search `src/` for `onerror|onunhandledrejection|addEventListener("error"` returned no matches.
- Async failures (e.g. a rejected `invoke` whose caller dropped the await, a Tauri event listener throwing) surface only as console warnings; the UI keeps rendering stale state and the user gets no signal.
- What the user sees: nothing — the action silently does nothing, or a panel stays empty.
- Fix: add a top-level `window` error/rejection listener in `main.tsx` that routes to the same `CrashPanel`-style reporting (or at least a toast). Keep it reporting-only; do not auto-reload on a rejection, which would mask recoverable failures.

### P1 — Async Tauri event listeners have no rejection handling

- `src/ui/app/useNativeMenu.ts:18-29` calls `listen(...).then(...)` with no `.catch`. If `listen` rejects (e.g. event bridge not ready), the promise is unhandled and `unlisten` is never assigned; the menu command channel silently dies for the session.
- `src/ui/debug/useDebugEvents.ts` (event unlisten paths at 136/145) — same shape; a thrown listener body escapes to the microtask queue.
- What the user sees: menu commands / debug events stop working with no message.
- Fix: append `.catch` to each `listen(...).then(...)` and log/report; guard listener bodies in try/catch.

### P2 — Rust panic in a command aborts the process only if it reaches `unwrap` on the main path

- `src-tauri/src/lib.rs:152` `.expect("error while building the application")` panics at startup if the Tauri builder fails — process never starts. That is the intended fail-fast, but it gives the user a silent crash (no window).
- `src-tauri/src/run_task/impl_runstate.rs:83` `chars.next().unwrap()` is guarded by an `is_empty()` check on line 79-81, so safe.
- `src-tauri/src/processes.rs:127` `unwrap()` is inside a `#[test]`. No non-test unwrap on a command path was found after excluding `*_test*` files.
- Net: a panic inside a `#[tauri::command]` body returns an error to the frontend rather than aborting, unless it happens in `.setup()` or in a spawned thread. `.setup()` at `lib.rs:146-150` uses `?`, so a setup failure aborts startup with no UI.
- What the user sees on startup failure: nothing (no window). On a command panic: the invoking action fails; UI shows the returned error string if handled.
- Fix: keep `.expect`/`.unwrap` out of `.setup()` and spawned threads; convert any remaining to `Result`. Add a startup error dialog (Tauri's `setup` can show a message box before returning Err).

### P2 — Corrupted settings file does not prevent start (already contained)

- `src-tauri/src/settings/settings_core.rs:86-93` `read_settings` chains `.ok()` and `.unwrap_or_default()`, so a malformed `settings.json` yields `Settings::default()`. `read_project_settings` (109-119) likewise `unwrap_or_default()`.
- What the user sees: settings reset to defaults; no crash. No data loss beyond preferences. Acceptable.
- Fix: none needed for crash containment, but consider surfacing a "settings reset" notice so the reset is not silent.

## Checked, no issue

- `src/ui/app/AppErrorBoundary.tsx` `describe()` handles non-Error throws, strings, objects and circular objects without throwing (tested in `AppErrorBoundary.test.tsx`).
- `CrashPanel` renders even with no stack (`"No stack was reported."`).
- Settings read paths never panic on corrupt input.
- No module-scope top-level `await` / floating `invoke()` found in `src/` (invoke only inside wrappers in `src/lib/project/api/`).
- `window` event listeners found are all inside `useEffect` with cleanup; none at module scope.
