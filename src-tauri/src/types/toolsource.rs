#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};

use super::*;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ToolSource {
    /// Found on `PATH`.
    Path,
    /// Found through `xcrun --find`, which GUI-launched apps need for the Apple toolchain.
    Xcrun,
    /// Not found; the app runs but the feature that needs it is unavailable.
    Missing,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub name: String,
    pub path: Option<String>,
    pub source: ToolSource,
}

#[derive(Serialize, Clone, Debug)]
pub struct ToolchainReport {
    pub tools: Vec<ToolInfo>,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProjectKind {
    Cargo,
    Cmake,
    CompileCommands,
    Unknown,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    /// Absolute path of the opened directory.
    pub root: String,
    /// Directory name, or the Cargo package name when one is available.
    pub name: String,
    pub kind: ProjectKind,
    /// Where build commands run: the manifest directory for Cargo, otherwise the root.
    pub build_root: String,
    /// Absolute path of `.quarry/launch.json` when it exists.
    pub launch_config: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

/// Zero-based, matching both LSP and DAP positions.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    pub line: u32,
    pub character: u32,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Range {
    pub start: Position,
    pub end: Position,
}

/// Severity follows the LSP scale: 1 error, 2 warning, 3 information, 4 hint.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    /// Absolute path of the file the diagnostic belongs to.
    pub path: String,
    pub range: Range,
    pub severity: u8,
    pub message: String,
    pub source: Option<String>,
}

/// Payload of the `lsp://diagnostics` event.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsEvent {
    pub root: String,
    pub path: String,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LspStatus {
    pub root: String,
    /// `rust-analyzer` or `clangd`.
    pub server: String,
    pub version: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BuildReport {
    pub success: bool,
    pub diagnostics: Vec<Diagnostic>,
    pub duration_ms: u64,
    /// Last non-empty line of the build output, for the status bar.
    pub summary: String,
    /// Executable cargo reported for this build, so a debug launch can use the artefact it just built.
    pub artifact: Option<String>,
}

/// One match inside a file, from a project-wide text search.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub path: String,
    /// 1-based, matching what editors show.
    pub line: u32,
    /// 1-based byte column of the first match on that line.
    pub column: u32,
    /// The matching line, trimmed of its trailing newline.
    pub text: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchReport {
    pub matches: Vec<SearchMatch>,
    /// True when the result cap was hit.
    pub truncated: bool,
    pub duration_ms: u64,
}
