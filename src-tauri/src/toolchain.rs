//! Toolchain detection.
//!
//! Unit U1 owns the body of this file. Contract: report every tool below, probing `PATH` first and
//! falling back to `xcrun --find` (a GUI-launched app inherits launchd's `PATH` and cannot see the
//! rustup shims). Never bundle or download a tool.

use crate::resolve::{self, Source};
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
    let (path, source) = match resolve::resolve(name) {
        Some(found) => {
            let source = match found.source {
                Source::Path => ToolSource::Path,
                Source::Xcrun => ToolSource::Xcrun,
            };
            (Some(found.path.to_string_lossy().into_owned()), source)
        }
        None => (None, ToolSource::Missing),
    };

    ToolInfo {
        name: name.to_string(),
        path,
        source,
    }
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
        assert!(resolve::via_xcrun("quarry-tool-that-does-not-exist").is_none());
    }
}
