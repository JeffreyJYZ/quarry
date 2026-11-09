#![allow(unused_imports)]

pub use serde_json::{Value, json};
pub use tauri::State;

use super::*;

/// One file the watcher saw change on disk.
#[derive(serde::Deserialize)]
pub struct WatchedFileChange {
    pub path: String,
    /// LSP `FileChangeType`: 1 created, 2 changed, 3 deleted.
    pub kind: u32,
}

/// Tell a server that files changed outside the editor.
///
/// The editor's own `didChange` covers what it saved; this is the other half — a `git checkout`, an
/// external formatter, a file created in another app. Without it rust-analyzer and clangd keep
/// analysing the text they last saw until the file is reopened.
#[tauri::command]
pub async fn lsp_watched_files(
    state: State<'_, LspState>,
    root: String,
    changes: Vec<WatchedFileChange>,
) -> Result<(), String> {
    if changes.is_empty() {
        return Ok(());
    }
    let session = session_for(&state, &root)?;
    let payload: Vec<Value> = changes
        .iter()
        .map(|change| json!({ "uri": path_to_uri(&change.path), "type": change.kind }))
        .collect();
    let mut session = lock(&session);
    let message = notification(
        "workspace/didChangeWatchedFiles",
        json!({ "changes": payload }),
    );
    send(&mut session, "workspace/didChangeWatchedFiles", &message)
}

#[cfg(test)]
mod tests_watched_files {
    use super::*;

    #[test]
    fn a_change_carries_the_uri_and_the_lsp_kind() {
        let change = WatchedFileChange {
            path: "/project/src/main.rs".to_string(),
            kind: 3,
        };
        let payload = json!({
            "uri": path_to_uri(&change.path),
            "type": change.kind,
        });
        assert_eq!(payload["type"], 3);
        assert!(
            payload["uri"]
                .as_str()
                .unwrap_or_default()
                .ends_with("src/main.rs"),
            "{payload}"
        );
    }
}
