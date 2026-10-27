#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};

use super::*;

/// One entry of the run-target dropdown, detected without any configuration file.
///
/// `id` is the key `resolve_run_target` parses back into a target: `cargo:<package>:<bin>` for a
/// Cargo binary, `cpp:<name>` for a C/C++ executable. The list is filled from what the project
/// already declares, so it never needs a build.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunTarget {
    pub id: String,
    /// What the dropdown shows: the binary name, with the package when the workspace has several.
    pub label: String,
    /// `cargo` or `cpp`.
    pub kind: String,
    /// Cargo package name; empty for C/C++.
    pub package: String,
    /// Binary name for Cargo, executable stem for C/C++.
    pub target: String,
}
