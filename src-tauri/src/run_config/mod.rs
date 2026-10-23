//! Launch presets from `.quarry/launch.json`.
//!
//! Reads, writes and resolves presets and never writes outside `<root>/.quarry/`: the file name is a
//! constant, so the only directory that can be created or overwritten is that one. Relative `program`
//! and `cwd` resolve against the project root, a missing file is a project without presets rather than
//! an error, and a malformed file reports the absolute path with serde's line and column. Nothing here
//! shells out and a read never creates the file.

#![allow(unused_imports)]
pub(crate) use crate::types::{LaunchConfig, LaunchFile};
pub use std::fs;
pub use std::io::ErrorKind;
pub use std::path::{Path, PathBuf};

mod launch_dir;
pub use launch_dir::*;

mod unknown_preset;
pub use unknown_preset::*;

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
