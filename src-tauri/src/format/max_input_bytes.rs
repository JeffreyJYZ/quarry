#![allow(unused_imports)]

pub use std::env;
pub use std::fs;
pub use std::io::Write;
pub use std::path::Path;
pub use std::process::{Command, Stdio};
pub use std::thread;

use super::*;

/// Largest document the editors will hand over; a whole-file format of more than this is a mistake.
pub const MAX_INPUT_BYTES: usize = 4 * 1024 * 1024;

pub const RUSTFMT: &str = "rustfmt";

pub const CLANG_FORMAT: &str = "clang-format";

pub const TAPLO: &str = "taplo";

/// A formatter's stderr line can be a whole diagnostic block, so it is cut for the status bar.
pub const STDERR_LIMIT: usize = 300;

/// Extensions clang-format owns. Rust has exactly one; everything else is left alone.
pub const C_FAMILY: [&str; 7] = ["c", "h", "cc", "cpp", "cxx", "hh", "hpp"];

/// Which formatter a document maps to, and the empty case that means "no formatter".
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Formatter {
    Rustfmt,
    ClangFormat,
    Taplo,
    None,
}

/// Returns the formatted text. Never writes to disk.
#[tauri::command]
pub async fn format_document(root: String, path: String, text: String) -> Result<String, String> {
    let formatter = formatter_for_path(&path);
    // No formatter owns this file, so there is nothing to resize against: hand the text back as it came.
    if formatter == Formatter::None {
        return Ok(text);
    }
    require_size(text.len())?;

    tauri::async_runtime::spawn_blocking(move || run(formatter, &root, &path, &text))
        .await
        .map_err(|error| format!("format task failed: {error}"))?
}

/// Reports which formatter would be used, without running it. `""` means none would be.
#[tauri::command]
pub async fn formatter_for(path: String) -> Result<String, String> {
    Ok(match formatter_for_path(&path) {
        Formatter::Rustfmt => RUSTFMT.to_string(),
        Formatter::ClangFormat => CLANG_FORMAT.to_string(),
        Formatter::Taplo => TAPLO.to_string(),
        Formatter::None => String::new(),
    })
}

/// Extension decides, case-insensitively; a file with no extension or an unknown one has no formatter.
pub fn formatter_for_path(path: &str) -> Formatter {
    let extension = Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase);

    match extension.as_deref() {
        Some("rs") => Formatter::Rustfmt,
        Some(extension) if C_FAMILY.contains(&extension) => Formatter::ClangFormat,
        Some("toml") => Formatter::Taplo,
        _ => Formatter::None,
    }
}

/// Oversized input is rejected by name rather than silently returning stale text.
pub fn require_size(len: usize) -> Result<(), String> {
    if len > MAX_INPUT_BYTES {
        return Err(format!(
            "document is {len} bytes: formatting is limited to {MAX_INPUT_BYTES} bytes (4 MiB)"
        ));
    }
    Ok(())
}

/// Resolve the Rust edition for the project containing `path`.
pub fn rust_edition_for_path(path: &str) -> &'static str {
    let start = std::path::Path::new(path);
    let mut dir = if start.is_dir() {
        start
    } else {
        start.parent().unwrap_or(start)
    };
    loop {
        let manifest = dir.join("Cargo.toml");
        if manifest.is_file()
            && let Ok(content) = std::fs::read_to_string(&manifest)
        {
            return parse_rust_edition(&content);
        }
        match dir.parent() {
            Some(parent) if parent != dir => dir = parent,
            _ => break,
        }
    }
    "2021"
}

pub fn parse_rust_edition(content: &str) -> &'static str {
    let mut section = "";
    let mut package_edition: Option<&str> = None;
    let mut workspace_edition: Option<&str> = None;
    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            section = line.trim_start_matches('[').trim_end_matches(']');
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            if key.trim() != "edition" {
                continue;
            }
            let parsed = parse_edition_value(value.trim());
            if let Some(ed) = parsed {
                match section {
                    "package" => {
                        if package_edition.is_none() {
                            package_edition = Some(ed);
                        }
                    }
                    "workspace.package" if workspace_edition.is_none() => {
                        workspace_edition = Some(ed);
                    }
                    _ => {}
                }
            }
        }
    }
    let chosen = package_edition.or(workspace_edition);
    match chosen {
        Some("2015") => "2015",
        Some("2018") => "2018",
        Some("2021") => "2021",
        Some("2024") => "2024",
        _ => "2021",
    }
}
