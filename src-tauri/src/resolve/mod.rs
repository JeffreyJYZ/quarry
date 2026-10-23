//! One resolver for every external tool the IDE spawns.
//!
//! Contract: probe `PATH` first, then `xcrun --find`. A GUI-launched app inherits launchd's `PATH`,
//! which lacks the rustup shims and the Apple toolchain, so `xcrun` is the only way to reach
//! `clangd`, `clang-format` and `lldb-dap`. A missing `xcrun`, a non-zero status or a path that
//! does not exist all mean "not found", never an error.
//!
//! Toolchains are detected, never bundled: this module never downloads or installs anything.

#![allow(unused_imports)]
pub use std::collections::HashSet;
pub use std::env;
pub use std::ffi::OsString;
pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::process::Command;

mod source;
pub use source::*;

mod child_path;
pub use child_path::*;

mod tests_1;
pub use tests_1::*;

mod tests_2;
pub use tests_2::*;

mod tests_3;
pub use tests_3::*;
