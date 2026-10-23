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
}

/// Runs cmake with an argv whose first element is the program name.
pub fn run_cmake(argv: &[String], build_root: &str) -> Result<CmakeOutcome, String> {
    let mut command = crate::resolve::command(CMAKE_PROGRAM)?;
    command.args(&argv[1..]).current_dir(build_root);

    let output = command
        .output()
        .map_err(|error| cmake_spawn_error(&error))?;
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    text.push('\n');
    text.push_str(&String::from_utf8_lossy(&output.stderr));

    Ok(CmakeOutcome {
        success: output.status.success(),
        text,
    })
}

/// A missing cmake is a setup problem, so the message says what has to be installed.
pub fn cmake_spawn_error(error: &std::io::Error) -> String {
    if error.kind() == std::io::ErrorKind::NotFound {
        return missing_cmake_error();
    }
    format!("cannot run {CMAKE_PROGRAM}: {error}")
}

/// The message for a machine without cmake installed.
pub fn missing_cmake_error() -> String {
    format!("{CMAKE_PROGRAM} is not on PATH: C/C++ support needs CMake installed")
}

/// Cap on source files gathered for a plain-clang build.
pub const PLAIN_CLANG_SOURCE_CAP: usize = 200;

/// Directories skipped while gathering sources.
pub const PLAIN_CLANG_IGNORED_DIRS: [&str; 5] =
    ["target", "node_modules", ".git", ".quarry", "build"];

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
