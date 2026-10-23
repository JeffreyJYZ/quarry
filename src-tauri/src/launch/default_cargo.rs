#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{LaunchConfig, ProjectKind};
pub use serde_json::Value;
pub use std::env;
pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::process::Command;

use super::*;

/// Program used when the environment does not name one; rustup installs it as a shim.
pub const DEFAULT_CARGO: &str = "cargo";

/// Program that reports the sysroot, resolved the same way.
pub const RUSTC: &str = "rustc";

/// Environment variable cargo sets for build scripts and that rustup honours.
pub const CARGO_ENV: &str = "CARGO";

/// Where rustup keeps the LLDB and GDB provider scripts.
pub const RUSTLIB_ETC: [&str; 3] = ["lib", "rustlib", "etc"];

/// Older toolchains ship this loader, which `command source` pulls in.
pub const LLDB_COMMANDS: &str = "lldb_commands";

/// Current toolchains ship only this module, which `command script import` loads.
pub const LLDB_LOOKUP: &str = "lldb_lookup.py";

/// Profile directory cargo writes an unoptimised build into.
pub const PROFILE_DIR: &str = "debug";

pub const CARGO_HINT: &str =
    "install the Rust toolchain with rustup (https://rustup.rs), then reopen the project";

pub const RUSTC_HINT: &str =
    "install the Rust toolchain with rustup (https://rustup.rs), then reopen the project";

/// Builds the launch configuration for an unconfigured project without running a build.
#[tauri::command]
pub async fn default_launch_config(
    root: String,
    stop_on_entry: bool,
) -> Result<LaunchConfig, String> {
    tauri::async_runtime::spawn_blocking(move || compose(&root, stop_on_entry))
        .await
        .map_err(|error| format!("launch task failed: {error}"))?
}

/// Detection, `cargo metadata` and `rustc --print sysroot` all touch the filesystem or spawn, so the
/// whole composition runs off the async runtime.
pub fn compose(root: &str, stop_on_entry: bool) -> Result<LaunchConfig, String> {
    let info = project::inspect(root)?;
    require_cargo(info.kind)?;

    let cargo = cargo_program()?;
    let rustc = tool_program(RUSTC, RUSTC_HINT)?;
    let sysroot = rust_sysroot(&rustc)?;

    let metadata = cargo_metadata(&cargo, &info.build_root)?;
    let bin = find_bin_target(&metadata, &info.name)?;
    let program = program_path(target_directory(&metadata)?, &bin);

    if !Path::new(&program).is_file() {
        return Err(missing_binary(&program, &info.root));
    }

    Ok(LaunchConfig {
        program,
        args: Vec::new(),
        cwd: info.root,
        stop_on_entry,
        init_commands: init_commands(&sysroot),
    })
}

/// Only Cargo projects can be launched without a preset; the other kinds must say so.
pub fn require_cargo(kind: ProjectKind) -> Result<(), String> {
    match kind {
        ProjectKind::Cargo => Ok(()),
        ProjectKind::Cmake => Err(preset_needed("CMake")),
        ProjectKind::CompileCommands => Err(preset_needed("compile_commands.json")),
        ProjectKind::Unknown => Err(
            "no Cargo project detected in this directory, so there is no binary to launch; \
             add a preset in .quarry/launch.json naming the program to debug."
                .to_string(),
        ),
    }
}

pub fn preset_needed(marker: &str) -> String {
    format!(
        "launching a {marker} project without a preset is not supported: only Cargo projects can \
         resolve a binary from the manifest, so add a preset in .quarry/launch.json naming the \
         program to debug."
    )
}

/// `CARGO` from the environment when set, else the shim on `PATH` or through `xcrun`.
pub fn cargo_program() -> Result<String, String> {
    if let Some(value) = env::var(CARGO_ENV)
        .ok()
        .filter(|value| !value.trim().is_empty())
    {
        return Ok(value);
    }
    tool_program(DEFAULT_CARGO, CARGO_HINT)
}

/// `PATH` first, then `xcrun`: a GUI-launched app inherits launchd's `PATH`, so the rustup shims and
/// the Apple toolchain are not both visible from the environment alone.
pub fn tool_program(name: &str, hint: &str) -> Result<String, String> {
    resolve(name).ok_or_else(|| format!("{name} not found on PATH or through xcrun: {hint}"))
}

pub fn resolve(name: &str) -> Option<String> {
    find_on_path(name).or_else(|| find_with_xcrun(name))
}

/// Walk `PATH` by hand rather than shelling out, so a directory is never interpreted or expanded.
pub fn find_on_path(name: &str) -> Option<String> {
    let path = env::var_os("PATH")?;

    env::split_paths(&path).find_map(|dir| {
        if dir.as_os_str().is_empty() {
            return None;
        }

        let candidate = dir.join(name);
        is_executable(&candidate).then(|| candidate.to_string_lossy().into_owned())
    })
}

#[cfg(unix)]
pub fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    // `metadata` follows symlinks, so a link to a regular file counts as a hit.
    fs::metadata(path)
        .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
pub fn is_executable(path: &Path) -> bool {
    fs::metadata(path)
        .map(|meta| meta.is_file())
        .unwrap_or(false)
}
