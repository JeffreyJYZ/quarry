//! Auto-detected run targets: what the toolbar dropdown lists and resolves.
//!
//! Detection never builds. Cargo targets come from one `cargo metadata --no-deps` run, C/C++
//! targets come from the conventional build outputs [`compose_cpp`] already probes, and a directory
//! with no source of any kind has none. A C/C++ directory with no build system is one of those:
//! quarry compiles it itself, so the program that build writes is a target like any other.
//! Resolution takes one of those ids back to a [`LaunchConfig`], so a fresh project is runnable with
//! no configuration file.

#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{LaunchConfig, ProjectInfo, ProjectKind, RunTarget};
pub use serde_json::Value;
pub use std::path::{Path, PathBuf};
pub use std::process::Command;

mod cargo;
pub use cargo::*;

mod commands;
pub use commands::*;

mod cpp;
pub use cpp::*;

mod id;
pub use id::*;

use super::*;

/// Every runnable target an opened directory has, by project kind.
///
/// Cargo answers from its manifests, so an unbuilt project still lists; C/C++ answers from the
/// executables a build already left behind, and the path its next build will write otherwise.
pub fn list_targets(root: &str) -> Result<Vec<RunTarget>, String> {
    let info = project::inspect(root)?;
    match info.kind {
        ProjectKind::Cargo => list_cargo_targets(&info),
        ProjectKind::Cmake | ProjectKind::CompileCommands => Ok(list_cpp_targets(&info)),
        ProjectKind::Unknown if plain_cpp(&info) => Ok(list_cpp_targets(&info)),
        ProjectKind::Unknown => Ok(Vec::new()),
    }
}

/// The launch configuration for the target an id names.
///
/// The id's kind must match the project's: a list only ever produces its own project's ids, so a
/// mismatched one is a stale dropdown rather than a target to guess at.
pub fn resolve_target(root: &str, id: &str, stop_on_entry: bool) -> Result<LaunchConfig, String> {
    resolve_target_in(root, id, stop_on_entry, None)
}

/// The launch configuration for one target, for the configuration a caller names.
///
/// `configuration` is the CMake configuration the build will use; `None` reads the project's own
/// saved profile. A CMake project lists one artifact per configuration, so this is what keeps Run
/// pointing at the file the configuration's build writes.
pub fn resolve_target_in(
    root: &str,
    id: &str,
    stop_on_entry: bool,
    configuration: Option<&str>,
) -> Result<LaunchConfig, String> {
    let info = project::inspect(root)?;
    let configuration = configuration
        .map(str::to_string)
        .unwrap_or_else(|| resolve_cpp_configuration(&info));
    match (info.kind, parse_target_id(id)?) {
        (ProjectKind::Cargo, TargetId::Cargo { package, target }) => {
            resolve_cargo(&info, &package, &target, stop_on_entry)
        }
        (ProjectKind::Cmake | ProjectKind::CompileCommands, TargetId::Cpp { target }) => {
            resolve_cpp_in(&info, &target, stop_on_entry, &configuration)
        }
        (ProjectKind::Unknown, TargetId::Cpp { target }) if plain_cpp(&info) => {
            resolve_cpp_in(&info, &target, stop_on_entry, &configuration)
        }
        (kind, _) => Err(format!(
            "run target \"{id}\" does not belong to a {kind:?} project ({}): list the targets again",
            info.root
        )),
    }
}

/// The configuration a project's own settings name, which is what its builds use.
fn resolve_cpp_configuration(info: &ProjectInfo) -> String {
    crate::launch::saved_configuration(Path::new(&info.root))
}

/// Whether this directory is a C/C++ project quarry compiles itself.
///
/// The plain build treats any directory holding a source as one; a directory with none compiles
/// nothing, so it lists no target and resolves none.
fn plain_cpp(info: &ProjectInfo) -> bool {
    crate::build_task::collect_plain_clang_sources(Path::new(&info.root))
        .is_ok_and(|sources| !sources.is_empty())
}
