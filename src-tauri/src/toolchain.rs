//! Toolchain detection.
//!
//! Unit U1 owns the body of this file. Contract: report every tool below, probing `PATH` first and
//! falling back to `xcrun --find` (a GUI-launched app inherits launchd's `PATH` and cannot see the
//! rustup shims). Never bundle or download a tool.

use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;

use crate::types::{ToolInfo, ToolSource, ToolchainReport};

/// Tools the IDE looks for, in status-bar order.
pub const TOOLS: [&str; 8] = [
    "rust-analyzer",
    "clangd",
    "lldb-dap",
    "rustfmt",
    "clang-format",
    "cargo",
    "cmake",
    "ninja",
];

#[tauri::command]
pub fn toolchains() -> ToolchainReport {
    ToolchainReport {
        tools: TOOLS.iter().map(|name| probe(name)).collect(),
    }
}

/// `PATH` first, then `xcrun`: a GUI-launched app inherits launchd's `PATH`, so Apple-shipped tools
/// like `lldb-dap` and `clang-format` are only reachable through `xcrun`.
fn probe(name: &str) -> ToolInfo {
    let (path, source) = match find_on_path(name) {
        Some(found) => (Some(found), ToolSource::Path),
        None => match find_with_xcrun(name) {
            Some(found) => (Some(found), ToolSource::Xcrun),
            None => (None, ToolSource::Missing),
        },
    };

    ToolInfo {
        name: name.to_string(),
        path,
        source,
    }
}

/// Walk `PATH` by hand rather than shelling out, so a directory is never interpreted or expanded.
fn find_on_path(name: &str) -> Option<String> {
    let path = env::var_os("PATH")?;

    env::split_paths(&path).find_map(|dir| {
        if dir.as_os_str().is_empty() {
            return None;
        }

        let candidate = dir.join(name);
        is_executable(&candidate).then(|| candidate.to_string_lossy().into_owned())
    })
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    // `metadata` follows symlinks, so a link to a regular file counts as a hit.
    fs::metadata(path)
        .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    fs::metadata(path)
        .map(|meta| meta.is_file())
        .unwrap_or(false)
}

/// Ask `xcrun` for the tool's path. A missing `xcrun`, a non-zero status or a path that does not
/// exist all fall back to "not found" instead of failing the whole report.
fn find_with_xcrun(name: &str) -> Option<String> {
    let output = Command::new("xcrun").args(["--find", name]).output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let found = stdout.lines().next()?.trim();
    if found.is_empty() || !Path::new(found).exists() {
        return None;
    }

    Some(found.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn report_covers_every_tool_in_order() {
        let report = toolchains();
        let names: Vec<&str> = report.tools.iter().map(|tool| tool.name.as_str()).collect();
        assert_eq!(names, TOOLS.to_vec());
    }

    #[test]
    fn unknown_tool_is_missing() {
        let tool = probe("quarry-tool-that-does-not-exist");
        assert_eq!(tool.source, ToolSource::Missing);
        assert!(tool.path.is_none());
    }

    #[test]
    fn xcrun_reports_nothing_for_an_unknown_tool() {
        assert!(find_with_xcrun("quarry-tool-that-does-not-exist").is_none());
    }
}
