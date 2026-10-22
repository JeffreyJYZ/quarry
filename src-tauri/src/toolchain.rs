//! Toolchain detection.
//!
//! Unit U1 owns the body of this file. Contract: report every tool below, probing `PATH` first and
//! falling back to `xcrun --find` (a GUI-launched app inherits launchd's `PATH` and cannot see the
//! rustup shims). Never bundle or download a tool.

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
    // STUB: U1 replaces this with real probing.
    ToolchainReport {
        tools: TOOLS
            .iter()
            .map(|name| ToolInfo {
                name: (*name).to_string(),
                path: None,
                source: ToolSource::Missing,
            })
            .collect(),
    }
}
