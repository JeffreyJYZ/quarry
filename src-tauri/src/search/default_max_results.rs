#![allow(unused_imports)]

pub(crate) use crate::ignore;
pub(crate) use crate::types::{SearchMatch, SearchReport};
pub use regex::RegexBuilder;
pub use serde_json::Value;
pub use std::env;
pub use std::fs;
pub use std::io::{BufRead, BufReader, Read};
pub use std::path::{Path, PathBuf};
pub use std::process::{Child, Command, ExitStatus, Stdio};
pub use std::thread::{self, JoinHandle};
pub use std::time::Instant;

use super::*;

/// Default cap on returned matches.
pub const DEFAULT_MAX_RESULTS: u32 = 300;

pub const PROGRAM: &str = "rg";

pub const MISSING_PROGRAM: &str = "ripgrep (rg) is not installed: run `brew install ripgrep`";

#[derive(serde::Serialize)]
pub struct ReplaceReport {
    pub files_changed: u32,
    pub replacements: u32,
    pub errors: Vec<String>,
}

#[tauri::command]
pub async fn replace_project(
    root: String,
    query: String,
    replacement: String,
    case_sensitive: Option<bool>,
    fixed_strings: Option<bool>,
) -> Result<ReplaceReport, String> {
    let query = require_query(&query)?;
    if !Path::new(&root).is_dir() {
        return Err(format!("search root is not a directory: {root}"));
    }
    let case_sensitive = case_sensitive.unwrap_or(false);
    let fixed_strings = fixed_strings.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        replace(&root, &query, &replacement, case_sensitive, fixed_strings)
    })
    .await
    .map_err(|error| format!("replace task failed: {error}"))?
}

pub fn replace(
    root: &str,
    query: &str,
    replacement: &str,
    case_sensitive: bool,
    fixed_strings: bool,
) -> Result<ReplaceReport, String> {
    let root = absolute_root(root);
    let pattern = if fixed_strings {
        regex::escape(query)
    } else {
        query.to_string()
    };
    let re = RegexBuilder::new(&pattern)
        .case_insensitive(!case_sensitive)
        .build()
        .map_err(|e| format!("invalid regular expression: {e}"))?;

    let mut files_changed = 0u32;
    let mut replacements = 0u32;
    let mut errors = Vec::new();
    let mut stack = vec![root.clone()];
    while let Some(dir) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(e) => {
                errors.push(format!("{}: {e}", dir.display()));
                continue;
            }
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let Ok(file_type) = entry.file_type() else {
                errors.push(format!("{}: cannot stat the entry", path.display()));
                continue;
            };
            // ripgrep does not follow symlinks, so a replace must not either: a symlinked directory
            // walks outside the project, and a symlinked file writes through to a target the search
            // never listed.
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                // The same list search uses: a replace that walks `.cache`, `CMakeFiles` or a
                // `cmake-build-*` directory edits files the search it came from never showed.
                if ignore::is_dir(&name) {
                    continue;
                }
                stack.push(path);
            } else if file_type.is_file() {
                if ignore::is_file(&name) {
                    continue;
                }
                // The same containment the workspace commands enforce: a path that resolves
                // outside every open project is refused instead of read and rewritten.
                if let Err(error) = crate::workspace::contained(&path) {
                    errors.push(error);
                    continue;
                }
                let text = match fs::read_to_string(&path) {
                    Ok(t) => t,
                    Err(_) => continue,
                };
                let (new_text, count) = replace_text(&re, replacement, &text, fixed_strings);
                if count == 0 {
                    continue;
                }
                // A sibling temp and a rename keep the source file whole when a write fails.
                match crate::atomic_write::replace(&path, new_text.as_bytes()) {
                    Ok(()) => {
                        files_changed += 1;
                        replacements += count;
                    }
                    Err(e) => errors.push(format!("{}: {e}", path.display())),
                }
            }
        }
    }
    Ok(ReplaceReport {
        files_changed,
        replacements,
        errors,
    })
}

#[tauri::command]
pub async fn cancel_search() -> Result<(), String> {
    cancel_active_search();
    Ok(())
}

#[tauri::command]
pub async fn search_project(
    root: String,
    query: String,
    max_results: Option<u32>,
    case_sensitive: Option<bool>,
    fixed_strings: Option<bool>,
) -> Result<SearchReport, String> {
    let query = require_query(&query)?;
    if !Path::new(&root).is_dir() {
        return Err(format!("search root is not a directory: {root}"));
    }

    let max_results = max_results.unwrap_or(DEFAULT_MAX_RESULTS);
    let case_sensitive = case_sensitive.unwrap_or(false);
    let fixed_strings = fixed_strings.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        search(&root, &query, max_results, case_sensitive, fixed_strings)
    })
    .await
    .map_err(|error| format!("search task failed: {error}"))?
}
