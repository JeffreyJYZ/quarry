# Plan 002 — Run and Debug with one click

Target: CLion's daily loop. Open a Rust or C/C++ project, press one button, see it run; press the
bug and land in a stopped debug session with the source in front of you. No configuration file, no
typed binary path, no preset required.

## What is wrong today

- The title bar has no Run or Debug control at all. Its right slot holds only the update badge.
- Running means opening the Run dock and typing a program path into a form, because `runProgram`
  takes whatever text is in that field.
- Debugging means opening the debugger column, choosing a row in a launch select and pressing
  Launch. A project without `.quarry/launch.json` shows "no presets" and one Cargo-only fallback.
- A missing binary is an offer to build, then press Launch again. Two clicks and a wait, and the
  first press looks like a failure.
- A multi-binary Cargo workspace can only debug the one target whose name matches the package.
- A stop does not reveal its source. `useDebugEvents` updates the stop view, and the editor only
  moves if the user clicks a frame in the call stack, so a debug session looks like nothing
  happened.
- Nothing opens the debugger column on launch, so the first press of anything is invisible unless
  the panel was already open.
- There is no `Shift+F10`, `Shift+F9` or `Cmd+F2`; the keymap has `F9`-to-toggle-breakpoint only.

CLion, by contrast, puts a configuration dropdown with a green Run and a bug Debug in the toolbar,
auto-creates a configuration per Cargo/CMake target, builds before launch, and reports problems in
the run console.

## Design

### One control, in the title bar

`[ target ▾ ]  [▶ Run]  [🐞 Debug]  [⏹ Stop]` sits in the title bar's right slot, before the update
badge. Run and Debug are enabled whenever a project is open; Stop only while something runs.
The dropdown lists the auto-detected targets and ends with `···`, which opens the debugger column
where presets live.

Shortcuts match CLion on macOS: `Ctrl+R` run, `Ctrl+D` debug, `Ctrl+F2` stop, with `Shift+F10` and
`Shift+F9` as the Windows-style aliases everyone also knows.

### Auto-detected targets

A new backend command lists them, so a fresh project has a runnable entry before any file exists:

```rust
pub struct RunTarget {
    pub id: String,      // "cargo:<package>:<bin>" or "cpp:<name>"
    pub label: String,   // what the dropdown shows
    pub kind: String,    // "cargo" | "cpp"
    pub package: String, // empty for cpp
    pub target: String,  // bin name, or the executable stem for cpp
}

async fn list_run_targets(root: String) -> Result<Vec<RunTarget>, String>;
async fn resolve_run_target(root: String, id: String, stop_on_entry: bool) -> Result<LaunchConfig, String>;
```

`list_run_targets` runs `cargo metadata` for a Cargo project and returns every bin target, in
manifest order, labelled `bin (package)` when the workspace has more than one package. A C/C++
project gets one entry per executable the build knows about, from `compile_commands.json` or the
conventional build directory, labelled by executable name. Resolution failure is not an error here:
the list must render even when the project has never been built.

`resolve_run_target` returns the same `LaunchConfig` shape the preset path returns, for one target,
and keeps the measured requirements: the Rust `lldb_lookup.py` init command, the absolute program
path, and the project root as `cwd`.

### Build, then launch

Run and Debug both build first with the current profile, then resolve, then start. The build is the
"Before launch" step CLion does, not a prompt:

1. `buildProject(root, profile)` — the existing command, whose report already carries `artifact`.
2. `resolveRunTarget(root, id, stopOnEntry)` — after the build, so a first run of a fresh checkout
   works.
3. Run: `runProgram(program, args, cwd)`, streaming to the Run dock. Debug: `dapLaunch(config)`.

A failed build stops there and reports in the Run dock, keeping the diagnostics the build just
published. A successful build's `artifact` overrides the resolved program, so Rust picks the binary
cargo just wrote.

### What stays

`.quarry/launch.json` presets keep working as their own launch select inside the debugger column, and
`Edit configurations` in the title bar opens that column. They are deliberately not merged into the
title-bar dropdown: a preset needs the preset path (`resolve_launch_config`) while a detected target
needs the target path, and one dropdown that silently chooses between two resolvers is the kind of
ambiguity that produces "it launched the wrong binary" bugs. The Run dock keeps its form for ad-hoc
commands. The debugger column keeps presets, attach, memory and disassembly.

### The debugger window

CLion keeps the debugger in a bottom tool window, not a side column, and its transport controls are
icons rather than a wall of buttons. quarry follows that: the bottom dock grows `debugger`,
`console` and `memory` tabs beside `problems` and `tests`.

- `debugger` is three columns — frames, then variables and watches, then breakpoints — with a 34px
  icon rail on the left carrying continue, step over, step into, step out, run to cursor, restart
  and stop.
- `console` is what the debuggee printed, from the adapter's `output` events.
- `memory` is the dump and the disassembly, with an address field each instead of a pane that only
  reacts to whatever happened to be selected.
- Launch configurations, attach and exception filters live behind one `…` menu in the dock header,
  so there is exactly one Run/Debug control (the title bar) and exactly one place for the rest. The
  word "preset" does not appear in the UI: a configuration is a configuration.

### Seeing the session

A launch opens the debugger tab and the editor follows every stop: the top frame's source is
revealed at its line, so the first press of the bug lands in a stopped session with the caret where
the program stopped. A terminated session clears the highlight and leaves the file open.

A failed launch is also reported as a notice, because an error that only writes a line into a tab
nobody switched to is indistinguishable from a dead button.

### The icon belongs to this slice

An app that looks wrong in the Dock is part of "out of the box", so the icon is drawn on Apple's
1024 grid by `scripts/make-icon.swift`: an 824 plate inset by 100 with the rest transparent. An icon
that fills its canvas is what makes it render oversized beside every other app.

## Slices

| #   | Slice                                              | Files                                                                       |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Backend target listing and per-target resolution   | `src-tauri/src/launch/**`, `src-tauri/src/types/**`, `src-tauri/src/lib.rs` |
| 2   | Frontend API, target hook, build-then-run launcher | `src/lib/project/api/run.ts`, `src/lib/run/**`, `src/lib/debug/**`          |
| 3   | Title-bar widget, shortcuts, styles                | `src/ui/app/**`, `src/ui/styles/**`                                         |

## Acceptance

- A freshly cloned Cargo project with one binary: one press of the bug builds, launches under
  `lldb-dap`, and stops at a breakpoint with the file open and the caret on the line.
- The same project with no breakpoint: the program runs and its output appears in the debug
  console, so the session is visibly alive rather than apparently dead.
- The same project: one press of Run builds, then shows the program's output in the Run dock.
- `Ctrl+R`, `Ctrl+D` and `Ctrl+F2` do what they do in CLion from anywhere outside a text field;
  `Shift+F10` and `Shift+F9` do the same.
- A multi-binary workspace lists every binary and debugging the second one debugs the second one.
- A C++ project lists its built executables.
- A failed build reports in the Run dock and does not leave the Run button stuck.

## Non-goals

Compound configurations, "Run with coverage", remote debugging, attach on launch, and the
`evaluate` watch pane (measured broken for Rust).
