#![allow(unused_imports)]

pub(crate) use crate::types::{LaunchConfig, LaunchFile};
pub use std::fs;
pub use std::io::ErrorKind;
pub use std::path::{Path, PathBuf};

use super::*;

pub const LAUNCH_DIR: &str = ".quarry";

pub const LAUNCH_FILE_NAME: &str = "launch.json";

#[tauri::command]
pub async fn read_launch_config(root: String) -> Result<LaunchFile, String> {
    read(&root)
}

#[tauri::command]
pub async fn write_launch_config(root: String, file: LaunchFile) -> Result<String, String> {
    write(&root, &file)
}

/// Turn the named preset into a runtime `LaunchConfig` with absolute paths.
#[tauri::command]
pub async fn resolve_launch_config(root: String, name: String) -> Result<LaunchConfig, String> {
    resolve(&root, &name)
}

/// Reads the presets, treating a missing file as a project with no presets.
pub fn read(root: &str) -> Result<LaunchFile, String> {
    load(root).map(|(_root, file)| file)
}

/// Serialises the presets, creating `<root>/.quarry/` when needed, and returns the file path.
pub fn write(root: &str, file: &LaunchFile) -> Result<String, String> {
    let root = existing_root(root)?;
    let path = config_path(&root);
    validate(file, &path)?;

    fs::create_dir_all(root.join(LAUNCH_DIR))
        .map_err(|error| format!("cannot create {}/{}: {error}", display(&root), LAUNCH_DIR))?;

    let mut json = serde_json::to_string_pretty(file).map_err(|error| {
        format!(
            "cannot serialise the launch configuration for {}: {error}",
            display(&path)
        )
    })?;
    json.push('\n');

    fs::write(&path, json).map_err(|error| format!("cannot write {}: {error}", display(&path)))?;
    Ok(display(&path))
}

/// Turns one preset into a runtime config, resolving relative paths against the project root.
pub fn resolve(root: &str, name: &str) -> Result<LaunchConfig, String> {
    let (root, file) = load(root)?;
    let path = config_path(&root);

    let Some(preset) = file
        .configurations
        .iter()
        .find(|preset| preset.name == name)
    else {
        return Err(unknown_preset(name, &file, &path));
    };

    let program = match preset.program.as_deref() {
        Some(program) if !program.trim().is_empty() => program.trim(),
        _ => {
            return Err(format!(
                "launch preset \"{}\" in {} has no program, so it cannot be launched as a debug target.",
                preset.name,
                display(&path)
            ));
        }
    };

    let cwd = match preset.cwd.as_deref() {
        Some(cwd) if !cwd.trim().is_empty() => resolve_against(&root, cwd.trim()),
        _ => root.clone(),
    };

    Ok(LaunchConfig {
        program: display(&resolve_against(&root, program)),
        args: preset.args.clone(),
        cwd: display(&cwd),
        stop_on_entry: preset.stop_on_entry,
        init_commands: preset.init_commands.clone(),
    })
}

/// Reads the file, returning the absolute project root alongside the presets.
pub fn load(root: &str) -> Result<(PathBuf, LaunchFile), String> {
    let root = absolute_root(root)?;
    let path = config_path(&root);

    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return Ok((root, LaunchFile::default()));
        }
        Err(error) => {
            return Err(format!(
                "cannot read launch configuration {}: {error}",
                display(&path)
            ));
        }
    };

    let file = serde_json::from_str::<LaunchFile>(&text).map_err(|error| {
        format!(
            "launch configuration {} is not valid JSON: {error}",
            display(&path)
        )
    })?;
    Ok((root, file))
}
