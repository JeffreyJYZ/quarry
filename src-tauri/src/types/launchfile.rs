#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};

use super::*;

/// One entry in `.quarry/launch.json`.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LaunchPreset {
    pub name: String,
    /// Program path, absolute or relative to the project root.
    pub program: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    /// Working directory, absolute or relative to the project root.
    pub cwd: Option<String>,
    /// Shell-free build command hint shown next to the preset, not executed here.
    pub build: Option<String>,
    #[serde(default)]
    pub stop_on_entry: bool,
    #[serde(default)]
    pub init_commands: Vec<String>,
}
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LaunchFile {
    #[serde(default)]
    pub configurations: Vec<LaunchPreset>,
}

/// One discovered test in a project.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TestItem {
    /// Fully qualified test name, e.g. `protocol_pipe::tests::roundtrip`.
    pub name: String,
    /// Test binary the name belongs to.
    pub binary: String,
}

/// Result of running a single test.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TestReport {
    pub name: String,
    pub passed: bool,
    /// Captured stdout and stderr of the run, trimmed.
    pub output: String,
    pub duration_ms: u64,
}

/// A source location returned by navigation requests.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    pub path: String,
    pub range: Range,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HoverInfo {
    /// Markdown or plain text, already flattened to a single string.
    pub contents: String,
    pub range: Option<Range>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CompletionItem {
    pub label: String,
    pub detail: Option<String>,
    /// LSP CompletionItemKind, 1–25.
    pub kind: Option<u32>,
    pub insert_text: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CompletionList {
    pub items: Vec<CompletionItem>,
    pub is_incomplete: bool,
}

/// One changed path in the working tree.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusEntry {
    pub path: String,
    /// `modified`, `added`, `deleted`, `renamed`, `untracked` or `conflicted`.
    pub status: String,
    pub staged: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: Option<String>,
    pub entries: Vec<GitStatusEntry>,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitFileDiff {
    pub path: String,
    /// Unified diff text, empty when the file is unchanged or binary.
    pub diff: String,
    pub binary: bool,
}

/// One entry in a document outline.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Symbol {
    pub name: String,
    /// LSP SymbolKind, 1–26.
    pub kind: u32,
    pub range: Range,
    /// Nesting depth, 0 for top-level symbols.
    pub depth: u32,
}

/// One result of a project-wide symbol search.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSymbol {
    pub name: String,
    /// LSP SymbolKind, 1–26.
    pub kind: u32,
    /// Enclosing type or module, as the server reports it.
    pub container: String,
    pub path: String,
    /// Zero-based start of the symbol.
    pub line: u32,
    pub character: u32,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TextEdit {
    pub range: Range,
    pub new_text: String,
}

/// All edits a rename or a code action makes, grouped by file.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileEdit {
    pub path: String,
    pub edits: Vec<TextEdit>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CodeAction {
    pub title: String,
    pub kind: Option<String>,
    pub edits: Vec<FileEdit>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SignatureInformation {
    pub label: String,
    pub documentation: Option<String>,
}
