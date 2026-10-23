//! Compose a debug launch for a project without a preset.
//!
//! Cargo only: ask `cargo metadata` where the target directory is, take the package's binary target
//! and point `program` at the already-built executable. Nothing here builds, so a missing binary is an
//! error telling the user to build first. `initCommands` carries the Rust formatter entry the spike
//! measured: without it a `Vec<u8>` arrives as the raw `{buf, len}` struct.
//!
//! Only two processes ever run (`cargo metadata` and `rustc --print sysroot`), each on a blocking
//! thread and each awaited to completion. Nothing is written to disk.

use crate::project;
use crate::types::{LaunchConfig, ProjectKind};
use serde_json::Value;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Program used when the environment does not name one; rustup installs it as a shim.
const DEFAULT_CARGO: &str = "cargo";
/// Program that reports the sysroot, resolved the same way.
const RUSTC: &str = "rustc";
/// Environment variable cargo sets for build scripts and that rustup honours.
const CARGO_ENV: &str = "CARGO";
/// Where rustup keeps the LLDB and GDB provider scripts.
const RUSTLIB_ETC: [&str; 3] = ["lib", "rustlib", "etc"];
/// Older toolchains ship this loader, which `command source` pulls in.
const LLDB_COMMANDS: &str = "lldb_commands";
/// Current toolchains ship only this module, which `command script import` loads.
const LLDB_LOOKUP: &str = "lldb_lookup.py";
/// Profile directory cargo writes an unoptimised build into.
const PROFILE_DIR: &str = "debug";
const CARGO_HINT: &str =
    "install the Rust toolchain with rustup (https://rustup.rs), then reopen the project";
