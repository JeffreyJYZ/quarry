# Preset build command

Scope: `src/lib/debug/buildCommand.ts` (new), `src/lib/debug/useLaunch.ts`, `docs/plans/006-remaining-parity.md`.

## Changes

- `buildCommand.ts` (new): `runPresetBuild` re-reads `.quarry/launch.json`, finds the selected preset and, when its `build` field is non-empty, runs that shell line before the launch starts. A failure sets the error to the command plus the tail of its output and stops the launch; success falls through to the normal resolve-and-launch path.
- `runBuildCommand` streams the command through the existing `run_program` backend: register the output and exit listeners first, buffer lines for a run id that is not known yet, then start the process. A command that prints and exits within the spawn window would otherwise be missed entirely — a real race for `true` or `echo`.
- The shell is `/bin/zsh -lc` on macOS and `cmd.exe /C` on Windows. A login shell is deliberate: a Dock-launched app inherits launchd's `PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`), so `cargo` or `cmake` from Homebrew would not be found without it.
- `failures` are reported as the last 20 lines, not the whole build: enough to name the compile error, short enough to read in the debug panel.
- `useLaunch.ts`: the build runs after the preset-name check and before `resolveConfig`, so a rebuilt binary is what the adapter then launches.

## Why

The preset editor already offered a `build` field and its tooltip promised "run before launch"; nothing ran it. `006-remaining-parity.md` listed it as the one remaining gap in run configuration.

## Verification

- `bun check`: no type errors in 432 files.
- `bunx biome lint src/lib/debug`: zero errors.
- Not verified in a running app: that a real preset's build command produces output through `run_program` and that the login shell finds Homebrew tools. The first can be checked by pressing Debug on a preset with `build: "false"` in `.quarry/launch.json`, which must report the tail and stop.
