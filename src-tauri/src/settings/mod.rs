//! Settings persisted to the app config directory.
//!
//! The only durable piece in P0 is the last opened project, so a relaunch lands where the user left off.
//! The file lives under the platform config directory (`app.path().app_config_dir()`), never inside a
//! project. A corrupt value must never block startup, and it must never take the rest of the file with
//! it either: a file that cannot be parsed is kept as a `.bad` sibling and the read says so, while a
//! single bad field costs only that field.

#![allow(dead_code)]
#![allow(unused_imports)]
pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::PathBuf;
pub use tauri::{AppHandle, Manager};

mod settings_file;
pub use settings_file::*;

mod panel_sizes;
pub use panel_sizes::*;

mod deserialize_terminal_prefs;
pub use deserialize_terminal_prefs::*;

mod preferences;
pub use preferences::*;

mod project_settings;
pub use project_settings::*;

mod settings_read;
pub use settings_read::*;

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

mod tests_atomic_write;
pub use tests_atomic_write::*;

mod tests_read_repair;
pub use tests_read_repair::*;

mod tests_extra;
pub use tests_extra::*;
