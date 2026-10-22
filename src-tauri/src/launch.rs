//! Compose a debug launch for a project without a preset.
//!
//! Unit U20 owns the body of this file. Contract: for a Cargo project, find the built executable for
//! the requested profile and load the Rust formatter entry into `initCommands` so `Vec`/`String` render
//! as values. Never build anything here; a missing binary is an error telling the user to build first.

use crate::types::LaunchConfig;

#[tauri::command]
pub async fn default_launch_config(
    _root: String,
    _stop_on_entry: bool,
) -> Result<LaunchConfig, String> {
    // STUB: U20 replaces this.
    Err("default launch configuration is not implemented yet".to_string())
}
