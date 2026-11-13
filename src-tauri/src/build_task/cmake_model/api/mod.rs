//! CMake's file API: the project model CMake writes for its own clients.
//!
//! A project's build description is not only argv. CMake also publishes a machine-readable model of
//! what the project defines — every target with its artifacts, per file compile groups carrying
//! includes, defines and flags, and the toolchain that compiles them. CLion reads this to build its
//! run/debug lists and its analysis model; quarry guessed targets from file names and had no model
//! at all for a generator that writes no `compile_commands.json`.
//!
//! Two pieces make it work. A *query* ([`prepare`]) is written into the build tree before a
//! configure, so CMake produces the reply even on the first run. A *reply* is read afterwards: an
//! index resolves the object files by the names it references ([`index::read`]), the codemodel
//! becomes [`Codemodel`], and [`synthesize`] turns its compile groups into the same per-file flags
//! a `compile_commands.json` would carry.
//!
//! Detail: `compile_commands.json` stays authoritative. A generator that writes one has already
//! described every translation unit with its real command line, so [`synthesize`] writes nothing in
//! that tree; the file API is the fallback for Xcode, Visual Studio and Ninja Multi-Config.
//!
//! Everything here only reads and writes files below the build root, so every case is testable
//! without CMake — and the real-configure test proves the shapes against cmake itself.

#![allow(unused_imports)]

pub use std::collections::HashMap;
pub use std::fs;
pub use std::path::{Path, PathBuf};

pub use serde_json::Value;

use super::*;

/// CMake's file API root, below the build directory.
pub const API_DIR: &str = ".cmake/api/v1";

/// The client directory CMake reads queries from; the name is what a reply attributes them to.
pub const QUERY_CLIENT: &str = "client-quarry";

/// The query file name CMake looks for in a client directory.
pub const QUERY_FILE: &str = "query.json";

/// CMake's reply directory, below [`API_DIR`].
pub const REPLY_DIR: &str = "reply";

/// Prefix of the reply's index files; the newest decides what a caller sees.
pub const INDEX_PREFIX: &str = "index-";

/// The object kind naming the project model.
pub const CODEMODEL_KIND: &str = "codemodel";

/// The object kind naming each language's compiler.
pub const TOOLCHAINS_KIND: &str = "toolchains";

/// The object kind naming the project's own CMake files.
pub const CMAKEFILES_KIND: &str = "cmakeFiles";

/// The executable and library type a target can carry, as a reader needs it.
pub const EXECUTABLE_TYPE: &str = "EXECUTABLE";

mod query;
pub use query::*;

mod index;
pub use index::*;

mod model;
pub use model::*;

mod parse;

mod compilers;
pub use compilers::*;

mod compile;
pub use compile::*;

mod database;
pub use database::*;

mod targets;
pub use targets::*;

#[cfg(test)]
mod support;
#[cfg(test)]
pub use support::*;

#[cfg(all(test, unix))]
mod fixture_project;

mod tests_reply;
pub use tests_reply::*;

mod tests_compile;
pub use tests_compile::*;

mod tests_targets;
pub use tests_targets::*;

mod tests_fixture;
pub use tests_fixture::*;
