#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{LaunchConfig, ProjectKind};
pub use serde_json::Value;
pub use std::env;
pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::process::Command;

use super::*;

/// Ask `xcrun` for the tool's path; a missing `xcrun`, a non-zero status or a stale path is "not found".
pub fn find_with_xcrun(name: &str) -> Option<String> {
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
pub fn rust_sysroot(rustc: &str) -> Result<PathBuf, String> {
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
pub fn cargo_metadata(cargo: &str, build_root: &str) -> Result<Value, String> {
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
pub fn target_directory(metadata: &Value) -> Result<&str, String> {
    metadata["target_directory"]
        .as_str()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            "cargo metadata reported no target directory, so there is no built executable to launch."
                .to_string()
        })
}

/// The binary target to debug: the package's own name when it has one, else its first binary.
pub fn find_bin_target(metadata: &Value, package: &str) -> Result<String, String> {
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

pub fn package_names(packages: &[Value]) -> String {
    packages
        .iter()
        .filter_map(|package| package["name"].as_str())
        .collect::<Vec<&str>>()
        .join(", ")
}
