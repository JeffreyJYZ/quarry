#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

pub use crate::build_task::BuildProfile;
pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

use crate::build_task::{external, external_str};

/// The server this hand-off belongs to; rust-analyzer has a manifest and needs none of it.
pub const CLANGD: &str = "clangd";

/// clangd's own flag for the directory holding `compile_commands.json`.
pub const COMPILE_COMMANDS_DIR: &str = "--compile-commands-dir";

/// clangd's own flag for drivers it may execute to learn the system include paths.
pub const QUERY_DRIVER: &str = "--query-driver";

/// What the session hands clangd, plus the one line a start may report.
pub struct Handoff {
    /// Arguments for the server, the user's own first.
    pub args: Vec<String>,
    /// The database clangd was pointed at, which a marker edit reconfigures.
    pub database: Option<PathBuf>,
    /// Why the tree had to be configured, when it did.
    pub note: Option<String>,
}

/// Arguments for the server about to start, and the database clangd was pointed at.
///
/// rust-analyzer is handed the user's arguments untouched: it has no compile database to read, and
/// a `--compile-commands-dir` naming a directory it does not have would be a flag it never wanted.
/// clangd gets the database the build profile's own tree holds, so the analysis it runs uses the
/// flags that build compiled with.
pub fn server_args(
    server: &str,
    info: &ProjectInfo,
    user: &[String],
    profile: BuildProfile,
) -> Handoff {
    if server != CLANGD {
        return Handoff {
            args: user.to_vec(),
            database: None,
            note: None,
        };
    }
    let found = database_for(info, user, profile);
    Handoff {
        args: clangd_args(user, found.dir.as_deref()),
        database: found.dir,
        note: found.note,
    }
}

/// The user's arguments, then whatever the database adds that they did not already name.
///
/// clangd takes the last value of a repeated flag, so appending over a user's choice would silently
/// win; skipping the flag they wrote is what keeps both composed instead of one overriding.
pub fn clangd_args(user: &[String], database: Option<&Path>) -> Vec<String> {
    let mut args = user.to_vec();
    let Some(database) = database else {
        return args;
    };
    if !carries_flag(user, COMPILE_COMMANDS_DIR) {
        args.push(format!("{COMPILE_COMMANDS_DIR}={}", external(database)));
    }
    if !carries_flag(user, QUERY_DRIVER) {
        // The tree's own record of what it was configured with, then its cache, then the database
        // it wrote; none of them is emitted when it names a launcher rather than a compiler.
        let drivers = tree_drivers(database);
        if !drivers.is_empty() {
            let listed: Vec<String> = drivers.iter().map(|path| external_str(path)).collect();
            args.push(format!("{QUERY_DRIVER}={}", listed.join(",")));
        }
    }
    args
}

/// Whether `args` already names `flag`, written as `--flag=value` or as `--flag value`.
pub fn carries_flag(args: &[String], flag: &str) -> bool {
    args.iter().any(|arg| {
        arg == flag
            || arg
                .strip_prefix(flag)
                .is_some_and(|rest| rest.starts_with('='))
    })
}
