#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
pub use serde_json::Value;
pub use std::collections::HashSet;
pub use std::path::Path;
pub use std::process::Command;
pub use std::time::{Instant, SystemTime};
pub use tauri::State;

use super::*;

/// Program used when the environment does not name one; rustup installs it as a shim.
pub const DEFAULT_CARGO: &str = "cargo";

/// Environment variable cargo sets for build scripts and that rustup honours.
pub const CARGO_ENV: &str = "CARGO";

/// Diagnostics from a build carry a single source, so the panel can label them.
pub const SOURCE: &str = "cargo";

/// Status-bar summary limit; cargo's last stderr line can be a whole error block.
pub const SUMMARY_LIMIT: usize = 200;

pub const DEFAULT_SUMMARY: &str = "cargo build succeeded";

/// Status-bar summary for a failed cargo build that printed nothing at all.
pub const FAILED_SUMMARY: &str = "cargo build failed";

/// Program that builds CMake projects; the tool must be installed on the machine.
pub const CMAKE_PROGRAM: &str = "cmake";

/// Diagnostics from a CMake build carry this source, so the panel can label them.
pub const CMAKE_SOURCE: &str = "cmake";

/// CMake names its configurations like this.
pub const CMAKE_CONFIG_DEBUG: &str = "Debug";

pub const CMAKE_CONFIG_RELEASE: &str = "Release";

/// Status-bar summary for a CMake build that printed nothing at all.
pub const DEFAULT_CPP_SUMMARY: &str = "cmake build finished";

/// `profile` is `debug` or `release`; anything else is an error naming the accepted values.
#[tauri::command]
pub async fn build_project(
    state: State<'_, BuildState>,
    root: String,
    profile: String,
) -> Result<BuildReport, String> {
    let release = release_for(&profile)?;
    // The managed copy and the blocking task share one slot, so a stop and the exit path can reach
    // the child while this call waits for the report.
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || build(&state, &root, release))
        .await
        .map_err(|error| format!("build task failed: {error}"))?
}

/// Detection and the build both touch the filesystem, so both run off the async runtime.
pub fn build(state: &BuildState, root: &str, release: bool) -> Result<BuildReport, String> {
    let info = project::inspect(root)?;
    match info.kind {
        ProjectKind::Cargo => {
            require_cargo(info.kind)?;
            run_build(state, &info.build_root, release)
        }
        ProjectKind::Cmake => run_cmake_build(state, &info.root, release),
        ProjectKind::CompileCommands => run_plain_clang_build(state, &info.root, &info.name),
        ProjectKind::Unknown => run_plain_clang_build(state, &info.root, &info.name),
    }
}

/// Maps the wire profile onto cargo's `--release` flag.
pub fn release_for(profile: &str) -> Result<bool, String> {
    match profile {
        "debug" => Ok(false),
        "release" => Ok(true),
        other => Err(format!(
            "unsupported build profile {other:?}: expected \"debug\" or \"release\""
        )),
    }
}

/// The cargo branch accepts Cargo projects only.
///
/// The C/C++ kinds have their own branches, so reaching this gate with one of them means a
/// mis-dispatch; the gate still refuses them rather than guessing a command.
pub fn require_cargo(kind: ProjectKind) -> Result<(), String> {
    match kind {
        ProjectKind::Cargo => Ok(()),
        ProjectKind::Cmake => Err(cpp_not_wired("CMakeLists.txt")),
        ProjectKind::CompileCommands => Err(cpp_not_wired("compile_commands.json")),
        ProjectKind::Unknown => Err(no_build_system()),
    }
}

/// The cargo branch was handed a C/C++ project it does not build.
///
/// The C/C++ kinds have their own branches and are shipped, so reaching this gate means the
/// dispatch chose the wrong branch. Saying the feature is "not wired yet" told the user a working
/// build was missing; the message now names what actually happened.
pub fn cpp_not_wired(marker: &str) -> String {
    format!(
        "the cargo branch cannot build a C/C++ project (detected {marker}): cargo builds Cargo \
         projects only, so this build was dispatched to the wrong branch"
    )
}

/// A `compile_commands.json` project names no build system, so the message names the kind and
/// points at the `build` hint in the launch config.
#[allow(dead_code)] // used only by tests in this module
pub fn compile_commands_not_wired() -> String {
    "compile-commands project (compile_commands.json): no build system is known, so quarry \
     cannot build it. Add a `build` command to .quarry/launch.json to say how to build it"
        .to_string()
}

/// Nothing in the directory tree marks a build system.
pub fn no_build_system() -> String {
    "no build system detected in this project: nothing to build".to_string()
}

/// Runs the build and reports. Called on a blocking thread so the async runtime stays free.
pub fn run_build(
    state: &BuildState,
    build_root: &str,
    release: bool,
) -> Result<BuildReport, String> {
    let started = Instant::now();
    // The moment the build begins: the boundary between a file this run wrote and one an earlier
    // run left behind. Read before the spawn so nothing the build writes can predate it.
    let started_at = SystemTime::now();
    let program = cargo_program();

    let mut command = crate::resolve::command(&program)?;
    command
        .current_dir(build_root)
        .arg("build")
        .arg("--message-format=json");
    if release {
        command.arg("--release");
    }

    // Its own process group, held in the build state: a stop signals the group and quitting kills
    // it, where `Command::output()` left a cancelled or hung build compiling with no handle.
    let captured = run_child(state, &mut command, &program, build_root)?;
    let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);

    let stdout = String::from_utf8_lossy(&captured.stdout);
    let stderr = String::from_utf8_lossy(&captured.stderr);
    let parsed = parse_cargo_json(&stdout, Path::new(build_root));
    let success = !captured.stopped && parsed.success.unwrap_or(captured.success);

    Ok(BuildReport {
        success,
        diagnostics: parsed.diagnostics,
        duration_ms,
        summary: if captured.stopped {
            CANCELLED_SUMMARY.to_string()
        } else {
            summarize(&stderr, &parsed.unlocated, success)
        },
        // Cargo names the executable of the unit it built, so there is nothing to guess and no
        // filesystem walk: a `target/` sweep would find build scripts and dependency binaries,
        // and launching one of those is worse than reporting that the build produced no program.
        artifact: choose_artifact(&[], started_at, parsed.artifact.as_deref()),
    })
}
