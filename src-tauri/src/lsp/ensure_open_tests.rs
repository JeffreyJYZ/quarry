#![allow(unused_imports)]

pub(crate) use crate::protocol_pipe::{FrameError, ProcessPipe};
pub use serde_json::{Value, json};
pub use std::sync::mpsc::Receiver;
pub use std::sync::{Arc, Mutex};
pub use std::time::Duration;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_ensure_open {
    use super::super::tests_document_sync::{file_holding, method, sent_before, session_on_cat};
    use super::*;

    /// A document-scoped request for a file the server never heard of must not reach it unseen:
    /// clangd answers `-32602` ("trying to get AST for non-added document") and rust-analyzer
    /// answers empty, and both read as a broken feature rather than a missed notification.
    #[test]
    fn a_never_opened_path_is_announced_before_the_request() {
        let text = "fn main() {}\n";
        let path = file_holding("fresh.rs", text);
        let session = session_on_cat();
        let mut guard = lock(&session);

        ensure_open(&mut guard, &path).expect("a readable file is opened");
        guard
            .begin_request("textDocument/documentSymbol", json!({}))
            .expect("the request is sent");

        let frames = guard.pipe.take_frames();
        let sent = sent_before(&mut guard, &frames);
        let methods: Vec<String> = sent.iter().map(method).collect();
        assert_eq!(
            methods,
            vec!["textDocument/didOpen", "textDocument/documentSymbol"],
            "the document is announced first"
        );

        let opened = &sent[0]["params"]["textDocument"];
        assert_eq!(opened["uri"], path_to_uri(&path));
        assert_eq!(opened["languageId"], "rust");
        assert_eq!(opened["version"], 1);
        assert_eq!(opened["text"], text);
        assert_eq!(
            guard.documents.get(&path),
            Some(&1),
            "the version is stored"
        );
    }

    /// A document the session already opened is left alone: its text is the buffer's, and
    /// re-announcing it would hand the server an older copy than the one it is analysing.
    #[test]
    fn an_already_open_path_sends_no_second_did_open() {
        let path = file_holding("open.rs", "fn main() {}\n");
        let session = session_on_cat();
        let mut guard = lock(&session);
        let frames = guard.pipe.take_frames();

        open_document(&mut guard, &path, "fn main() {}".to_string()).expect("the first open");
        let first: Vec<String> = sent_before(&mut guard, &frames)
            .iter()
            .map(method)
            .collect();
        assert_eq!(first, vec!["textDocument/didOpen"]);

        ensure_open(&mut guard, &path).expect("a known path is left alone");

        let again = sent_before(&mut guard, &frames);
        assert!(again.is_empty(), "nothing is sent again: {again:?}");
        assert_eq!(
            guard.document_texts.get(&path).map(String::as_str),
            Some("fn main() {}"),
            "the buffer's text is kept, not the file's"
        );
    }

    /// A path that cannot be read names itself, so the user sees the file rather than a server
    /// refusal about a document they believe is open.
    #[test]
    fn an_unreadable_path_names_it_and_sends_nothing() {
        let missing = "/quarry-no-such-dir/src/main.rs";
        let binary = file_holding("binary.rs", "");
        std::fs::write(&binary, [0xff, 0xfe, 0x00]).expect("writes bytes no reader can decode");
        let session = session_on_cat();
        let mut guard = lock(&session);
        let frames = guard.pipe.take_frames();

        let absent = ensure_open(&mut guard, missing).expect_err("there is no such file");
        assert!(absent.contains(missing), "{absent}");

        let invalid = ensure_open(&mut guard, &binary).expect_err("not valid UTF-8");
        assert!(invalid.contains(&binary), "{invalid}");
        assert!(invalid.contains("not valid UTF-8"), "{invalid}");

        let sent = sent_before(&mut guard, &frames);
        assert!(sent.is_empty(), "nothing was sent: {sent:?}");
        assert!(guard.documents.is_empty(), "nothing was stored");
    }

    /// A file above the payload cap is refused before a byte is sent, the same way an oversized
    /// buffer is: the server must never hold text this app will not sync again.
    #[test]
    fn a_file_over_the_cap_is_refused_without_sending() {
        let path = file_holding("huge.rs", &"a".repeat(MAX_LSP_DOCUMENT_BYTES + 1));
        let session = session_on_cat();
        let mut guard = lock(&session);
        let frames = guard.pipe.take_frames();

        let error = ensure_open(&mut guard, &path).expect_err("one byte over the cap");

        assert!(error.contains(&path), "{error}");
        assert!(error.contains("language-server limit"), "{error}");
        let sent = sent_before(&mut guard, &frames);
        assert!(sent.is_empty(), "nothing was sent: {sent:?}");
        assert!(guard.documents.is_empty(), "nothing was stored");
    }
}
