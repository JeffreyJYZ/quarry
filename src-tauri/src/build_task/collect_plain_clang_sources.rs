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

    let build_dir = plain_clang_build_dir(root_path);
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

    let success = output.status.success();

    Ok(BuildReport {
        success,
        diagnostics,
        duration_ms,
        summary: summarize_text_with(&text, DEFAULT_CLANG_SUMMARY),
        // A failed compile leaves whatever the previous build wrote at this path, so naming it
        // would report a program this build never produced; `run_cmake_build` gates the same way.
        artifact: if success {
            Some(build_dir.join(name).display().to_string())
        } else {
            None
        },
    })
}
pub fn collect_plain_clang_sources(root: &Path) -> Result<Vec<std::path::PathBuf>, String> {
    let mut sources: Vec<std::path::PathBuf> = Vec::new();
    collect_into(root, Path::new(""), 0, &mut sources)?;
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

/// Walks `dir` to a bounded depth, collecting sources as paths relative to the project root.
///
/// One level was not enough: a project that keeps its code in `src/impl/` or `sources/app/` collected
/// nothing and was told "no build system", with the files sitting right there. The depth limit and the
/// ignored directory list keep a deep tree from turning into an accidental whole-disk build.
fn collect_into(
    dir: &Path,
    relative: &Path,
    depth: usize,
    sources: &mut Vec<std::path::PathBuf>,
) -> Result<(), String> {
    let entries = std::fs::read_dir(dir)
        .map_err(|error| format!("cannot read {}: {error}", dir.display()))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("cannot read entry: {error}"))?;
        let name = entry.file_name();
        let path = entry.path();
        let child = relative.join(&name);

        if path.is_dir() {
            if depth >= PLAIN_CLANG_MAX_DEPTH {
                continue;
            }
            let name_str = name.to_string_lossy();
            if is_ignored_dir(&name_str) {
                continue;
            }
            collect_into(&path, &child, depth + 1, sources)?;
        } else if path.is_file() && crate::extensions::is_cpp_source(&path) {
            sources.push(child);
        }
    }
    Ok(())
}

/// The one directory a plain-clang build writes into, shared by the compiler invocation and the
/// artifact the report names: two spellings let the build write a file nobody launches.
pub fn plain_clang_build_dir(root: &Path) -> std::path::PathBuf {
    root.join(crate::launch::QUARRY_BUILD_DIR)
}

/// Whether the walk refuses a directory: the crate-wide list, plus this build's own output.
fn is_ignored_dir(name: &str) -> bool {
    crate::ignore::is_dir(name) || PLAIN_CLANG_EXTRA_IGNORED_DIRS.contains(&name)
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
    let output = plain_clang_build_dir(Path::new(root))
        .join(name)
        .display()
        .to_string();

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
