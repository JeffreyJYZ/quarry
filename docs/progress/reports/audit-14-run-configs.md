# Audit 14 — run configurations end to end

Scope: Rust+C++ IDE quarry. Read-only audit. Covers `src/lib/project/api/run-configuration.ts`, `src/lib/run/configurations.ts`, `src/ui/run/*`, `src/ui/app/useRunControls.ts`, `src/ui/app/useRunFormMemory.ts`, `src-tauri/src/run_task/*`, `src-tauri/src/settings/settings_file.rs`.

## Findings

### P2 — src/ui/app/useRunFormMemory.ts:46 — default args joined with a bare space instead of `joinArgs`

What: when a project has no saved form memory, the default launch config's `args: string[]` is turned into the form's single args string with `config.args.join(" ")` (line 46). `splitArgs` is quote-aware, so an argument that itself contains a space (common for C/C++ flags or paths) is written unquoted and re-splits into two arguments on the next run.
Why it matters: a default-config arg such as `/path/with space/file` becomes two argv entries; the run then fails or behaves wrong, and the round trip `args → splitArgs` is not the identity the rest of the system assumes (`presets.ts` keeps its own `joinArgs`/`splitArgs` pair for exactly this reason).
Concrete fix: import `joinArgs` from `@/lib/debug/presets` and use `args: joinArgs(config.args)`; same change on line 45's sibling if any other array field appears.

### P3 — src/ui/app/useRunFormMemory.ts:30,43-55 — per-root memory stores args/cwd/env but not `program`

What: the memory map is typed `{ args, cwd, env }` and the restore always takes `program` from `defaultLaunchConfig`, even on a project the user has already edited. A manually changed program (or one loaded from a saved configuration, then the project switched away and back) is discarded and reset to the detected default.
Why it matters: silently loses a user edit across a project switch; saved configurations keep their own program, so the two surfaces disagree about what "remembered" means.
Concrete fix: store `program` in the memory entry too (`{ program, args, cwd, env }`) and restore `program: saved.program ?? config.program`.

### P3 — src/ui/app/useRunControls.ts:98-113 — `runConfig` carries the form's stale env into a detected target's run

What: `runConfig` sets `program`/`args`/`cwd` from the `LaunchConfig` but calls `proc.start(..., env)` with the _current form's_ env (dependency array includes `env`). A detected-target run therefore reuses whatever env rows happened to be in the form, including rows from a previously selected saved configuration.
Why it matters: env is not part of `LaunchConfig`, so there is no source of truth for it on this path; the result depends on unrelated form state.
Concrete fix: either reset `env` to `[]` before starting a detected target, or add an `env` field to `LaunchConfig`/presets so the target carries its own. At minimum, document the choice in the form.

### P3 — src/ui/tests/RunDock.tsx:35-38 — `cwdError` checks absolute-ness only, not existence

What: the panel disables Run only when `cwd !== "" && !isAbsoluteRunPath(cwd)`; a typed absolute path that does not exist or is a file is accepted by the button.
Why it matters: the Rust `validate` rejects it (`is_dir` check, `impl_runstate.rs:44-54`), so the user gets a console error rather than a disabled button — consistent with how program existence is handled, but the two checks are asymmetric with the frontend's earlier `program === ""` gate.
Concrete fix: acceptable as-is because the backend error is named; if preflight is wanted, mirror `isAbsoluteRunPath` with a stat IPC. No change required for correctness.

### Checked, no issue (named items that turned out sound)

- Env list expressing a value containing `=`: `useRunForm.ts:62-72` splits the quick-add input on the _first_ `=` (`raw.indexOf("=")`), so `value = raw.slice(eq + 1)` retains any further `=` characters; stored as structured `[name, value]` tuples on both sides (`run-configuration.ts`, `settings_file.rs:95`), so `=` in a value is represented exactly.
- Args stored as one string then split: the saved path keeps `args` verbatim and splits with the quote-aware `splitArgs` at run time (`useRunControls.ts:88`, `splitArgs.ts`); `joinArgs`/`splitArgs` round-trip is tested in `presets.test.ts`. The only breakage is the default-config path above.
- Program existence: the Rust side validates `program_path.is_file()` and returns a message naming the path (`impl_runstate.rs:31-42`, `tests_items.rs:110-118`), so a missing program is not a bare error; the frontend's `program === ""` gate is a UX convenience, not the check.
- Env vars inherited vs replaced: `run_program` calls `command.env(name, value)` per row without `env_clear`, so the parent environment is inherited and listed rows override by name; `None`/empty normalises to "inherit all" (`validate_env`, `impl_runstate.rs:59-76`). Empty value sets an empty string (not an unset).
- Rust `validate` also rejects a non-directory cwd with a named error (`tests_items.rs:96-107`).
- Duplicate env names are blocked in the UI (`envProblem`, `parts.ts`) and `validate_env` checks name shape; a hand-edited settings file with duplicates would let the last row win, which is a minor gap, not a crash.

## Notes

- `useRunFormMemory` memory map excludes `program` by type (`{ args, cwd, env }`); the fix above widens that type.
- No edits were made to source.
