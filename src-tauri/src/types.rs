//! Wire shapes shared by the Tauri commands and the frontend.
//!
//! Frozen for P0: `src/project/api.ts` mirrors every type here. Add fields only by decision of the
//! controller, never from inside a unit.

use serde::{Deserialize, Serialize};

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

/// Launch parameters for one debug session.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LaunchConfig {
    /// Absolute path of the executable to debug.
    pub program: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub stop_on_entry: bool,
    /// Verbatim lldb-dap `initCommands`; the Rust formatters need one entry.
    pub init_commands: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DapSession {
    pub id: String,
    pub program: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DapThread {
    pub id: u32,
    pub name: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DapFrame {
    pub id: u32,
    pub name: String,
    pub source: Option<String>,
    pub line: u32,
    pub column: u32,
    pub instruction_pointer: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DapScope {
    pub name: String,
    pub variables_reference: u32,
    pub expensive: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DapVariable {
    pub name: String,
    pub value: String,
    pub type_name: Option<String>,
    pub variables_reference: u32,
    pub memory_reference: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DapBreakpoint {
    pub id: Option<u32>,
    pub verified: bool,
    pub line: Option<u32>,
    pub message: Option<String>,
    pub source: Option<String>,
}

/// One source breakpoint the UI asks for, with the DAP extras.
///
/// A disabled breakpoint is not sent to the adapter at all, so the adapter stops holding it.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BreakpointSpec {
    /// 1-based line, matching the gutter and the DAP `SourceBreakpoint`.
    pub line: u32,
    /// Expression the adapter evaluates before it stops.
    #[serde(default)]
    pub condition: Option<String>,
    /// Hit count expression, e.g. `> 3`.
    #[serde(default)]
    pub hit_condition: Option<String>,
    /// Log point message; a breakpoint with a log message never suspends.
    #[serde(default)]
    pub log_message: Option<String>,
    /// Enabled unless the UI says otherwise.
    #[serde(default = "breakpoint_enabled_by_default")]
    pub enabled: bool,
}

/// A breakpoint the UI did not disable is enabled.
fn breakpoint_enabled_by_default() -> bool {
    true
}

impl Default for BreakpointSpec {
    fn default() -> Self {
        BreakpointSpec {
            line: 0,
            condition: None,
            hit_condition: None,
            log_message: None,
            enabled: breakpoint_enabled_by_default(),
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MemoryDump {
    pub address: String,
    pub bytes: Vec<u8>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DisassembledInstruction {
    pub address: String,
    pub instruction: String,
    pub symbol: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DataBreakpointInfo {
    pub data_id: Option<String>,
    pub description: String,
    pub access_types: Vec<String>,
}

/// Payload of the `dap://stopped` event.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DapStoppedEvent {
    pub session: String,
    pub reason: String,
    pub description: Option<String>,
    pub thread_id: Option<u32>,
    pub line: Option<u32>,
    pub source: Option<String>,
}

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
