//! One language-server session per project root.
//!
//! Unit U6 owns the body of this file. Contract: spawn the server for the project kind with
//! `protocol_pipe`, perform the `initialize` / `initialized` handshake, synchronise documents with
//! full-document `didOpen` / `didChange` / `didClose`, and forward `textDocument/publishDiagnostics`
//! as the `lsp://diagnostics` event (payload `DiagnosticsEvent`). Unit U26 adds request/response
//! navigation: hover, go to definition, find references and completion, correlated by a request id
//! and a pending map. Never write into the source tree, never bundle a server.
//!
//! Locking rule: the session map and a single session are never held across a blocking read. The
//! handshake reads frames before any lock exists, the pump thread only locks a session for the
//! short write that answers a server request or hands a response to its waiter, and a request
//! waiter blocks on its own channel without any lock held.

#![allow(unused_imports)]
pub(crate) use crate::project::open_project;
pub(crate) use crate::protocol_pipe::{FrameError, ProcessPipe};
pub(crate) use crate::resolve;
pub(crate) use crate::types::{
    CallHierarchyNode, CodeAction, CompletionItem, CompletionList, Diagnostic, DiagnosticsEvent,
    FileEdit, HoverInfo, InlayHint, Location, LspStatus, Position, ProjectKind, Range,
    SignatureHelp, SignatureInformation, Symbol, TextEdit, WorkspaceSymbol,
};
pub use serde::Serialize;
pub use serde_json::{Value, json};
pub use std::collections::HashMap;
pub use std::path::Path;
pub use std::process::Command;
pub use std::sync::mpsc::{Receiver, RecvTimeoutError};
pub use std::sync::{Arc, Mutex, MutexGuard};
pub use std::thread;
pub use std::time::{Duration, Instant};
pub use tauri::{AppHandle, State};
pub use tokio::sync::oneshot;

mod handshake_timeout;
pub use handshake_timeout::*;

mod start_lsp;
pub use start_lsp::*;

mod impl_lspstate;
pub use impl_lspstate::*;

mod incremental_sync;
pub use incremental_sync::*;

mod lsp_close_document;
pub use lsp_close_document::*;

mod pump;
pub use pump::*;

mod pump_responses;
pub use pump_responses::*;

mod position;
pub use position::*;

mod tests_1;
pub use tests_1::*;

mod tests_2;
pub use tests_2::*;

mod tests_3;
pub use tests_3::*;

mod tests_4;
pub use tests_4::*;

mod tests_5;
pub use tests_5::*;

mod tests_6;
pub use tests_6::*;

mod format_start_failure;
pub use format_start_failure::*;

mod hover_contents;
pub use hover_contents::*;

mod parse_completion_item;
pub use parse_completion_item::*;

mod parse_workspace_symbols;
pub use parse_workspace_symbols::*;

mod lsp_rename;
pub use lsp_rename::*;

mod parse_code_actions;
pub use parse_code_actions::*;

mod lsp_signature_help;
pub use lsp_signature_help::*;

mod parse_inlay_hint;
pub use parse_inlay_hint::*;

mod call_hierarchy_node_from_item;
pub use call_hierarchy_node_from_item::*;

mod typehierarchynode;
pub use typehierarchynode::*;

mod type_hierarchy_nodes;
pub use type_hierarchy_nodes::*;

mod type_hierarchy_tests_1;
pub use type_hierarchy_tests_1::*;

mod type_hierarchy_tests_2;
pub use type_hierarchy_tests_2::*;
