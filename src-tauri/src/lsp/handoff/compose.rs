#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

/// The server this hand-off belongs to; rust-analyzer has a manifest and needs none of it.
pub const CLANGD: &str = "clangd";

/// clangd's own flag for the directory holding `compile_commands.json`.
pub const COMPILE_COMMANDS_DIR: &str = "--compile-commands-dir";

/// clangd's own flag for drivers it may execute to learn the system include paths.
pub const QUERY_DRIVER: &str = "--query-driver";

/// Arguments for the server about to start, and the database clangd was pointed at.
///
/// rust-analyzer is handed the user's arguments untouched: it has no compile database to read, and
/// a `--compile-commands-dir` naming a directory it does not have would be a flag it never wanted.
pub fn server_args(
    server: &str,
    info: &ProjectInfo,
    user: &[String],
) -> (Vec<String>, Option<PathBuf>) {
    if server != CLANGD {
        return (user.to_vec(), None);
    }
    let database = database_for(info, user);
    (clangd_args(user, database.as_deref()), database)
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
        args.push(format!("{COMPILE_COMMANDS_DIR}={}", database.display()));
    }
    if !carries_flag(user, QUERY_DRIVER) {
        // The configured tree's own compiler is the sharper answer; the database is asked when the
        // tree has no cache to name one, which is the case for a vendor tree somebody else wrote.
        let mut drivers = cache_drivers(database);
        if drivers.is_empty() {
            drivers =
                crate::project::compiler_drivers(&database.join(crate::project::DATABASE_FILE));
        }
        if !drivers.is_empty() {
            args.push(format!("{QUERY_DRIVER}={}", drivers.join(",")));
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
