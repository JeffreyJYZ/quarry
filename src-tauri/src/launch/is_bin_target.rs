#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{LaunchConfig, ProjectKind};
pub use serde_json::Value;
pub use std::env;
pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::process::Command;

use super::*;

/// Names of the package's targets whose `kind` includes `bin`, in manifest order.
pub fn bin_names(package: &Value) -> Vec<&str> {
    package["targets"]
        .as_array()
        .map(|targets| {
            targets
                .iter()
                .filter(|target| is_bin_target(target))
                .filter_map(|target| target["name"].as_str())
                .collect()
        })
        .unwrap_or_default()
}
pub fn is_bin_target(target: &Value) -> bool {
    target["kind"]
        .as_array()
        .map(|kinds| kinds.iter().any(|kind| kind.as_str() == Some("bin")))
        .unwrap_or(false)
}

/// `<target_directory>/debug/<bin>`, which is where `cargo build` leaves the executable.
pub fn program_path(target_directory: &str, bin: &str) -> String {
    display(&Path::new(target_directory).join(PROFILE_DIR).join(bin))
}

pub fn missing_binary(program: &str, root: &str) -> String {
    format!(
        "{program} does not exist yet: build {root} first (cargo build) and launch again. This \
         configuration never builds for you."
    )
}

/// The LLDB providers to load, preferring the `lldb_commands` loader older toolchains ship.
pub fn init_commands(sysroot: &Path) -> Vec<String> {
    let etc = rustlib_etc(sysroot);
    select_init_commands(
        &etc,
        etc.join(LLDB_COMMANDS).is_file(),
        etc.join(LLDB_LOOKUP).is_file(),
    )
}

/// `<sysroot>/lib/rustlib/etc`, where rustup keeps the debugger provider scripts.
pub fn rustlib_etc(sysroot: &Path) -> PathBuf {
    let mut etc = sysroot.to_path_buf();
    for part in RUSTLIB_ETC {
        etc.push(part);
    }
    etc
}

/// One entry when either loader exists, in `lldb_commands`-then-`lldb_lookup.py` order, else none:
/// the launch still works without pretty printers.
pub fn select_init_commands(etc: &Path, has_commands: bool, has_lookup: bool) -> Vec<String> {
    if has_commands {
        return vec![format!(
            "command source {}",
            display(&etc.join(LLDB_COMMANDS))
        )];
    }
    if has_lookup {
        return vec![format!(
            "command script import {}",
            display(&etc.join(LLDB_LOOKUP))
        )];
    }
    Vec::new()
}

pub fn first_line(text: &str) -> String {
    text.lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or_default()
        .trim()
        .to_string()
}

pub fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}
