#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::ProjectInfo;
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// The standard a kind accepts, or its default when the caller passed nothing.
///
/// A C++ standard offered to a C project is a mistake worth naming rather than silently rewriting,
/// so an unknown value is an error, never a fallback.
pub fn resolve_standard(kind: &str, requested: &str) -> Result<String, String> {
    let (allowed, default): (&[&str], &str) = match kind {
        "rust-bin" | "rust-lib" => (&RUST_EDITIONS, "2024"),
        "c-cmake" => (&C_STANDARDS, "17"),
        "cpp-cmake" => (&CPP_STANDARDS, "20"),
        _ => return Ok(String::new()),
    };
    if requested.is_empty() {
        return Ok(default.to_string());
    }
    if allowed.contains(&requested) {
        return Ok(requested.to_string());
    }
    Err(format!(
        "standard \"{requested}\" is not available for {kind}; accepted values: {}",
        allowed.join(", ")
    ))
}

pub fn rust_cargo_toml(name: &str, edition: &str) -> String {
    format!(
        "[package]\nname = \"{name}\"\nversion = \"0.1.0\"\nedition = \"{edition}\"\n\n[dependencies]\n"
    )
}

pub fn cpp_cmake_lists(name: &str, standard: &str) -> String {
    format!(
        "cmake_minimum_required(VERSION 3.20)\nproject({name} CXX)\n\nset(CMAKE_CXX_STANDARD {standard})\nset(CMAKE_CXX_STANDARD_REQUIRED ON)\n\nadd_executable({name} src/main.cpp)\n"
    )
}

pub fn c_cmake_lists(name: &str, standard: &str) -> String {
    format!(
        "cmake_minimum_required(VERSION 3.20)\nproject({name} C)\n\nset(CMAKE_C_STANDARD {standard})\nset(CMAKE_C_STANDARD_REQUIRED ON)\n\nadd_executable({name} src/main.c)\n"
    )
}
