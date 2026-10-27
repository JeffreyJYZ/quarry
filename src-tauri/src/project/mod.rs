//! Project model.
//!
//! Given a directory, walk up for `Cargo.toml`, `CMakeLists.txt` or `compile_commands.json`, decide
//! the kind, derive the build root and the name, and report whether `.quarry/launch.json` exists.
//! Never spawns a build.

#![allow(unused_imports)]
pub(crate) use crate::types::{ProjectInfo, ProjectKind};
pub use std::fs;
pub use std::path::{Path, PathBuf};

mod cargo_manifest;
pub use cargo_manifest::*;

mod descend;
pub use descend::*;

mod unquote;
pub use unquote::*;

mod tests_items;
pub use tests_items::*;

mod tests_descend;
pub use tests_descend::*;
