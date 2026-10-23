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
            if path.is_dir() {
                if matches!(
                    name.as_str(),
                    "target" | "node_modules" | "dist" | ".git" | ".quarry"
                ) {
                    continue;
                }
                stack.push(path);
            } else if path.is_file() {
                let text = match fs::read_to_string(&path) {
                    Ok(t) => t,
                    Err(_) => continue,
                };
                let count = re.find_iter(&text).count() as u32;
                if count == 0 {
                    continue;
                }
                let new_text = re.replace_all(&text, replacement).to_string();
                match fs::write(&path, &new_text) {
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
