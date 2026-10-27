//! Auto-detected run targets: what the toolbar dropdown lists and resolves.
//!
//! Detection never builds. Cargo targets come from one `cargo metadata --no-deps` run, C/C++
//! targets come from the conventional build outputs [`compose_cpp`] already probes, and an unknown
//! directory has none. Resolution takes one of those ids back to a [`LaunchConfig`], so a fresh
//! project is runnable with no configuration file.

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
        ProjectKind::Unknown => Ok(Vec::new()),
    }
}

/// The launch configuration for the target an id names.
///
/// The id's kind must match the project's: a list only ever produces its own project's ids, so a
/// mismatched one is a stale dropdown rather than a target to guess at.
pub fn resolve_target(root: &str, id: &str, stop_on_entry: bool) -> Result<LaunchConfig, String> {
    let info = project::inspect(root)?;
    match (info.kind, parse_target_id(id)?) {
        (ProjectKind::Cargo, TargetId::Cargo { package, target }) => {
            resolve_cargo(&info, &package, &target, stop_on_entry)
        }
        (ProjectKind::Cmake | ProjectKind::CompileCommands, TargetId::Cpp { target }) => {
            resolve_cpp(&info, &target, stop_on_entry)
        }
        (kind, _) => Err(format!(
            "run target \"{id}\" does not belong to a {kind:?} project ({}): list the targets again",
            info.root
        )),
    }
}
