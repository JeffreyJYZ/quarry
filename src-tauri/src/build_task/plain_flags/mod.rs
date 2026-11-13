//! The flags a plain C/C++ project builds with, and the database analysis reads them from.
//!
//! A project with no build system is compiled by quarry itself, and until now that compile passed
//! no include path, no define and no standard of its own: a header reachable from the project root,
//! a `-D` the code depends on or a `-std` above the compiler's default resolved in analysis only by
//! accident, while clangd was handed nothing at all. This module is the one place that answers what
//! those flags are, so the compiler and the analyser cannot describe the project differently:
//!
//!   the flags     the project root, its `include/` directory, the `-std` for the language, and the
//!                 extra flags `.quarry/settings.json` holds under `cppFlags`.
//!   the database  a `compile_commands.json` synthesised from those flags, written into the tree the
//!                 plain build already writes (`.quarry/build`), which is the directory the clangd
//!                 session is pointed at — the same shape the CMake lanes use.
//!
//! Three project descriptions outrank any derivation here and are never overridden: a real
//! `compile_commands.json` (a generator's own answer, so nothing is written and the build compiles
//! with its flags exactly as before), `compile_flags.txt` and `.clangd` (the user's own instruction
//! to clangd, which reads them itself, so a database of ours would silently replace it). Those keep
//! a project byte-identical to what it did before this module existed.
//!
//! A project holding both C and C++ is compiled per language: each source by the driver and standard
//! of its own extension, then one link. The database records exactly those commands, so a `.c`
//! entry is a C one and clangd cannot analyse the file as C++ by way of its entry.

#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub use serde::Serialize;

use super::*;

mod derive;
pub use derive::*;

mod instruction;
pub use instruction::*;

mod database;
pub use database::*;

mod commands;
pub use commands::*;

mod plan;
pub use plan::*;
