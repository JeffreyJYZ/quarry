#![allow(unused_imports)]

pub(crate) use crate::project::open_project;
pub(crate) use crate::protocol_pipe::{FrameError, ProcessPipe};
pub(crate) use crate::workspace::MAX_LSP_DOCUMENT_BYTES;
pub use serde_json::{Value, json};
pub use std::collections::HashMap;
pub use std::process::Command;
pub use std::sync::mpsc::Receiver;
pub use std::sync::{Arc, Mutex, MutexGuard};
pub use std::time::Duration;
pub use tauri::State;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_document_sync {
    use super::*;

    const PATH: &str = "/project/src/main.rs";
    pub(crate) const FRAME_WAIT: Duration = Duration::from_secs(5);

    #[test]
    fn a_document_at_the_cap_is_opened() {
        let session = session_on_cat();
        let text = "a".repeat(MAX_LSP_DOCUMENT_BYTES);

        let mut guard = lock(&session);
        open_document(&mut guard, PATH, text).expect("a document at the cap is sent");

        assert_eq!(guard.documents.get(PATH), Some(&1));
        assert_eq!(
            guard.document_texts.get(PATH).map(String::len),
            Some(MAX_LSP_DOCUMENT_BYTES)
        );
    }

    #[test]
    fn a_document_over_the_cap_is_refused_and_not_stored() {
        let session = session_on_cat();
        let size = MAX_LSP_DOCUMENT_BYTES + 1;

        let mut guard = lock(&session);
        let error = open_document(&mut guard, PATH, "a".repeat(size)).expect_err("one byte over");

        assert!(error.contains(&size.to_string()), "{error}");
        assert!(
            error.contains(&MAX_LSP_DOCUMENT_BYTES.to_string()),
            "{error}"
        );
        assert!(guard.documents.is_empty(), "no version stored");
        assert!(guard.document_ends.is_empty(), "no end stored");
        assert!(guard.document_texts.is_empty(), "no text stored");
    }

    /// A document that grows past the cap has to leave the server's view, not linger as the text it
    /// had before the change: the server is told to close it, exactly as for a closed file.
    #[test]
    fn a_change_over_the_cap_drops_the_document_from_the_server() {
        let session = session_on_cat();
        let mut guard = lock(&session);
        open_document(&mut guard, PATH, "fn main() {}".to_string()).expect("the first open fits");
        let frames = guard.pipe.take_frames();

        let error = change_document(&mut guard, PATH, "a".repeat(MAX_LSP_DOCUMENT_BYTES + 1))
            .expect_err("the change is over the cap");

        assert!(error.contains("language-server limit"), "{error}");
        assert!(guard.documents.is_empty(), "the version is gone");
        assert!(guard.document_texts.is_empty(), "the text is gone");
        assert!(guard.document_ends.is_empty(), "the end is gone");
        assert!(
            echoed_methods(frames).contains(&"textDocument/didClose".to_string()),
            "the server was told to drop the document"
        );
    }

    /// `cat` echoes every frame back, so the test reads what the session actually sent.
    fn echoed_methods(frames: Receiver<Result<Value, FrameError>>) -> Vec<String> {
        let mut methods = Vec::new();
        while let Ok(frame) = frames.recv_timeout(FRAME_WAIT) {
            let frame = frame.expect("a frame");
            methods.push(frame["method"].as_str().unwrap_or_default().to_string());
            if methods.len() == 2 {
                break;
            }
        }
        methods
    }

    /// A session over a real `cat`, which owns a pipe without being a language server.
    pub(crate) fn session_on_cat() -> Arc<Mutex<Session>> {
        let mut command = Command::new("cat");
        let pipe = ProcessPipe::spawn(&mut command).expect("starts cat");
        Arc::new(Mutex::new(Session {
            server: "cat".to_string(),
            database: None,
            profile: BuildProfile::default(),
            pipe,
            documents: HashMap::new(),
            document_ends: HashMap::new(),
            document_texts: HashMap::new(),
            next_request_id: FIRST_REQUEST_ID,
            pending: HashMap::new(),
            next_call_hierarchy_id: 1,
            call_hierarchy_items: HashMap::new(),
            type_hierarchy_items: HashMap::new(),
            dead: false,
            semantic_types: Vec::new(),
            semantic_modifiers: Vec::new(),
        }))
    }

    /// Every frame the session sent before a marker this helper writes itself.
    ///
    /// The marker bounds the wait, so a test that expects no frame finishes at once instead of
    /// waiting out the echo timeout, and it can never read a later test's traffic.
    pub(crate) fn sent_before(
        guard: &mut Session,
        frames: &Receiver<Result<Value, FrameError>>,
    ) -> Vec<Value> {
        let marker = notification("quarry/marker", json!({}));
        send(guard, "quarry/marker", &marker).expect("sends the marker");

        let mut sent = Vec::new();
        while let Ok(frame) = frames.recv_timeout(FRAME_WAIT) {
            let frame = frame.expect("a frame");
            if frame["method"] == "quarry/marker" {
                break;
            }
            sent.push(frame);
        }
        sent
    }

    /// A file on disk holding `text`, named so two tests in one run cannot collide.
    pub(crate) fn file_holding(name: &str, text: &str) -> String {
        let dir = std::env::temp_dir().join(format!("quarry-ensure-open-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("creates the fixture directory");
        let path = dir.join(name);
        std::fs::write(&path, text).expect("writes the fixture");
        path.to_string_lossy().into_owned()
    }

    /// The method of a frame the session sent, for an ordering assertion.
    pub(crate) fn method(frame: &Value) -> String {
        frame["method"].as_str().unwrap_or_default().to_string()
    }
}
