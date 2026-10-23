#![allow(unused_imports)]

pub(crate) use crate::types::{LaunchConfig, LaunchFile};
pub use std::fs;
pub use std::io::ErrorKind;
pub use std::path::{Path, PathBuf};

use super::*;

/// Rejects presets a picker could not tell apart, naming the offending preset name or position.
pub fn validate(file: &LaunchFile, path: &Path) -> Result<(), String> {
    for (index, preset) in file.configurations.iter().enumerate() {
        let name = preset.name.trim();
        if name.is_empty() {
            return Err(format!(
                "launch preset at position {} in {} has an empty name.",
                index + 1,
                display(path)
            ));
        }
        if file.configurations[..index]
            .iter()
            .any(|other| other.name.trim() == name)
        {
            return Err(format!(
                "launch preset name \"{name}\" appears twice in {}.",
                display(path)
            ));
        }
    }
    Ok(())
}
pub fn unknown_preset(name: &str, file: &LaunchFile, path: &Path) -> String {
    let names: Vec<&str> = file
        .configurations
        .iter()
        .map(|preset| preset.name.as_str())
        .filter(|name| !name.trim().is_empty())
        .collect();
    if names.is_empty() {
        return format!(
            "no launch preset named \"{name}\" exists in {}, which defines no presets.",
            display(path)
        );
    }
    format!(
        "no launch preset named \"{name}\" exists in {}; available presets: {}.",
        display(path),
        names.join(", ")
    )
}

pub fn resolve_against(root: &Path, value: &str) -> PathBuf {
    let path = Path::new(value);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        root.join(path)
    }
}

pub fn config_path(root: &Path) -> PathBuf {
    root.join(LAUNCH_DIR).join(LAUNCH_FILE_NAME)
}

/// Absolute project root, canonicalised when it exists so reported paths never depend on the cwd.
pub fn absolute_root(root: &str) -> Result<PathBuf, String> {
    let trimmed = root.trim();
    if trimmed.is_empty() {
        return Err("the project root is empty.".to_string());
    }

    let path = Path::new(trimmed);
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|error| format!("cannot resolve the current directory: {error}"))?
            .join(path)
    };
    Ok(absolute.canonicalize().unwrap_or(absolute))
}

/// The root a write may create `.quarry/` under, which must already be a directory.
pub fn existing_root(root: &str) -> Result<PathBuf, String> {
    let root = absolute_root(root)?;
    if !root.is_dir() {
        return Err(format!(
            "cannot write a launch configuration because {} is not an existing directory.",
            display(&root)
        ));
    }
    Ok(root)
}

pub fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}
