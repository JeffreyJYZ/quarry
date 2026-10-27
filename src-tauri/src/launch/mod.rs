//! Compose the launch configuration for a project without a preset.
//!
//! Cargo: ask `cargo metadata` where the target directory is, take the package's binary target and
//! point `program` at the already-built executable. Nothing here builds, so a missing binary is an
//! error telling the user to build first. `initCommands` carries the Rust formatter entry the spike
//! measured: without it a `Vec<u8>` arrives as the raw `{buf, len}` struct.
//!
//! C/C++: no manifest names the executable, so [`compose_cpp`] probes the conventional build outputs
//! and, when nothing is built yet, names the path that build will write. The form is prefilled
//! either way instead of failing like the Cargo branch does.
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

mod default_cpp;
pub use default_cpp::*;

mod find_with_xcrun;
pub use find_with_xcrun::*;

mod is_bin_target;
pub use is_bin_target::*;

mod targets;
pub use targets::*;

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

mod tests_6;
pub use tests_6::*;

/// The launch configuration for a project that has no preset, chosen by project kind.
///
/// Cargo resolves a binary from the manifest and refuses a project that is not Cargo; every other
/// kind gets the conventional C/C++ composition, which never fails on a project that was opened
/// successfully.
pub fn compose(root: &str, stop_on_entry: bool) -> Result<LaunchConfig, String> {
    let info = project::inspect(root)?;
    match info.kind {
        ProjectKind::Cargo => compose_cargo(&info, stop_on_entry),
        ProjectKind::Cmake | ProjectKind::CompileCommands | ProjectKind::Unknown => {
            Ok(compose_cpp(&info, stop_on_entry))
        }
    }
}
