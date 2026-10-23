#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::PathBuf;
pub use tauri::{AppHandle, Manager};

use super::*;

pub fn remember_root_value(settings: &mut Settings, root: String) -> Result<Vec<String>, String> {
    let path = std::path::Path::new(&root);
    if !path.is_absolute() {
        return Err(format!("root must be an absolute path: {root}"));
    }
    if !path.exists() {
        return Err(format!("directory does not exist: {root}"));
    }
    let mut list = settings.recent_roots.clone();
    list.retain(|entry| entry != &root);
    list.insert(0, root);
    if list.len() > 10 {
        list.truncate(10);
    }
    settings.recent_roots = list.clone();
    Ok(list)
}

#[tauri::command]
pub fn remember_root(app: AppHandle, root: String) -> Result<Vec<String>, String> {
    let mut settings = read_settings(app.clone());
    let list = remember_root_value(&mut settings, root)?;
    write_settings(app, settings)?;
    Ok(list)
}
