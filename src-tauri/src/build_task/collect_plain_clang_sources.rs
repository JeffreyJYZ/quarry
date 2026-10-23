#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
pub use serde_json::Value;
pub use std::collections::HashSet;
pub use std::path::Path;
pub use std::process::Command;
pub use std::time::Instant;

use super::*;

/// Builds a C/C++ project with clang directly, for projects without a build system.
pub fn run_plain_clang_build(root: &str, name: &str) -> Result<BuildReport, String> {
    let root_path = Path::new(root);
    let sources = collect_plain_clang_sources(root_path)?;
    if sources.is_empty() {
        return Err(no_build_system());
    }

    let compiler = if sources
        .iter()
        .all(|path| path.extension().map(|e| e == "c").unwrap_or(false))
    {
        "clang"
    } else {
        "clang++"
    };

    let resolved = crate::resolve::resolve(compiler).ok_or_else(|| {
        format!("{compiler} is not on PATH: C/C++ support needs {compiler} installed")
    })?;

    let build_dir = root_path.join(".quarry").join("build");
    std::fs::create_dir_all(&build_dir)
        .map_err(|error| format!("cannot create {}: {error}", build_dir.display()))?;

    let argv = plain_clang_argv(root, name, &sources);

    let started = Instant::now();
    let mut command = Command::new(&resolved.path);
    command.args(&argv[1..]).current_dir(root);
    let output = command
        .output()
        .map_err(|error| format!("cannot run {compiler} in {root}: {error}"))?;
    let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);

    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    text.push('\n');
    text.push_str(&String::from_utf8_lossy(&output.stderr));

    let mut diagnostics = parse_text_diagnostics(&text, root_path);
    for diagnostic in &mut diagnostics {
        diagnostic.source = Some(PLAIN_CLANG_SOURCE.to_string());
    }

    Ok(BuildReport {
        success: output.status.success(),
        diagnostics,
        duration_ms,
        summary: summarize_text_with(&text, DEFAULT_CLANG_SUMMARY),
        artifact: Some(build_dir.join(name).display().to_string()),
    })
}
pub fn collect_plain_clang_sources(root: &Path) -> Result<Vec<std::path::PathBuf>, String> {
    let mut sources: Vec<std::path::PathBuf> = Vec::new();
    let entries = std::fs::read_dir(root)
        .map_err(|error| format!("cannot read {}: {error}", root.display()))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("cannot read entry: {error}"))?;
        let path = entry.path();
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        if path.is_dir() {
            if PLAIN_CLANG_IGNORED_DIRS.contains(&name_str.as_ref()) {
                continue;
            }
            if let Ok(child_entries) = std::fs::read_dir(&path) {
                for child in child_entries {
                    let child = child.map_err(|error| format!("cannot read entry: {error}"))?;
                    let child_path = child.path();
                    if child_path.is_file() && is_plain_clang_source(&child_path) {
                        sources.push(
                            std::path::PathBuf::from(name_str.as_ref()).join(child.file_name()),
                        );
                    }
                }
            }
        } else if path.is_file() && is_plain_clang_source(&path) {
            sources.push(std::path::PathBuf::from(name_str.as_ref()));
        }
    }

    sources.sort();
    if sources.len() > PLAIN_CLANG_SOURCE_CAP {
        return Err(format!(
            "too many source files (cap {}): {} found",
            PLAIN_CLANG_SOURCE_CAP,
            sources.len()
        ));
    }
    Ok(sources)
}

pub fn is_plain_clang_source(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()),
        Some("c") | Some("cc") | Some("cpp")
    )
}

pub fn plain_clang_argv<P: AsRef<Path>>(root: &str, name: &str, sources: &[P]) -> Vec<String> {
    let c_only = sources.iter().all(|source| {
        source
            .as_ref()
            .extension()
            .map(|ext| ext == "c")
            .unwrap_or(false)
    });
    let compiler = if c_only { "clang" } else { "clang++" };
    let std_flag = if c_only { "-std=c17" } else { "-std=c++20" };
    let output = format!("{}/.quarry/build/{}", root.trim_end_matches('/'), name);

    let mut argv = vec![
        compiler.to_string(),
        std_flag.to_string(),
        "-g".to_string(),
        "-O0".to_string(),
        "-fno-color-diagnostics".to_string(),
        "-o".to_string(),
        output,
    ];
    for source in sources {
        argv.push(source.as_ref().to_string_lossy().into_owned());
    }
    argv
}

pub fn summarize_text_with(text: &str, default: &str) -> String {
    let last = text
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .map(|line| line.trim());
    truncate(last.unwrap_or(default), SUMMARY_LIMIT)
}

/// Parses every compiler diagnostic in the text, dropping duplicates and keeping the order.
///
/// CMake builds speak plain text, not JSON, so this is the only source of diagnostics there.
pub fn parse_text_diagnostics(text: &str, build_root: &Path) -> Vec<Diagnostic> {
    let mut seen: HashSet<(String, u32, u32, String)> = HashSet::new();
    let mut diagnostics = Vec::new();

    for line in text.lines() {
        let Some(diagnostic) = parse_text_diagnostic(line, build_root) else {
            continue;
        };
        let key = (
            diagnostic.path.clone(),
            diagnostic.range.start.line,
            diagnostic.range.start.character,
            diagnostic.message.clone(),
        );
        if seen.insert(key) {
            diagnostics.push(diagnostic);
        }
    }

    diagnostics
}
