#![allow(unused_imports)]

pub use serde_json::{Value, json};

use crate::workspace::MAX_LSP_DOCUMENT_BYTES;

use super::*;

/// Why a document of `bytes` may not be sent, naming the size and the limit, or `None` when it fits.
fn payload_too_large(path: &str, bytes: usize) -> Option<String> {
    if bytes <= MAX_LSP_DOCUMENT_BYTES {
        return None;
    }
    Some(format!(
        "cannot sync {path}: {bytes} bytes exceeds the {MAX_LSP_DOCUMENT_BYTES} byte \
         language-server limit"
    ))
}

/// Announces a document to the server, refusing one above the payload cap.
///
/// A refused document is never stored: a session entry would let a later change sync text the
/// server was never told about. Anything already open under the same path is dropped first, so the
/// server keeps no copy of a document this app will not sync.
pub fn open_document(session: &mut Session, path: &str, text: String) -> Result<u32, String> {
    if let Some(error) = payload_too_large(path, text.len()) {
        drop_document(session, path)?;
        return Err(error);
    }

    let version = 1;
    store_document(session, path, version, &text);
    let message = notification(
        "textDocument/didOpen",
        json!({
            "textDocument": {
                "uri": path_to_uri(path),
                "languageId": language_id(path),
                "version": version,
                "text": text,
            }
        }),
    );
    send(session, "textDocument/didOpen", &message)?;
    Ok(version)
}

/// Guarantees the server has heard of `path` before a request names it in `textDocument`.
///
/// A document-scoped request for a file the session never opened leaves clangd answering
/// `-32602` ("trying to get AST for non-added document") and rust-analyzer answering empty, which
/// reads as a broken feature after a server restart, a project switch, or a request that races the
/// editor's own open. A path the session already holds is left alone: its text is the buffer's, and
/// re-announcing it would hand the server an older copy than the one it is analysing.
pub fn ensure_open(session: &mut Session, path: &str) -> Result<(), String> {
    if session.documents.contains_key(path) {
        return Ok(());
    }
    let text = read_document(path)?;
    open_document(session, path, text).map(|_| ())
}

/// [`ensure_open`] for a command that holds its session behind the mutex.
pub fn ensure_open_for(session: &Arc<Mutex<Session>>, path: &str) -> Result<(), String> {
    ensure_open(&mut lock(session), path)
}

/// The file's text, read the way the workspace read does and bounded before it is loaded.
fn read_document(path: &str) -> Result<String, String> {
    let metadata =
        std::fs::metadata(path).map_err(|error| format!("cannot read {path}: {error}"))?;
    if !metadata.is_file() {
        return Err(format!("cannot read {path}: not a file"));
    }
    if let Some(error) =
        payload_too_large(path, usize::try_from(metadata.len()).unwrap_or(usize::MAX))
    {
        return Err(error);
    }
    let bytes = std::fs::read(path).map_err(|error| format!("cannot read {path}: {error}"))?;
    String::from_utf8(bytes).map_err(|_| format!("cannot read {path}: not valid UTF-8"))
}

/// Sends the buffer's new text, refusing one above the payload cap.
///
/// A document that grows past the cap leaves the server the way a closed one does, so it never
/// keeps analysing text this app refuses to send again.
pub fn change_document(session: &mut Session, path: &str, text: String) -> Result<u32, String> {
    let old_text = session
        .document_texts
        .get(path)
        .cloned()
        .unwrap_or_default();
    if old_text == text {
        // identical: no send
        let version = session.documents.get(path).copied().unwrap_or(0);
        session.documents.insert(path.to_string(), version);
        return Ok(version);
    }
    if let Some(error) = payload_too_large(path, text.len()) {
        drop_document(session, path)?;
        return Err(error);
    }

    let version = session.documents.get(path).copied().unwrap_or(0) + 1;
    store_document(session, path, version, &text);
    let message = change_message(path, version, &old_text, &text);
    send(session, "textDocument/didChange", &message)?;
    Ok(version)
}

/// Removes a document from the session and tells the server to forget it, as closing does.
///
/// Nothing is sent for a path the session never held, so a refusal on a document that was not open
/// does not ask the server about a document it never heard of.
pub fn drop_document(session: &mut Session, path: &str) -> Result<(), String> {
    let mut known = session.documents.remove(path).is_some();
    known |= session.document_ends.remove(path).is_some();
    known |= session.document_texts.remove(path).is_some();
    if !known {
        return Ok(());
    }

    let message = notification(
        "textDocument/didClose",
        json!({ "textDocument": { "uri": path_to_uri(path) } }),
    );
    send(session, "textDocument/didClose", &message)
}

/// Records what the server now believes about an open document.
fn store_document(session: &mut Session, path: &str, version: u32, text: &str) {
    session.documents.insert(path.to_string(), version);
    session
        .document_ends
        .insert(path.to_string(), document_end(text));
    session
        .document_texts
        .insert(path.to_string(), text.to_string());
}

/// One `didChange`, incremental where only a tail moved and full-document otherwise.
fn change_message(path: &str, version: u32, old_text: &str, text: &str) -> Value {
    let Some(range) = incremental_range(old_text, text) else {
        return notification(
            "textDocument/didChange",
            json!({
                "textDocument": { "uri": path_to_uri(path), "version": version },
                "contentChanges": [{ "text": text }],
            }),
        );
    };

    // replacement text is the tail of `new` from the first differing utf-16 position
    let new_text = replaced_tail(old_text, text);
    notification(
        "textDocument/didChange",
        json!({
            "textDocument": { "uri": path_to_uri(path), "version": version },
            "contentChanges": [{ "range": range, "text": new_text }],
        }),
    )
}

/// The tail of `text` from the first position where it stops matching `old_text`.
fn replaced_tail(old_text: &str, text: &str) -> String {
    let old_u: Vec<u16> = old_text.encode_utf16().collect();
    let new_u: Vec<u16> = text.encode_utf16().collect();
    let mut p = 0usize;
    while p < old_u.len() && p < new_u.len() && old_u[p] == new_u[p] {
        p += 1;
    }
    String::from_utf16_lossy(&new_u[p..])
}
