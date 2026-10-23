//! Scaffolding for a new project directory.
//!
//! Creates the directory and a handful of starter files for one of the supported kinds. No network
//! and no subprocess: everything is written directly.

#![allow(unused_imports)]
pub(crate) use crate::project;
pub(crate) use crate::types::ProjectInfo;
pub use std::fs;
pub use std::path::{Path, PathBuf};

mod create_project;
pub use create_project::*;

mod resolve_standard;
pub use resolve_standard::*;

mod tests_1;
pub use tests_1::*;

mod tests_2;
pub use tests_2::*;