const RUSTC_HINT: &str =
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
fn compose(root: &str, stop_on_entry: bool) -> Result<LaunchConfig, String> {
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
fn require_cargo(kind: ProjectKind) -> Result<(), String> {
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

fn preset_needed(marker: &str) -> String {
    format!(
        "launching a {marker} project without a preset is not supported: only Cargo projects can \
         resolve a binary from the manifest, so add a preset in .quarry/launch.json naming the \
         program to debug."
    )
}

/// `CARGO` from the environment when set, else the shim on `PATH` or through `xcrun`.
fn cargo_program() -> Result<String, String> {
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
fn tool_program(name: &str, hint: &str) -> Result<String, String> {
    resolve(name).ok_or_else(|| format!("{name} not found on PATH or through xcrun: {hint}"))
}

fn resolve(name: &str) -> Option<String> {
    find_on_path(name).or_else(|| find_with_xcrun(name))
}

/// Walk `PATH` by hand rather than shelling out, so a directory is never interpreted or expanded.
fn find_on_path(name: &str) -> Option<String> {
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
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    // `metadata` follows symlinks, so a link to a regular file counts as a hit.
    fs::metadata(path)
        .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    fs::metadata(path)
        .map(|meta| meta.is_file())
        .unwrap_or(false)
}

/// Ask `xcrun` for the tool's path; a missing `xcrun`, a non-zero status or a stale path is "not found".
fn find_with_xcrun(name: &str) -> Option<String> {
    let output = Command::new("xcrun").args(["--find", name]).output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let found = stdout.lines().next()?.trim();
    if found.is_empty() || !Path::new(found).exists() {
        return None;
    }

    Some(found.to_string())
}

/// The toolchain's sysroot, which decides where the LLDB providers live.
fn rust_sysroot(rustc: &str) -> Result<PathBuf, String> {
    let output = Command::new(rustc)
        .args(["--print", "sysroot"])
        .output()
        .map_err(|error| format!("cannot run {rustc} --print sysroot: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "{rustc} --print sysroot failed: {}",
            first_line(&String::from_utf8_lossy(&output.stderr))
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let reported = stdout.trim();
    if reported.is_empty() {
        return Err(format!(
            "{rustc} --print sysroot reported no sysroot, so the Rust formatters cannot be located."
        ));
    }

    let sysroot = PathBuf::from(reported);
    if !sysroot.is_dir() {
        return Err(format!(
            "{rustc} reported the sysroot {} which is not a directory.",
            display(&sysroot)
        ));
    }
    Ok(sysroot)
}

/// Runs `cargo metadata` in the manifest directory and parses the JSON it prints.
fn cargo_metadata(cargo: &str, build_root: &str) -> Result<Value, String> {
    let output = Command::new(cargo)
        .current_dir(build_root)
        .args(["metadata", "--no-deps", "--format-version", "1"])
        .output()
        .map_err(|error| format!("cannot run {cargo} metadata in {build_root}: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "{cargo} metadata failed in {build_root}: {}",
            first_line(&String::from_utf8_lossy(&output.stderr))
        ));
    }

    serde_json::from_slice(&output.stdout).map_err(|error| {
        format!("{cargo} metadata in {build_root} did not print valid JSON: {error}")
    })
}

/// Where cargo puts built artifacts, as an absolute path from the metadata.
fn target_directory(metadata: &Value) -> Result<&str, String> {
    metadata["target_directory"]
        .as_str()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            "cargo metadata reported no target directory, so there is no built executable to launch."
                .to_string()
        })
}

/// The binary target to debug: the package's own name when it has one, else its first binary.
fn find_bin_target(metadata: &Value, package: &str) -> Result<String, String> {
    let packages = metadata["packages"]
        .as_array()
        .filter(|packages| !packages.is_empty())
        .ok_or_else(|| {
            "cargo metadata reported no packages in this project, so there is no binary to \
                 launch; add a preset in .quarry/launch.json naming the program to debug."
                .to_string()
        })?;

    let selected = packages
        .iter()
        .find(|candidate| candidate["name"].as_str() == Some(package))
        .or_else(|| (packages.len() == 1).then(|| &packages[0]))
        .ok_or_else(|| {
            format!(
                "cargo metadata reported several packages ({}) and none is named \"{package}\", so \
                 which binary to launch is ambiguous; add a preset in .quarry/launch.json or open \
                 the crate directory.",
                package_names(packages)
            )
        })?;

    let package_name = selected["name"].as_str().unwrap_or(package);
    let bins = bin_names(selected);
    if bins.is_empty() {
        return Err(format!(
            "cargo metadata reports no binary target for package \"{package_name}\", so there is \
             nothing to launch; add a preset in .quarry/launch.json naming the program to debug."
        ));
    }

    // A package's own name is the binary a user means when a crate ships several.
    Ok(bins
        .iter()
        .find(|bin| *bin == &package_name)
        .copied()
        .unwrap_or(bins[0])
        .to_string())
}

fn package_names(packages: &[Value]) -> String {
    packages
        .iter()
        .filter_map(|package| package["name"].as_str())
        .collect::<Vec<&str>>()
        .join(", ")
}

/// Names of the package's targets whose `kind` includes `bin`, in manifest order.
fn bin_names(package: &Value) -> Vec<&str> {
    package["targets"]
        .as_array()
        .map(|targets| {
            targets
                .iter()
                .filter(|target| is_bin_target(target))
                .filter_map(|target| target["name"].as_str())
                .collect()
        })
        .unwrap_or_default()
}

fn is_bin_target(target: &Value) -> bool {
    target["kind"]
        .as_array()
        .map(|kinds| kinds.iter().any(|kind| kind.as_str() == Some("bin")))
        .unwrap_or(false)
}

/// `<target_directory>/debug/<bin>`, which is where `cargo build` leaves the executable.
fn program_path(target_directory: &str, bin: &str) -> String {
    display(&Path::new(target_directory).join(PROFILE_DIR).join(bin))
}

fn missing_binary(program: &str, root: &str) -> String {
    format!(
        "{program} does not exist yet: build {root} first (cargo build) and launch again. This \
         configuration never builds for you."
    )
}

/// The LLDB providers to load, preferring the `lldb_commands` loader older toolchains ship.
fn init_commands(sysroot: &Path) -> Vec<String> {
    let etc = rustlib_etc(sysroot);
    select_init_commands(
        &etc,
        etc.join(LLDB_COMMANDS).is_file(),
        etc.join(LLDB_LOOKUP).is_file(),
    )
}

/// `<sysroot>/lib/rustlib/etc`, where rustup keeps the debugger provider scripts.
fn rustlib_etc(sysroot: &Path) -> PathBuf {
    let mut etc = sysroot.to_path_buf();
    for part in RUSTLIB_ETC {
        etc.push(part);
    }
    etc
}

/// One entry when either loader exists, in `lldb_commands`-then-`lldb_lookup.py` order, else none:
/// the launch still works without pretty printers.
fn select_init_commands(etc: &Path, has_commands: bool, has_lookup: bool) -> Vec<String> {
    if has_commands {
        return vec![format!(
            "command source {}",
            display(&etc.join(LLDB_COMMANDS))
        )];
    }
    if has_lookup {
        return vec![format!(
            "command script import {}",
            display(&etc.join(LLDB_LOOKUP))
        )];
    }
    Vec::new()
}

fn first_line(text: &str) -> String {
    text.lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Metadata as `cargo metadata --no-deps` prints it, reduced to the fields this module reads.
    fn metadata(json: &str) -> Value {
        serde_json::from_str(json).expect("metadata fixture is valid JSON")
    }

    fn one_bin() -> Value {
        metadata(
            r#"{
                "target_directory": "/work/demo/target",
                "packages": [{
                    "name": "demo",
                    "targets": [
                        { "name": "demo_lib", "kind": ["lib"] },
                        { "name": "demo", "kind": ["bin"] }
                    ]
                }]
            }"#,
        )
    }

    #[test]
    fn a_packages_only_binary_target_is_the_program() {
        let bin = find_bin_target(&one_bin(), "demo").expect("one bin resolves");

        assert_eq!(bin, "demo");
        assert_eq!(
            program_path(target_directory(&one_bin()).expect("target dir"), &bin),
            "/work/demo/target/debug/demo"
        );
    }

    #[test]
    fn several_bins_prefer_the_one_named_after_the_package() {
        let metadata = metadata(
            r#"{
                "target_directory": "/work/demo/target",
                "packages": [{
                    "name": "demo",
                    "targets": [
                        { "name": "demo-cli", "kind": ["bin"] },
                        { "name": "demo", "kind": ["bin"] },
                        { "name": "demo-server", "kind": ["bin"] }
                    ]
                }]
            }"#,
        );

        assert_eq!(
            find_bin_target(&metadata, "demo").expect("bins resolve"),
            "demo"
        );
    }

    #[test]
    fn several_bins_without_a_name_match_take_the_first() {
        let metadata = metadata(
            r#"{
                "target_directory": "/work/demo/target",
                "packages": [{
                    "name": "demo",
                    "targets": [
                        { "name": "first-bin", "kind": ["bin"] },
                        { "name": "second-bin", "kind": ["bin"] }
                    ]
                }]
            }"#,
        );

        assert_eq!(
            find_bin_target(&metadata, "demo").expect("bins resolve"),
            "first-bin"
        );
    }

    #[test]
    fn a_package_without_a_bin_target_is_an_error() {
        let metadata = metadata(
            r#"{
                "target_directory": "/work/demo/target",
                "packages": [{
                    "name": "demo",
                    "targets": [{ "name": "demo_lib", "kind": ["lib"] }]
                }]
            }"#,
        );

        let error = find_bin_target(&metadata, "demo").expect_err("no bin target must fail");

        assert!(error.contains("demo"), "unexpected error: {error}");
        assert!(error.contains("binary target"), "unexpected error: {error}");
        assert!(
            error.contains(".quarry/launch.json"),
            "error names no escape hatch: {error}"
        );
    }

    #[test]
    fn metadata_without_a_target_directory_is_an_error() {
        let metadata = metadata(r#"{ "packages": [] }"#);

        let error = target_directory(&metadata).expect_err("no target directory must fail");

        assert!(
            error.contains("target directory"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn lldb_commands_wins_over_lldb_lookup() {
        let etc = Path::new("/toolchains/stable-aarch64-apple-darwin/lib/rustlib/etc");

        let commands = select_init_commands(etc, true, true);

        assert_eq!(
            commands,
            vec![
                "command source /toolchains/stable-aarch64-apple-darwin/lib/rustlib/etc/lldb_commands"
                    .to_string()
            ]
        );
    }

    #[test]
    fn lldb_lookup_is_the_fallback_a_modern_toolchain_needs() {
        let etc = Path::new("/toolchains/stable-aarch64-apple-darwin/lib/rustlib/etc");

        let commands = select_init_commands(etc, false, true);

        assert_eq!(
            commands,
            vec![
                "command script import \
                 /toolchains/stable-aarch64-apple-darwin/lib/rustlib/etc/lldb_lookup.py"
                    .to_string()
            ]
        );
    }

    #[test]
    fn no_provider_files_means_no_init_commands_and_no_error() {
        let etc = Path::new("/toolchains/stable-aarch64-apple-darwin/lib/rustlib/etc");

        assert!(select_init_commands(etc, false, false).is_empty());
    }

    #[test]
    fn both_provider_paths_compose_under_lib_rustlib_etc() {
        let sysroot = Path::new("/toolchains/stable-aarch64-apple-darwin");

        let etc = rustlib_etc(sysroot);

        assert_eq!(
            etc,
            PathBuf::from("/toolchains/stable-aarch64-apple-darwin/lib/rustlib/etc")
        );
        assert!(
            etc.join(LLDB_COMMANDS)
                .ends_with("lib/rustlib/etc/lldb_commands")
        );
        assert!(
            etc.join(LLDB_LOOKUP)
                .ends_with("lib/rustlib/etc/lldb_lookup.py")
        );
    }

    #[test]
    fn a_missing_binary_asks_for_a_build() {
        let error = missing_binary("/work/demo/target/debug/demo", "/work/demo");

        assert!(
            error.contains("/work/demo/target/debug/demo"),
            "error names no program: {error}"
        );
        assert!(error.contains("build"), "error asks for no build: {error}");
        assert!(error.contains("/work/demo"), "error names no root: {error}");
    }

    #[test]
    fn a_non_cargo_project_asks_for_a_preset() {
        for kind in [
            ProjectKind::Cmake,
            ProjectKind::CompileCommands,
            ProjectKind::Unknown,
        ] {
            let error = require_cargo(kind).expect_err("only Cargo resolves a binary");
            assert!(
                error.contains(".quarry/launch.json"),
                "{kind:?} error names no preset file: {error}"
            );
        }
    }

    #[test]
    fn a_preset_is_not_needed_for_cargo() {
        assert!(require_cargo(ProjectKind::Cargo).is_ok());
    }

    #[test]
    fn an_ambiguous_workspace_names_the_packages() {
        let metadata = metadata(
            r#"{
                "target_directory": "/work/demo/target",
                "packages": [
                    { "name": "alpha", "targets": [{ "name": "alpha", "kind": ["bin"] }] },
                    { "name": "beta", "targets": [{ "name": "beta", "kind": ["bin"] }] }
                ]
            }"#,
        );

        let error = find_bin_target(&metadata, "gamma").expect_err("no package match must fail");

        assert!(error.contains("alpha"), "unexpected error: {error}");
        assert!(error.contains("beta"), "unexpected error: {error}");
        assert!(error.contains("gamma"), "unexpected error: {error}");
    }
}
