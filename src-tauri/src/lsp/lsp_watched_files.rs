#![allow(unused_imports)]

pub use serde_json::{Value, json};
pub use std::path::{Path, PathBuf};
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
///
/// A change to `CMakeLists.txt` or `CMakePresets.json` is also a change to the project model: the
/// compile database still describes the old tree until CMake reconfigures, so this reconfigures and
/// then reports the regenerated database, which clangd reloads. CLion reloads its model on the same
/// edits, and without it every squiggle the edit introduced stays until the next manual build.
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
    let (server, database) = {
        let session = lock(&session);
        (session.server.clone(), session.database.clone())
    };

    let mut changes = changes;
    if let (true, Some(database)) = (server == CLANGD, database)
        && changes
            .iter()
            .any(|change| is_configure_marker(Path::new(&change.path)))
        && let Some(project) = project_root(&root)
        && reconfigure(project, database.clone()).await
    {
        changes.push(WatchedFileChange {
            path: database
                .join(crate::project::DATABASE_FILE)
                .display()
                .to_string(),
            kind: 2,
        });
    }

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

/// The project root a session id names: `{server}::{path}`.
fn project_root(session_id: &str) -> Option<PathBuf> {
    session_id
        .split_once("::")
        .map(|(_, path)| PathBuf::from(path))
}

/// Reconfigure on the blocking pool: a configure takes seconds and the async worker must stay free.
async fn reconfigure(project: PathBuf, database: PathBuf) -> bool {
    tauri::async_runtime::spawn_blocking(move || refresh(&project, &database))
        .await
        .unwrap_or(false)
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

    #[test]
    fn a_session_id_names_its_project_root() {
        assert_eq!(
            project_root("clangd::/project/demo"),
            Some(PathBuf::from("/project/demo"))
        );
        assert_eq!(project_root("no-separator"), None);
    }
}
