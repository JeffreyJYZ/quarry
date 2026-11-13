//! The four command lines a CMake build can run.
//!
//! Two shapes: `cmake --preset …` when the project declares a preset, and the explicit
//! `-S … -B …` recipe when it does not, each paired with its build half. Why each flag is added or
//! left out is decided in [`super::plan`]; these functions only spell the argv out.

#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

pub use crate::build_task::{CMAKE_PROGRAM, cmake_config};

use super::*;

/// Configure the way a project without a preset always has.
///
/// The build type is not optional: a single-config generator ignores `--config` at build time and
/// falls back to an empty build type, which means no `-g` and therefore no debug info.
pub fn cmake_configure_argv(source_root: &str, build_root: &str, release: bool) -> Vec<String> {
    vec![
        CMAKE_PROGRAM.to_string(),
        "-S".to_string(),
        source_root.to_string(),
        "-B".to_string(),
        build_root.to_string(),
        format!("-DCMAKE_BUILD_TYPE={}", cmake_config(release)),
        "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON".to_string(),
    ]
}

/// `cmake --build <build root> --config <Debug|Release>`.
pub fn cmake_build_argv(build_root: &str, release: bool) -> Vec<String> {
    vec![
        CMAKE_PROGRAM.to_string(),
        "--build".to_string(),
        build_root.to_string(),
        "--config".to_string(),
        cmake_config(release).to_string(),
    ]
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

/// `cmake --build --preset <name> --config <configuration>`.
pub fn preset_build_argv(name: &str, configuration: &str) -> Vec<String> {
    vec![
        CMAKE_PROGRAM.to_string(),
        "--build".to_string(),
        "--preset".to_string(),
        name.to_string(),
        "--config".to_string(),
        configuration.to_string(),
    ]
}
