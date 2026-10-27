#![allow(unused_imports)]

pub(crate) use crate::types::{LaunchConfig, RunTarget};

use super::*;

/// The auto-detected targets of an opened directory, for the toolbar dropdown.
///
/// Detection reads manifests and existing executables only, so a project that was never built
/// still lists its targets. An unknown directory is an empty list rather than an error: the
/// dropdown has to render for any folder the user opens.
#[tauri::command]
pub async fn list_run_targets(root: String) -> Result<Vec<RunTarget>, String> {
    tauri::async_runtime::spawn_blocking(move || list_targets(&root))
        .await
        .map_err(|error| format!("run target listing failed: {error}"))?
}

/// The launch configuration for one detected target, resolved after the build step ran.
///
/// An id this project does not declare is an error naming it, never a silent fallback to another
/// target, so the toolbar can never debug the wrong binary.
#[tauri::command]
pub async fn resolve_run_target(
    root: String,
    id: String,
    stop_on_entry: bool,
) -> Result<LaunchConfig, String> {
    tauri::async_runtime::spawn_blocking(move || resolve_target(&root, &id, stop_on_entry))
        .await
        .map_err(|error| format!("run target resolution failed: {error}"))?
}
