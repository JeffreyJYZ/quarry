#![allow(unused_imports)]

pub(crate) use crate::types::{ProjectInfo, ProjectKind};
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// Reads `name` from the `[package]` table of a Cargo manifest with a line scan.
///
/// Only the exact `[package]` section counts, so `[dependencies]`, `[package.metadata]` and
/// commented-out keys never supply the name.
pub fn cargo_package_name(manifest: &Path) -> Option<String> {
    let text = fs::read_to_string(manifest).ok()?;
    let mut section = String::new();

    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if line.starts_with('[') {
            section = match line.split_once(']') {
                Some((header, _)) => header.trim_start_matches('[').trim().to_string(),
                None => line.trim_start_matches('[').trim().to_string(),
            };
            continue;
        }

        if section != "package" {
            continue;
        }

        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if key.trim() != "name" {
            continue;
        }

        let name = unquote(value);
        if !name.is_empty() {
            return Some(name);
        }
    }

    None
}
/// Strips surrounding quotes and any trailing comment from a manifest value.
pub fn unquote(value: &str) -> String {
    let value = value.trim();
    for quote in ['"', '\''] {
        if let Some(rest) = value.strip_prefix(quote) {
            return rest
                .split(quote)
                .next()
                .unwrap_or_default()
                .trim()
                .to_string();
        }
    }
    value
        .split('#')
        .next()
        .unwrap_or_default()
        .trim()
        .to_string()
}

pub fn directory_name(root: &Path) -> String {
    root.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| display(root))
}

pub fn launch_config_path(root: &Path) -> Option<String> {
    let candidate = root.join(LAUNCH_CONFIG);
    candidate.is_file().then(|| display(&candidate))
}

pub fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}
