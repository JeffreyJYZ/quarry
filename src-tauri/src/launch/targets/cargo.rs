#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{LaunchConfig, ProjectInfo, RunTarget};
pub use serde_json::Value;
pub use std::path::{Path, PathBuf};
pub use std::process::Command;

use super::*;

/// `RunTarget::kind` for a Cargo binary.
pub const CARGO_KIND: &str = "cargo";

/// Every binary target `cargo metadata` reports, in manifest order.
///
/// A package's `targets` array is the manifest order cargo itself uses, so two binaries keep the
/// order the file declared them in. Library, build-script, example, test and bench targets carry
/// none of the `bin` kind, so [`is_bin_target`] is the whole filter.
pub fn cargo_run_targets(metadata: &Value) -> Vec<RunTarget> {
    let packages = metadata["packages"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    let single_package = packages.len() == 1;
    let mut targets = Vec::new();

    for package in packages {
        let package_name = package["name"].as_str().unwrap_or_default();
        let Some(entries) = package["targets"].as_array() else {
            continue;
        };
        for entry in entries {
            if !is_bin_target(entry) {
                continue;
            }
            let Some(bin) = entry["name"].as_str().filter(|bin| !bin.trim().is_empty()) else {
                continue;
            };
            targets.push(RunTarget {
                id: format!("{CARGO_PREFIX}{package_name}:{bin}"),
                label: run_target_label(bin, package_name, single_package),
                kind: CARGO_KIND.to_string(),
                package: package_name.to_string(),
                target: bin.to_string(),
            });
        }
    }

    targets
}

/// `bin` alone when one package answers the workspace, `bin (package)` when several do.
///
/// A one-package workspace would otherwise repeat the same name in every row, and a multi-package
/// one cannot be told apart without it.
pub fn run_target_label(bin: &str, package: &str, single_package: bool) -> String {
    if single_package {
        return bin.to_string();
    }
    format!("{bin} ({package})")
}

/// The binaries this Cargo project declares. `cargo metadata` reads manifests only, so an unbuilt
/// project lists its targets; a missing toolchain or a broken manifest is still an error.
pub fn list_cargo_targets(info: &ProjectInfo) -> Result<Vec<RunTarget>, String> {
    require_cargo(info.kind)?;
    let cargo = cargo_program()?;
    let metadata = cargo_metadata(&cargo, &info.build_root)?;
    Ok(cargo_run_targets(&metadata))
}

/// Compose one named binary from metadata that is already in hand.
///
/// This is the Cargo composition both the default launch and a chosen target share: absolute
/// program path, project root as `cwd`, and the toolchain's LLDB provider script when it exists.
/// Nothing builds, so an executable that is not there yet is the error.
pub fn cargo_launch_config(
    info: &ProjectInfo,
    metadata: &Value,
    bin: &str,
    stop_on_entry: bool,
) -> Result<LaunchConfig, String> {
    let program = program_path(target_directory(metadata)?, bin);
    if !Path::new(&program).is_file() {
        return Err(missing_binary(&program, &info.root));
    }

    let rustc = tool_program(RUSTC, RUSTC_HINT)?;
    let sysroot = rust_sysroot(&rustc)?;

    Ok(LaunchConfig {
        program,
        args: Vec::new(),
        cwd: info.root.clone(),
        stop_on_entry,
        init_commands: init_commands(&sysroot),
    })
}

/// Resolve the one binary an id names, refusing an id the project does not declare.
pub fn resolve_cargo(
    info: &ProjectInfo,
    package: &str,
    target: &str,
    stop_on_entry: bool,
) -> Result<LaunchConfig, String> {
    require_cargo(info.kind)?;
    let cargo = cargo_program()?;
    let metadata = cargo_metadata(&cargo, &info.build_root)?;
    let known = cargo_run_targets(&metadata);
    let found = known
        .iter()
        .find(|candidate| candidate.package == package && candidate.target == target)
        .ok_or_else(|| {
            format!(
                "unknown run target \"{CARGO_PREFIX}{package}:{target}\" in {}: cargo reports {}",
                info.root,
                known_labels(&known)
            )
        })?;

    cargo_launch_config(info, &metadata, &found.target, stop_on_entry)
}

/// The ids a project does declare, for an error a reader can act on.
pub fn known_labels(targets: &[RunTarget]) -> String {
    if targets.is_empty() {
        return "no binary targets".to_string();
    }
    targets
        .iter()
        .map(|target| format!("\"{}\"", target.id))
        .collect::<Vec<String>>()
        .join(", ")
}
