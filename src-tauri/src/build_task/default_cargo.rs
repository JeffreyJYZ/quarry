#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
pub use serde_json::Value;
pub use std::collections::HashSet;
pub use std::path::Path;
pub use std::process::Command;
pub use std::time::Instant;

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

/// Program that builds CMake projects; the tool must be installed on the machine.
pub const CMAKE_PROGRAM: &str = "cmake";

/// Diagnostics from a CMake build carry this source, so the panel can label them.
pub const CMAKE_SOURCE: &str = "cmake";

/// CMake names its configurations like this.
pub const CMAKE_CONFIG_DEBUG: &str = "Debug";

pub const CMAKE_CONFIG_RELEASE: &str = "Release";

/// A generator file in the build root means the project is configured already.
pub const CMAKE_GENERATOR_FILES: [&str; 2] = ["build.ninja", "Makefile"];

/// Status-bar summary for a CMake build that printed nothing at all.
pub const DEFAULT_CPP_SUMMARY: &str = "cmake build finished";

/// `profile` is `debug` or `release`; anything else is an error naming the accepted values.
#[tauri::command]
pub async fn build_project(root: String, profile: String) -> Result<BuildReport, String> {
    let release = release_for(&profile)?;
    tauri::async_runtime::spawn_blocking(move || build(&root, release))
        .await
        .map_err(|error| format!("build task failed: {error}"))?
}

/// Detection and the build both touch the filesystem, so both run off the async runtime.
pub fn build(root: &str, release: bool) -> Result<BuildReport, String> {
    let info = project::inspect(root)?;
    match info.kind {
        ProjectKind::Cargo => {
            require_cargo(info.kind)?;
            run_build(&info.build_root, release)
        }
        ProjectKind::Cmake => run_cmake_build(&info.root, &info.build_root, release),
        ProjectKind::CompileCommands => run_plain_clang_build(&info.root, &info.name),
        ProjectKind::Unknown => run_plain_clang_build(&info.root, &info.name),
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

pub fn cpp_not_wired(marker: &str) -> String {
    format!(
        "C/C++ builds are not wired yet (detected {marker}) in the cargo branch: \
         the cargo branch builds Cargo projects only"
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
pub fn run_build(build_root: &str, release: bool) -> Result<BuildReport, String> {
    let started = Instant::now();
    let program = cargo_program();

    let mut command = crate::resolve::command(&program)?;
    command
        .current_dir(build_root)
        .arg("build")
        .arg("--message-format=json");
    if release {
        command.arg("--release");
    }

    let output = command
        .output()
        .map_err(|error| format!("cannot run {program} in {build_root}: {error}"))?;
    let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let parsed = parse_cargo_json(&stdout, Path::new(build_root));

    Ok(BuildReport {
        success: parsed.success.unwrap_or_else(|| output.status.success()),
        diagnostics: parsed.diagnostics,
        duration_ms,
        summary: summarize(&stderr, &parsed.unlocated),
        artifact: parsed.artifact,
    })
}
