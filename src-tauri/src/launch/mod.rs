//! Compose a debug launch for a project without a preset.
//!
//! Cargo only: ask `cargo metadata` where the target directory is, take the package's binary target
//! and point `program` at the already-built executable. Nothing here builds, so a missing binary is an
//! error telling the user to build first. `initCommands` carries the Rust formatter entry the spike
//! measured: without it a `Vec<u8>` arrives as the raw `{buf, len}` struct.
//!
//! Only two processes ever run (`cargo metadata` and `rustc --print sysroot`), each on a blocking
//! thread and each awaited to completion. Nothing is written to disk.

#![allow(unused_imports)]
pub(crate) use crate::project;
pub(crate) use crate::types::{LaunchConfig, ProjectKind};
pub use serde_json::Value;
pub use std::env;
pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::process::Command;

mod default_cargo;
pub use default_cargo::*;

mod find_with_xcrun;
pub use find_with_xcrun::*;

mod is_bin_target;
pub use is_bin_target::*;

mod tests_1;
pub use tests_1::*;

mod tests_2;
pub use tests_2::*;
