//! Handing the project's compile database to clangd.
//!
//! clangd searches upwards from a source file for `compile_commands.json`, so a CMake project whose
//! database lives in `build/` is analysed with no include paths and no defines — code the build
//! accepts gets squiggles. The session therefore names the directory the database is in, and names
//! the compiler to query when the database was configured with a driver clangd does not trust.
//!
//! The user's own `clangdArgs` still wins: a flag they wrote is never duplicated, and a directory
//! they named is never replaced or reconfigured behind their back.

#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

mod cache;
pub use cache::*;

mod compose;
pub use compose::*;

mod configure;
pub use configure::*;

mod database;
pub use database::*;

mod tests_handoff;
pub use tests_handoff::*;

mod tests_plan;
pub use tests_plan::*;

mod tests_cache;
pub use tests_cache::*;

mod tests_support;
pub use tests_support::*;

mod tests_real;
pub use tests_real::*;
