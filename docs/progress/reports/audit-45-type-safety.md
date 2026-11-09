# Audit 45 — type safety hiding bugs

Scope: Rust+C++ IDE quarry. Read-only audit. Focus on `as` casts, `any`, `@ts-ignore`/`@ts-expect-error`, Rust unwrap on IPC payloads.

## Findings

### P2 — src/ui/settings/TerminalSection.tsx:68,106 — `event.target.value as TerminalPlacement` / `as TerminalCursorStyle`

What: a DOM `change` event's `target` is typed `EventTarget`; `.value` is reached via a cast chain and the string is asserted to be the union without validation.
Why it matters: a tampered/stale select value (or a future option added without the cast) silently becomes a bogus enum member and propagates into `Preferences`/settings on disk.
Concrete fix: validate against the allowed set (`value === "bottom" ? "bottom" : "right"`; `TERMINAL_CURSOR_STYLES.includes(value) ? value : default`), mirroring `readPlacement`/`normalizeTerminalPreferences`.

### P3 — src/lib/updates/store.ts:99,134 — `offer.update as Update` and `offer.update as { install? }`

What: `Offer.update` is typed `unknown` (model.ts:2), then cast at two use sites to the plugin's `Update` shape.
Why it matters: the cast hides that `offer.update` is never checked to actually be an updater handle; a malformed offer (or a plugin version change) would surface as a runtime "not a function" instead of a typed failure.
Concrete fix: type `Offer` as `{ kind: "updater"; version: string; update: Update }` (importing `Update`), or narrow with a runtime guard before calling `download`/`install`.

### P3 — src/ui/main.tsx:6 — `document.getElementById("root") as HTMLElement`

What: standard non-null cast; if `index.html` loses the `#root` node the cast lies and `.render` throws.
Why it matters: low; only a packaging regression triggers it. Mitigation: guard with `if (root === null) throw`.
Concrete fix: `const root = document.getElementById("root"); if (root === null) throw new Error("missing #root"); ReactDOM.createRoot(root).render(...)`.

### P3 — Rust: src-tauri/src/run_task/impl_runstate.rs:83 — `chars.next().unwrap()` in `valid_env_name`

What: unwrap on `chars.next()` after an `is_empty()` early return; the guard makes it sound today.
Why it matters: the safety depends on the empty-check staying in sync; a refactor that moves the unwrap above the guard panics on an empty name. Not an IPC payload.
Concrete fix: replace with `let Some(first) = chars.next() else { return false; };`.

### Checked, no issue

- `src/lib/settings/model.ts`, `themes/model.ts`, `layout/model.ts`, `themes/parse.ts`: casts are guarded by `typeof` checks; sound.
- `src/lib/git/commitHistory.ts:34`: `JSON.parse(raw) as unknown` then `Array.isArray` + filter; sound.
- `src/lib/updates/notes.ts:65`: `as { body?: unknown }` then `typeof body.body === "string"`; sound.
- `src/lib/lsp/served.ts:69`: `Object.keys(EXTENSIONS) as ServerKind[]` over a `Record<ServerKind, …>`; sound.
- `src/ui/app/sessionSettings.ts:35`: `DockTab` equals `Settings["dockTab"]` union; sound.
- Rust `unwrap_or_default`/`unwrap_or` sites in `settings_file.rs`, `absolute_path.rs`, `build_task/parsedbuild.rs`, `launch/find_with_xcrun.rs`: all carry defaults; no panic on bad IPC.
- No `@ts-ignore` or `@ts-expect-error` anywhere in `src` or `src-tauri`.
- No production `any` in `src` outside test files.
