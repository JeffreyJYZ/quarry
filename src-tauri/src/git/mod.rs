//! Git status and per-file diffs through the `git` binary.
//!
//! Unit owns the body of this file. Contract: never link libgit2, never run a mutating command, and
//! parse porcelain output rather than locale-dependent human output.
//!
//! Every read-only command runs off the async runtime on a blocking thread. A directory that is
//! not a repository is not an error: the status comes back empty so the UI can hide the panel.

#![allow(unused_imports)]
pub(crate) use crate::resolve;
pub(crate) use crate::types::{GitFileDiff, GitStatus, GitStatusEntry};
pub use serde::Serialize;
pub use std::fs;
pub use std::path::Path;
pub use std::process::Command;

mod git_program;
pub use git_program::*;

mod file_diff;
pub use file_diff::*;

mod parse_entry;
pub use parse_entry::*;

mod relative_path;
pub use relative_path::*;

mod build_hunk_patch;
pub use build_hunk_patch::*;

mod tests_1;
pub use tests_1::*;

mod tests_2;
pub use tests_2::*;

mod tests_3;
pub use tests_3::*;

mod git_stage;
pub use git_stage::*;

mod commit;
pub use commit::*;

mod validate_branch_name;
pub use validate_branch_name::*;

mod is_binary_diff;
pub use is_binary_diff::*;

mod parse_git_blame;
pub use parse_git_blame::*;

mod discard_restore_argv;
pub use discard_restore_argv::*;
