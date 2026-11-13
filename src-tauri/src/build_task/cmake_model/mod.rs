//! What a CMake project says about its own build.
//!
//! A project already knows how it wants to be configured: `CMakePresets.json` names its generator,
//! its binary directory, its toolchain and its build type, and a tree somebody has already
//! configured keeps that truth in `CMakeCache.txt`. Quarry used to ignore all of it and run one
//! hardcoded recipe, so a preset-driven or hand-configured project built somewhere else, with
//! another compiler, into a directory no artifact could be found in.
//!
//! Three questions are answered here before anything is spawned: which directory the build runs in
//! ([`resolve`]), which preset applies and what it carries ([`select_configure`],
//! [`resolve_configure`]), and what argv that produces ([`cmake_plan`]). [`CmakeOptions`] is the
//! user's override from `.quarry/settings.json`; every field is empty by default, so a project
//! nobody has touched still builds exactly as it did.
//!
//! Only the runner spawns; everything else reads the filesystem, which is what makes every case
//! testable without a compiler.

#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

mod options;
pub use options::*;

mod build_root;
pub use build_root::*;

mod preset;
pub use preset::*;

mod preset_parse;

mod preset_select;
pub use preset_select::*;

mod preset_resolve;
pub use preset_resolve::*;

mod argv;
pub use argv::*;

mod plan;
pub use plan::*;

mod api;
pub use api::*;

mod tests_root;
pub use tests_root::*;

mod tests_preset;
pub use tests_preset::*;

mod tests_preset_select;
pub use tests_preset_select::*;

mod tests_argv;
pub use tests_argv::*;

mod tests_argv_preset;
pub use tests_argv_preset::*;

mod tests_argv_select;
pub use tests_argv_select::*;

mod tests_fixture;
pub use tests_fixture::*;
