//! Build runner and compiler diagnostics.
//!
//! Cargo projects build with `cargo build --message-format=json`; the machine-readable stream
//! becomes `Diagnostic`s. CMake projects configure with `cmake -S … -B …` when their build root
//! holds no generator file, then build with `cmake --build`; their diagnostics are parsed from
//! the compiler's plain-text output. A project whose only marker is `compile_commands.json` builds
//! with clang directly, using the include paths and defines its database records.
//!
//! A CMake configure also asks CMake's file API for the project model, and the reply becomes a
//! compiler database where the generator writes none (Xcode, Visual Studio, Ninja Multi-Config).
//!
//! A failing build is a result, not a command error: only a missing tool or a spawn failure is
//! `Err`. The build never runs the program and never writes into the source tree.

#![allow(unused_imports)]
pub(crate) use crate::project;
pub(crate) use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
pub use serde_json::Value;
pub use std::collections::HashSet;
pub use std::path::Path;
pub use std::process::Command;
pub use std::time::Instant;

mod build_state;
pub use build_state::*;

mod run_child;
pub use run_child::*;

mod default_cargo;
pub use default_cargo::*;

mod parsedbuild;
pub use parsedbuild::*;

mod absolute_path;
pub use absolute_path::*;

mod cmakeoutcome;
pub use cmakeoutcome::*;

mod collect_plain_clang_sources;
pub use collect_plain_clang_sources::*;

mod run_plain_clang;
pub use run_plain_clang::*;

mod split_severity;
pub use split_severity::*;

mod choose_artifact;
pub use choose_artifact::*;

mod newest_executable;
pub use newest_executable::*;

mod cmake_artifact;
pub use cmake_artifact::*;

mod cmake_output;
pub use cmake_output::*;

mod cmake_model;
pub use cmake_model::*;

mod tests_1;
pub use tests_1::*;

mod tests_2;
pub use tests_2::*;

mod tests_3;
pub use tests_3::*;

mod tests_4;
pub use tests_4::*;

mod tests_5;
pub use tests_5::*;

mod tests_choice;
pub use tests_choice::*;

mod tests_plain_clang_sources;
pub use tests_plain_clang_sources::*;

mod tests_plain_clang_flags;
pub use tests_plain_clang_flags::*;

mod tests_cmake_artifact;
pub use tests_cmake_artifact::*;

mod tests_build;
pub use tests_build::*;
