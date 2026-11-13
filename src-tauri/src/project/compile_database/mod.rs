//! Where a C/C++ project's compile database lives, and what it says.
//!
//! CMake writes `compile_commands.json` into its binary directory and nothing in the source tree
//! names that directory, so every consumer reads it here: clangd is handed the directory to read,
//! and the plain-clang build reuses the include paths and defines the database records. One parser,
//! so the analyser and the compiler cannot disagree about what the project's flags are.

#![allow(unused_imports)]
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

mod locate;
pub use locate::*;

mod entries;
pub use entries::*;

mod drivers;
pub use drivers::*;

mod flags;
pub use flags::*;

mod tests_database;
pub use tests_database::*;

mod tests_flags;
pub use tests_flags::*;
