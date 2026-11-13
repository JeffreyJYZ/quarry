//! The four command lines a CMake build can run.
//!
//! Two shapes: `cmake --preset …` when the project declares a preset, and the explicit
//! `-S … -B …` recipe when it does not, each paired with its build half. Why each flag is added or
//! left out is decided in [`super::plan`]; these functions only spell the argv out.

#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

pub use crate::build_task::{BuildProfile, CMAKE_PROGRAM, cmake_config};

use super::*;

/// Configure the way a project without a preset always has.
///
/// The build type is not optional: a single-config generator ignores `--config` at build time and
/// falls back to an empty build type, which means no `-g` and therefore no debug info.
pub fn cmake_configure_argv(
    source_root: &str,
    build_root: &str,
    profile: impl Into<BuildProfile>,
) -> Vec<String> {
    cmake_configure_argv_with(source_root, build_root, Some(cmake_config(profile)))
}

/// Configure a tree, naming the build type only when the generator takes one at configure time.
///
/// `build_type` is `None` for a multi-config generator: it chooses its configuration on the build
/// command line, and a `-DCMAKE_BUILD_TYPE` there is a value the tree never uses.
pub fn cmake_configure_argv_with(
    source_root: &str,
    build_root: &str,
    build_type: Option<&str>,
) -> Vec<String> {
    let mut argv = vec![
        CMAKE_PROGRAM.to_string(),
        "-S".to_string(),
        source_root.to_string(),
        "-B".to_string(),
        build_root.to_string(),
    ];
    if let Some(build_type) = build_type {
        argv.push(format!("-DCMAKE_BUILD_TYPE={build_type}"));
    }
    argv.push("-DCMAKE_EXPORT_COMPILE_COMMANDS=ON".to_string());
    argv
}

/// `cmake --build <build root> --config <configuration> [--target <name>]`.
///
/// `--target` is what asks for one executable; without it the build runs every target the tree has,
/// which stays the behaviour of the plain Build action. A target named here is passed for a
/// multi-config generator too, where the configuration and the target are independent flags.
pub fn cmake_build_argv(
    build_root: &str,
    profile: impl Into<BuildProfile>,
    target: Option<&str>,
) -> Vec<String> {
    let mut argv = vec![
        CMAKE_PROGRAM.to_string(),
        "--build".to_string(),
        build_root.to_string(),
        "--config".to_string(),
        cmake_config(profile).to_string(),
    ];
    if let Some(target) = target.map(str::trim).filter(|name| !name.is_empty()) {
        argv.push("--target".to_string());
        argv.push(target.to_string());
    }
    argv
}

/// `cmake --preset <name> -S … -B …` plus what the preset leaves to the command line.
pub fn preset_configure_argv(
    name: &str,
    source_root: &str,
    build_root: &str,
    build_type: Option<&str>,
    database: bool,
    toolchain: Option<&str>,
) -> Vec<String> {
    let mut argv = vec![
        CMAKE_PROGRAM.to_string(),
        "--preset".to_string(),
        name.to_string(),
        "-S".to_string(),
        source_root.to_string(),
        "-B".to_string(),
        build_root.to_string(),
    ];
    if let Some(build_type) = build_type {
        argv.push(format!("-DCMAKE_BUILD_TYPE={build_type}"));
    }
    if database {
        argv.push("-DCMAKE_EXPORT_COMPILE_COMMANDS=ON".to_string());
    }
    if let Some(toolchain) = toolchain {
        argv.push(format!("-DCMAKE_TOOLCHAIN_FILE={toolchain}"));
    }
    argv
}

/// `cmake --build --preset <name> --config <configuration> [--target <name>]`.
pub fn preset_build_argv(name: &str, configuration: &str, target: Option<&str>) -> Vec<String> {
    let mut argv = vec![
        CMAKE_PROGRAM.to_string(),
        "--build".to_string(),
        "--preset".to_string(),
        name.to_string(),
        "--config".to_string(),
        configuration.to_string(),
    ];
    if let Some(target) = target.map(str::trim).filter(|name| !name.is_empty()) {
        argv.push("--target".to_string());
        argv.push(target.to_string());
    }
    argv
}
