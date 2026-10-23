//! Settings persisted to the app config directory.
//!
//! The only durable piece in P0 is the last opened project, so a relaunch lands where the user left off.
//! The file lives under the platform config directory (`app.path().app_config_dir()`), never inside a
//! project. Malformed settings are treated as empty rather than as an error: a corrupt preference must
//! never block startup.

#![allow(dead_code)]
#![allow(unused_imports)]
pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::PathBuf;
pub use tauri::{AppHandle, Manager};

mod settings_file;
pub use settings_file::*;

mod deserialize_panel_debug_width;
pub use deserialize_panel_debug_width::*;

mod preferences;
pub use preferences::*;

mod settings_core;
pub use settings_core::*;

mod remember_root_value;
pub use remember_root_value::*;

mod tests_1;
pub use tests_1::*;

mod tests_2;
pub use tests_2::*;

mod tests_3;
pub use tests_3::*;
