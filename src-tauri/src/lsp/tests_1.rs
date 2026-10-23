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

use super::*;

/// What the user does about a missing server.
pub fn fix_for(server: &str) -> &'static str {
    match server {
        "rust-analyzer" => "install it with `rustup component add rust-analyzer`",
        _ => "install the Xcode command line tools with `xcode-select --install`",
    }
}
#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_1 {
    use super::*;

    #[test]
    pub fn uri_roundtrip_keeps_spaces_hashes_percents_and_non_ascii() {
        let paths = [
            "/Users/jyz/dev/monorepos/quarry/src-tauri/src/lsp.rs",
            "/Users/jyz/dev/my project/a#b?.rs",
            "/Users/jyz/dev/50%25/naïve/日本語.rs",
            "/tmp/trailing space ",
        ];

        for path in paths {
            let uri = path_to_uri(path);
            assert!(uri.starts_with("file:///"), "uri should be absolute: {uri}");
            assert!(
                !uri.contains(' ') && !uri.contains('#') && !uri.contains('?'),
                "uri must be encoded: {uri}"
            );
            assert_eq!(uri_to_path(&uri).as_deref(), Some(path), "uri: {uri}");
        }
    }

    #[test]
    pub fn uri_decoding_rejects_foreign_schemes_and_bad_escapes() {
        assert_eq!(uri_to_path("untitled:Untitled-1"), None);
        assert_eq!(uri_to_path("file:///tmp/%ZZ.rs"), None);
        assert_eq!(
            uri_to_path("file:///tmp/plain.rs").as_deref(),
            Some("/tmp/plain.rs")
        );
    }

    #[test]
    pub fn language_id_follows_the_extension() {
        assert_eq!(language_id("/p/src/main.rs"), "rust");
        assert_eq!(language_id("/p/src/MAIN.RS"), "rust");
        for name in [
            "a.c", "a.h", "a.cc", "a.cpp", "a.hpp", "a.cxx", "a.hh", "a.CPP",
        ] {
            assert_eq!(language_id(name), "cpp", "{name}");
        }
        assert_eq!(language_id("/p/README.md"), "plaintext");
        assert_eq!(language_id("/p/Makefile"), "plaintext");
    }

    #[test]
    pub fn configuration_response_is_one_null_per_requested_item() {
        let params = json!({ "items": [{ "section": "rust" }, {}, {}] });
        assert_eq!(
            configuration_result(Some(&params)),
            json!([null, null, null])
        );
        assert_eq!(configuration_result(Some(&json!({}))), json!([]));
        assert_eq!(configuration_result(None), json!([]));

        let response = server_request_response(&json!({
            "jsonrpc": "2.0",
            "id": 7,
            "method": "workspace/configuration",
            "params": { "items": [{}, {}] },
        }));
        assert_eq!(response["id"], json!(7));
        assert_eq!(response["result"], json!([null, null]));
    }

    #[test]
    pub fn unknown_server_requests_are_answered_with_null() {
        let response = server_request_response(&json!({
            "jsonrpc": "2.0",
            "id": "abc",
            "method": "client/registerCapability",
            "params": { "registrations": [] },
        }));

        assert_eq!(response["id"], json!("abc"));
        assert_eq!(response["result"], Value::Null);
    }
}
