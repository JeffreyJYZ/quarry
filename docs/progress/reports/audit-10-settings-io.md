# Audit: settings I/O (Rust + TS)

Scope: `src-tauri/src/settings/*`, `src/lib/project/api/settings.ts`, `src/lib/settings/model.ts`.

## P0 — Non-atomic settings writes can truncate the file on crash

- `src-tauri/src/settings/settings_core.rs:96` `write_settings` and `:122` `write_project_settings` both call `fs::write(&path, …)` directly. A crash or power loss mid-write leaves a partial/empty `settings.json`; the next `read_settings` then returns `Settings::default()`, wiping the user's session.
- Contrast the existing atomic writer `src-tauri/src/workspace/tests_1.rs:15-78` (`write_text_file`: sibling temp + `sync_all` + `rename`), which is the pattern already used elsewhere. Settings should use it too.

Fix: route both writes through a sibling-temp + `sync_all` + `rename` (reuse the workspace helper's shape), with the temp in the same directory so the rename stays on one filesystem.

## P1 — A corrupt settings file resets everything; nothing is salvaged

- `src-tauri/src/settings/settings_core.rs:87-92` `read_settings` chains `fs::read_to_string(...).ok()` then `serde_json::from_str(...).ok()` then `unwrap_or_default()`. Any parse error — including one bad field or a truncated tail — discards the whole file (last root, open files, recent roots, run configs, preferences, preserved `extra`).
- `:109-118` `read_project_settings` does the same with `unwrap_or_default()`.
- There is no backup of the offending file, so the original is unreachable once a write follows.

Fix: on parse failure, rename the corrupt file to `settings.json.corrupt` (or keep one backup) before returning defaults, and attempt a per-field salvage by parsing as `serde_json::Value` first so a partially valid file keeps the fields that survived. At minimum never let a successful `write_settings` overwrite a corrupt original without retaining it.

## P1 — Unknown preference keys are dropped on save

- Top-level `Settings` preserves unknown keys via `extra: serde_json::Map` + `#[serde(flatten)]` (`settings_core.rs:54-55`), and the round-trip test in `tests_2.rs:24-44` covers it.
- `Preferences` (`preferences.rs:12-86`) has no flattened `extra`, and neither does `ProjectSettings` (`preferences.rs:191-202`). Serde ignores unknown fields on read and never re-emits them, so a newer build's preference key (e.g. a new terminal setting) is silently deleted the next time this build saves. The frontend's `settingsForWrite` (`settings.ts:37-39`) can only preserve what Rust round-tripped into the object.
- `ThemePreferences` on the TS side is similarly not covered by a Rust `extra`.

Fix: add `#[serde(flatten)] pub extra: serde_json::Map<String, serde_json::Value>` to both `Preferences` and `ProjectSettings`, with the same `#[serde(default)]`, and make the frontend normalize/serialize it pass-through (as it already does for top-level `Settings`).

## P2 — `dockTab` values cannot round-trip Rust ↔ TS

- TS `DockTab` = `"problems" | "tests" | "run" | "debugger" | "console" | "memory"` (`src/ui/tests/parts.ts:3`), and `Settings.dockTab` (`settings.ts:11`) inherits that set.
- Rust `deserialize_dock_tab` (`settings_file.rs:40-48`) accepts only `"tests" | "problems" | "refs" | "run"`; any other value — including `"debugger"`, `"console"`, `"memory"` — is silently rewritten to `"problems"`. Rust's own allowed `"refs"` is not in the TS union.
- Result: a dock tab saved as `debugger`/`console`/`memory` reopens as "problems"; `"refs"` from Rust can never be represented on the TS side.

Fix: extend `deserialize_dock_tab` to accept the full TS set (`debugger`, `console`, `memory`), and add `"refs"` to the TS `DockTab` union if the Rust side truly owns that tab — otherwise delete the `"refs"` arm. Pick one source of truth and test the intersection.

## P3 — TS `Settings` type omits the Rust `debugOpen` field

- Rust `Settings` has `debug_open: bool` (`settings_core.rs:24-25`); TS `Settings` (`settings.ts:5-20`) has no `debugOpen`. The value rides along at runtime but is untyped, so a type-checked write can drop it depending on how the preserved object is cast. (If `debugOpen` is dead, remove it from Rust instead.)

## Checked, no issue

- `new_project_parent`: Rust default `None` (`settings_core.rs:72`); frontend treats `null → ""` (`useSessionPersistence.ts:61`) and writes back the string (`sessionSettings.ts:40`). Defaults agree.
- Top-level unknown keys: preserved on both sides via `extra` + `settingsForWrite` spread; covered by `tests_2.rs:24-44`.
- Clamping: Rust `Preferences::normalize` and TS `normalizePreferences` both clamp font sizes, tab size, build profile, panel sizes.
- Atomic writer exists and is the reference shape (`workspace/tests_1.rs:15-78`); only settings I/O bypasses it.

## Round-trip table: Rust Settings vs TS Settings

Rust fields (camelCase on the wire) `settings_core.rs:12-56`:

| Rust field                                                    | TS `Settings` (`src/lib/project/api/settings.ts:5-20`) | Written by TS                                    | Read by Rust               | Round-trips                              | Verdict |
| ------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------ | -------------------------- | ---------------------------------------- | ------- |
| `last_root: Option<String>`                                   | `lastRoot: string \| null`                             | yes (`sessionSettings.ts:30`)                    | yes                        | yes                                      | ok      |
| `open_files: Vec<String>` (`#[serde(default)]`)               | `openFiles: string[]`                                  | yes (`:31`)                                      | yes                        | yes                                      | ok      |
| `active_file: Option<String>`                                 | `activeFile: string \| null`                           | yes (`:32`)                                      | yes                        | yes                                      | ok      |
| `rail_collapsed: bool` (`default`)                            | `railCollapsed?: boolean`                              | yes (`:33`)                                      | yes (defaults false)       | yes                                      | ok      |
| `debug_open: bool` (`default`)                                | — (absent)                                             | never                                            | yes                        | Rust-only                                | P3      |
| `git_open: bool` (`default`)                                  | `gitOpen?: boolean`                                    | yes (`:34`)                                      | yes                        | yes                                      | ok      |
| `dock_tab: String` (default `"problems"`, custom deserialize) | `dockTab?: "problems" \| … \| "memory"`                | yes (`:35`)                                      | yes but whitelist mismatch | **no** for `debugger`/`console`/`memory` | P2      |
| `dock_expanded: Option<bool>` (`default`)                     | `dockExpanded?: boolean \| null`                       | yes (`:36`)                                      | yes                        | yes                                      | ok      |
| `recent_roots: Vec<String>` (custom deserialize)              | `recentRoots?: string[]`                               | not in snapshot (see `:37-41` omits recentRoots) | yes                        | write path drops it                      | note    |
| `run_configurations: Vec<RunConfiguration>` (custom)          | `runConfigurations?: RunConfiguration[]`               | yes (`:37`)                                      | yes                        | yes                                      | ok      |
| `recent_files: Vec<String>` (`default`)                       | `recentFiles?: string[]`                               | yes (`:39`)                                      | yes                        | yes                                      | ok      |
| `new_project_parent: Option<String>` (`default`)              | `newProjectParent?: string \| null`                    | yes (`:40`)                                      | yes                        | yes                                      | ok      |
| `preferences: Preferences` (`default`)                        | `preferences?: Preferences`                            | yes (`:38`)                                      | yes                        | yes                                      | ok      |
| `extra: Map` (flatten)                                        | spread via `settingsForWrite`                          | preserved                                        | preserved                  | yes                                      | ok      |

Rust `ProjectSettings` (`preferences.rs:191-202`, camelCase):

| Rust field                      | TS `ProjectSettings` (`src/lib/settings/model.ts:56-60`) | Round-trips                    | Verdict |
| ------------------------------- | -------------------------------------------------------- | ------------------------------ | ------- |
| `editor_tab_size: Option<u32>`  | `editorTabSize: TabSize \| null`                         | tab size `5` → None (expected) | ok      |
| `format_on_save: Option<bool>`  | `formatOnSave: boolean \| null`                          | yes                            | ok      |
| `build_profile: Option<String>` | `buildProfile: BuildProfile \| null`                     | `"fast"` → None (expected)     | ok      |
| — (no `extra`)                  | —                                                        | unknown keys dropped on save   | P1      |

Rust `Preferences` (`preferences.rs:12-86`) vs TS `Preferences` (`src/lib/settings/model.ts:32-53`):

| Rust field (camelCase)          | TS field                                   | Round-trips                                                                               | Verdict   |
| ------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------- | --------- |
| `editor_font_size: f64`         | `editorFontSize: number`                   | yes (clamped 9–24)                                                                        | ok        |
| `editor_tab_size: u32`          | `editorTabSize: TabSize` (2\|4\|8)         | Rust accepts any u32; TS narrows; values other than 2/4/8 → 4 on `Preferences::normalize` | mostly ok |
| `terminal_font_size: f64`       | `terminalFontSize: number`                 | yes                                                                                       | ok        |
| `terminal_line_height: f64`     | `terminalLineHeight: number`               | yes                                                                                       | ok        |
| `terminal_cursor_style: String` | `terminalCursorStyle: TerminalCursorStyle` | Rust accepts any string; normalize fixes unknown → "block"                                | ok        |
| `terminal_cursor_blink: bool`   | `terminalCursorBlink: boolean`             | yes                                                                                       | ok        |
| `terminal_scrollback: u32`      | `terminalScrollback: number`               | yes (clamped 500–50000)                                                                   | ok        |
| `terminal_letter_spacing: i32`  | `terminalLetterSpacing: number`            | yes                                                                                       | ok        |
| `format_on_save: bool`          | `formatOnSave: boolean`                    | yes                                                                                       | ok        |
| `build_profile: String`         | `buildProfile: BuildProfile`               | Rust accepts any; normalize fixes                                                         | ok        |
| `terminal_placement: String`    | `terminalPlacement: TerminalPlacement`     | yes ("right" else "bottom")                                                               | ok        |
| `editor_font_family: String`    | `editorFontFamily: string`                 | yes (trimmed)                                                                             | ok        |
| `terminal_font_family: String`  | `terminalFontFamily: string`               | yes                                                                                       | ok        |
| `rust_analyzer_path: String`    | `rustAnalyzerPath: string`                 | yes                                                                                       | ok        |
| `rust_analyzer_args: String`    | `rustAnalyzerArgs: string`                 | yes                                                                                       | ok        |
| `clangd_path: String`           | `clangdPath: string`                       | yes                                                                                       | ok        |
| `clangd_args: String`           | `clangdArgs: string`                       | yes                                                                                       | ok        |
| `theme: String`                 | `theme: string` (via ThemePreferences)     | yes                                                                                       | ok        |
| `custom_themes: Vec<Value>`     | `customThemes: Theme[]`                    | yes                                                                                       | ok        |
| `panel_sizes: PanelSizes`       | `panelSizes: PanelSizes`                   | yes                                                                                       | ok        |
| — (no `extra`)                  | unknown theme/preference keys              | dropped on save                                                                           | P1        |

Note: `details.isDockTab` accepts exactly the six TS values; Rust only accepts four, so a saved `debugger`/`console`/`memory` tab is coerced to `problems` on read (`useSessionPersistence.ts:63-64` then `isDockTab` rejects it anyway). The concrete loss: a user on the Debugger/Console/Memory dock tab, with a stored value the Rust side cannot keep, reopens quarry with the Problems tab selected. Condition: any session that wrote one of those three tab ids and is then reloaded through Rust (i.e. every relaunch in the current build). The TS `isDockTab(storedTab) ? storedTab : "problems"` fallback in `useSessionPersistence.ts:64` hides the Rust reset but does not preserve it if Rust had already rewritten the file.

### Atomicity: smallest correct fix + hot-loop check

Smallest fix: both `write_settings` and `write_project_settings` should write a sibling `<name>.<pid>.<counter>.tmp` in the target's own directory, `sync_all`, then `fs::rename` over the real path, deleting the temp on any error — exactly `workspace/tests_1.rs:20-78`. No new dependency, no API change.

Hot-loop check: writes are debounced 400 ms via `changeCounter`/`setTimeout` (`useSessionPersistence.ts:129-141`), plus a visibility-change flush. So the atomic rename runs at most a few times per second during steady typing, not per keystroke. Atomicity is cheap relative to the 400 ms cadence and to `serde_json::to_string_pretty` already in the path; there is no write on a per-keystroke or per-frame loop. Safe to apply unconditionally.
