//! Run targets from the CMake project model.
//!
//! A CMake project defines its executables; a file name does not. `cpp_executables` used to build
//! candidates from `<name>` and the newest executable, which offered the wrong binary whenever a
//! project defined several targets, or a target whose name differed from the project's. The file API
//! reply already lists every target with the artifact its link step writes, so that model is asked
//! first and the file-name walk stays as the fallback for a tree CMake never described.
//!
//! Targets are read from the tree the build configures, not from `<root>/build` by convention, so a
//! preset-driven project is described by the reply its own build wrote.

#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

use super::*;

/// The executables the project's own build model names, or `None` when there is no such model.
///
/// `None` covers a never-configured tree, a CMake older than the file API, and a project that
/// refuses the query; each of those falls through to the conventional name search, which is what
/// Run did before CMake described its targets at all.
pub fn cmake_candidates(root: &Path) -> Option<Vec<(String, PathBuf)>> {
    let targets = crate::build_task::cmake_run_targets(&cpp_build_root(root));
    (!targets.is_empty()).then_some(targets)
}
