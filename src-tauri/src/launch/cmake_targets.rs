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
//!
//! A multi-config tree names one artifact per configuration, and the caller's own configuration
//! decides which: [`configured_executables`] answers for the one asked for, so a Release build is
//! launched from `build/Release/…` and not from the Debug path nothing wrote.

#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

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

/// The executables the model names for one configuration, or `None` when it names none.
pub fn cmake_candidates_in(root: &Path, configuration: &str) -> Option<Vec<(String, PathBuf)>> {
    let targets = crate::build_task::cmake_run_targets_in(&cpp_build_root(root), configuration);
    (!targets.is_empty()).then_some(targets)
}

/// The executables of the configuration a caller asked for, with the conventional walk as fallback.
///
/// A single-config generator describes one configuration, so asking for another falls back rather
/// than answering with nothing: the tree still has the executable its own build wrote.
pub fn configured_executables(info: &ProjectInfo, configuration: &str) -> Vec<(String, PathBuf)> {
    let root = Path::new(&info.root);
    if info.kind == ProjectKind::Cmake
        && let Some(targets) = cmake_candidates_in(root, configuration)
    {
        return targets;
    }
    cpp_executables(info)
}
