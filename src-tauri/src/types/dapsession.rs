#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};

use super::*;

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
pub fn breakpoint_enabled_by_default() -> bool {
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

/// Payload of the `dap://output` event: what the debuggee wrote to stdout, stderr or the
/// debug console.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DapOutputEvent {
    pub session: String,
    pub category: String,
    pub output: String,
}
