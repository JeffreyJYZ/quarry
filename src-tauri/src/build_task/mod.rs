//! Build runner and compiler diagnostics.
//!
//! Cargo projects build with `cargo build --message-format=json`; the machine-readable stream
//! becomes `Diagnostic`s. CMake projects configure with `cmake -S … -B …` when their build root
//! holds no generator file, then build with `cmake --build`; their diagnostics are parsed from
//! the compiler's plain-text output. A `compile_commands.json` project has no known build system,
//! so it names the kind and points at `.quarry/launch.json` instead of guessing a command.
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

mod split_severity;
pub use split_severity::*;

mod newest_executable;
pub use newest_executable::*;

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
