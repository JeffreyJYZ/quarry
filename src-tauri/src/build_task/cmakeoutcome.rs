#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
pub use serde_json::Value;
pub use std::collections::HashSet;
pub use std::path::Path;
pub use std::process::Command;
pub use std::time::Instant;

use super::*;

/// The CMake configuration name for a profile.
pub fn cmake_config(release: bool) -> &'static str {
    if release {
        CMAKE_CONFIG_RELEASE
    } else {
        CMAKE_CONFIG_DEBUG
    }
}
/// Output of one cmake invocation: the exit verdict and the merged output text.
pub struct CmakeOutcome {
    pub(crate) success: bool,
    pub(crate) text: String,
    /// A stop took the child, so the invocation says nothing about whether the build worked.
    pub(crate) stopped: bool,
}

/// Runs cmake with an argv whose first element is the program name.
pub fn run_cmake(
    state: &BuildState,
    argv: &[String],
    build_root: &str,
) -> Result<CmakeOutcome, String> {
    let mut command = crate::resolve::command(CMAKE_PROGRAM).map_err(|_| missing_cmake_error())?;
    command.args(&argv[1..]).current_dir(build_root);

    let captured = run_child(state, &mut command, CMAKE_PROGRAM, build_root)?;
    let mut text = String::from_utf8_lossy(&captured.stdout).into_owned();
    text.push('\n');
    text.push_str(&String::from_utf8_lossy(&captured.stderr));

    Ok(CmakeOutcome {
        success: captured.success,
        text,
        stopped: captured.stopped,
    })
}

/// The message for a machine without cmake installed.
pub fn missing_cmake_error() -> String {
    format!("{CMAKE_PROGRAM} is not on PATH: C/C++ support needs CMake installed")
}

/// Cap on source files gathered for a plain-clang build.
pub const PLAIN_CLANG_SOURCE_CAP: usize = 200;

/// How deep the plain-clang walk goes below the project root.
pub const PLAIN_CLANG_MAX_DEPTH: usize = 6;

/// Directories the build walker skips beyond the crate-wide list in `crate::ignore`: a plain-clang
/// project's own `build/` output. The shared list decides everything else, so the build cannot walk
/// a tree every other walker skips.
pub const PLAIN_CLANG_EXTRA_IGNORED_DIRS: [&str; 1] = ["build"];

/// Diagnostics from a plain-clang build carry this source.
pub const PLAIN_CLANG_SOURCE: &str = "clang";

/// Status-bar summary for a plain-clang build that printed nothing.
pub const DEFAULT_CLANG_SUMMARY: &str = "clang build finished";

/// The severities a C/C++ compiler prints, matched as `path:line:column: severity: message`.
pub const TEXT_SEVERITIES: [(&str, u8); 5] = [
    (": fatal error:", 1),
    (": error:", 1),
    (": warning:", 2),
    (": note:", 3),
    (": remark:", 3),
];
