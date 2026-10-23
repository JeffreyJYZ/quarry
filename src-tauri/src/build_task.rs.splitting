//! Build runner and compiler diagnostics.
//!
//! Cargo projects build with `cargo build --message-format=json`; the machine-readable stream
//! becomes `Diagnostic`s. CMake projects configure with `cmake -S … -B …` when their build root
//! holds no generator file, then build with `cmake --build`; their diagnostics are parsed from
//! the compiler's plain-text output. A `compile_commands.json` project has no known build system,
//! so it names the kind and points at `.quarry/launch.json` instead of guessing a command.
//!
//! A failing build is a result, not a command error: only a missing tool or a spawn failure is
//! `Err`. The build never runs the program and never writes into the source tree.

use crate::project;
use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
use serde_json::Value;
use std::collections::HashSet;
use std::path::Path;
use std::process::Command;
use std::time::Instant;

/// Program used when the environment does not name one; rustup installs it as a shim.
const DEFAULT_CARGO: &str = "cargo";
/// Environment variable cargo sets for build scripts and that rustup honours.
const CARGO_ENV: &str = "CARGO";
/// Diagnostics from a build carry a single source, so the panel can label them.
const SOURCE: &str = "cargo";
/// Status-bar summary limit; cargo's last stderr line can be a whole error block.
const SUMMARY_LIMIT: usize = 200;
const DEFAULT_SUMMARY: &str = "cargo build succeeded";

/// Program that builds CMake projects; the tool must be installed on the machine.
const CMAKE_PROGRAM: &str = "cmake";
/// Diagnostics from a CMake build carry this source, so the panel can label them.
const CMAKE_SOURCE: &str = "cmake";
/// CMake names its configurations like this.
const CMAKE_CONFIG_DEBUG: &str = "Debug";
const CMAKE_CONFIG_RELEASE: &str = "Release";
/// A generator file in the build root means the project is configured already.
const CMAKE_GENERATOR_FILES: [&str; 2] = ["build.ninja", "Makefile"];
/// Status-bar summary for a CMake build that printed nothing at all.
const DEFAULT_CPP_SUMMARY: &str = "cmake build finished";

/// `profile` is `debug` or `release`; anything else is an error naming the accepted values.
#[tauri::command]
pub async fn build_project(root: String, profile: String) -> Result<BuildReport, String> {
    let release = release_for(&profile)?;
    tauri::async_runtime::spawn_blocking(move || build(&root, release))
        .await
        .map_err(|error| format!("build task failed: {error}"))?
}

/// Detection and the build both touch the filesystem, so both run off the async runtime.
fn build(root: &str, release: bool) -> Result<BuildReport, String> {
    let info = project::inspect(root)?;
    match info.kind {
        ProjectKind::Cargo => {
            require_cargo(info.kind)?;
            run_build(&info.build_root, release)
        }
        ProjectKind::Cmake => run_cmake_build(&info.root, &info.build_root, release),
        ProjectKind::CompileCommands => run_plain_clang_build(&info.root, &info.name),
        ProjectKind::Unknown => run_plain_clang_build(&info.root, &info.name),
    }
}

/// Maps the wire profile onto cargo's `--release` flag.
fn release_for(profile: &str) -> Result<bool, String> {
    match profile {
        "debug" => Ok(false),
        "release" => Ok(true),
        other => Err(format!(
            "unsupported build profile {other:?}: expected \"debug\" or \"release\""
        )),
    }
}

/// The cargo branch accepts Cargo projects only.
///
/// The C/C++ kinds have their own branches, so reaching this gate with one of them means a
/// mis-dispatch; the gate still refuses them rather than guessing a command.
fn require_cargo(kind: ProjectKind) -> Result<(), String> {
    match kind {
        ProjectKind::Cargo => Ok(()),
        ProjectKind::Cmake => Err(cpp_not_wired("CMakeLists.txt")),
        ProjectKind::CompileCommands => Err(cpp_not_wired("compile_commands.json")),
        ProjectKind::Unknown => Err(no_build_system()),
    }
}

fn cpp_not_wired(marker: &str) -> String {
    format!(
        "C/C++ builds are not wired yet (detected {marker}) in the cargo branch: \
         the cargo branch builds Cargo projects only"
    )
}

/// A `compile_commands.json` project names no build system, so the message names the kind and
/// points at the `build` hint in the launch config.
#[allow(dead_code)] // used only by tests in this module
fn compile_commands_not_wired() -> String {
    "compile-commands project (compile_commands.json): no build system is known, so quarry \
     cannot build it. Add a `build` command to .quarry/launch.json to say how to build it"
        .to_string()
}

/// Nothing in the directory tree marks a build system.
fn no_build_system() -> String {
    "no build system detected in this project: nothing to build".to_string()
}

/// Runs the build and reports. Called on a blocking thread so the async runtime stays free.
fn run_build(build_root: &str, release: bool) -> Result<BuildReport, String> {
    let started = Instant::now();
    let program = cargo_program();

    let mut command = crate::resolve::command(&program)?;
    command
        .current_dir(build_root)
        .arg("build")
        .arg("--message-format=json");
    if release {
        command.arg("--release");
    }

    let output = command
        .output()
        .map_err(|error| format!("cannot run {program} in {build_root}: {error}"))?;
    let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let parsed = parse_cargo_json(&stdout, Path::new(build_root));

    Ok(BuildReport {
        success: parsed.success.unwrap_or_else(|| output.status.success()),
        diagnostics: parsed.diagnostics,
        duration_ms,
        summary: summarize(&stderr, &parsed.unlocated),
        artifact: parsed.artifact,
    })
}

/// `CARGO` from the environment when set, else the shim on `PATH`.
fn cargo_program() -> String {
    std::env::var(CARGO_ENV)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_CARGO.to_string())
}

/// Parsed form of cargo's JSON stream: what the report needs, and nothing else.
struct ParsedBuild {
    diagnostics: Vec<Diagnostic>,
    /// Set by `build-finished`; `None` means the stream ended early and the exit status decides.
    success: Option<bool>,
    /// Compiler messages with no file to point at, kept for the fallback summary.
    unlocated: Vec<String>,
    /// Last executable a `compiler-artifact` message reported; `None` for libraries and build scripts.
    artifact: Option<String>,
}

/// One line of the stream.
enum ParsedLine {
    Diagnostics(Vec<Diagnostic>),
    /// A compiler message without a span carrying a file name: no diagnostic, but it names a failure.
    Unlocated(String),
    /// `build-finished`: the authoritative verdict.
    Finished(bool),
    /// `compiler-artifact` carrying an executable.
    Artifact(String),
    /// Non-JSON chatter, or a reason this slice does not use.
    Ignored,
}

fn parse_cargo_json(stdout: &str, build_root: &Path) -> ParsedBuild {
    let mut parsed = ParsedBuild {
        diagnostics: Vec::new(),
        success: None,
        unlocated: Vec::new(),
        artifact: None,
    };

    for line in stdout.lines() {
        match parse_message_line(line, build_root) {
            ParsedLine::Diagnostics(diagnostics) => parsed.diagnostics.extend(diagnostics),
            ParsedLine::Unlocated(text) => parsed.unlocated.push(text),
            ParsedLine::Finished(success) => parsed.success = Some(success),
            ParsedLine::Artifact(path) => parsed.artifact = Some(path),
            ParsedLine::Ignored => {}
        }
    }

    parsed
}

/// Parses a single line, tolerating the non-JSON lines cargo interleaves with the stream.
fn parse_message_line(line: &str, build_root: &Path) -> ParsedLine {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return ParsedLine::Ignored;
    };

    match value["reason"].as_str() {
        Some("compiler-message") => {
            let message = &value["message"];
            let diagnostics = diagnostics_for(message, build_root);
            if diagnostics.is_empty() {
                let text = message["message"].as_str().unwrap_or_default();
                return ParsedLine::Unlocated(text.to_string());
            }
            ParsedLine::Diagnostics(diagnostics)
        }
        Some("build-finished") => ParsedLine::Finished(value["success"].as_bool().unwrap_or(false)),
        Some("compiler-artifact") => match value["executable"].as_str() {
            Some(path) if !path.is_empty() => ParsedLine::Artifact(path.to_string()),
            _ => ParsedLine::Ignored,
        },
        _ => ParsedLine::Ignored,
    }
}

/// The diagnostic's own message, plus any error or warning child, all at the anchor span.
fn diagnostics_for(message: &Value, build_root: &Path) -> Vec<Diagnostic> {
    let Some(anchor) = anchor_span(message, build_root) else {
        return Vec::new();
    };

    let level = message["level"].as_str().unwrap_or_default();
    let text = message["message"].as_str().unwrap_or_default();
    let mut diagnostics = vec![diagnostic_at(&anchor, severity(level), text.to_string())];

    for child in message["children"].as_array().into_iter().flatten() {
        let child_level = child["level"].as_str().unwrap_or_default();
        if !matches!(child_level, "error" | "warning") {
            continue;
        }
        let child_text = child["message"].as_str().unwrap_or_default();
        diagnostics.push(diagnostic_at(
            &anchor,
            severity(child_level),
            format!("{child_level}: {child_text}"),
        ));
    }

    diagnostics
}

/// Where a message points: an absolute path and a zero-based, end-exclusive range.
struct Anchor {
    path: String,
    range: Range,
}

/// Prefers the primary span, falls back to the first span that names a file; `None` when none does.
fn anchor_span(message: &Value, build_root: &Path) -> Option<Anchor> {
    let spans = message["spans"].as_array()?;
    let located = |span: &&Value| {
        span["file_name"]
            .as_str()
            .is_some_and(|name| !name.is_empty())
    };
    let primary = |span: &&Value| span["is_primary"].as_bool() == Some(true);

    let span = spans
        .iter()
        .find(|span| primary(span) && located(span))
        .or_else(|| spans.iter().find(located))?;
    Some(Anchor {
        path: absolute_path(span, build_root),
        range: span_range(span),
    })
}

fn diagnostic_at(anchor: &Anchor, severity: u8, message: String) -> Diagnostic {
    Diagnostic {
        path: anchor.path.clone(),
        range: anchor.range,
        severity,
        message,
        source: Some(SOURCE.to_string()),
    }
}

/// Cargo reports paths relative to the build root; the UI keys diagnostics by file name.
fn absolute_path(span: &Value, build_root: &Path) -> String {
    let file_name = span["file_name"].as_str().unwrap_or_default();
    let path = Path::new(file_name);
    let resolved = if path.is_absolute() {
        path.to_path_buf()
    } else {
        build_root.join(path)
    };
    resolved.to_string_lossy().into_owned()
}

/// Cargo lines and columns are 1-based and the end column is inclusive; LSP is zero-based and the
/// end is exclusive, so the end comes out as `column_end - 1`.
fn span_range(span: &Value) -> Range {
    let line = offset(span["line_start"].as_u64().unwrap_or(1));
    let character = offset(span["column_start"].as_u64().unwrap_or(1));
    let end_line = span["line_end"].as_u64().map_or(line, offset);
    let end_character = span["column_end"]
        .as_u64()
        .map_or(character.saturating_add(1), offset);

    Range {
        start: Position { line, character },
        end: Position {
            line: end_line,
            character: end_character,
        },
    }
}

/// 1-based wire value to a 0-based offset, tolerating a missing or zero value.
fn offset(value: u64) -> u32 {
    u32::try_from(value.saturating_sub(1)).unwrap_or(u32::MAX)
}

/// The LSP severity scale: 1 error, 2 warning, 3 information, 4 hint.
fn severity(level: &str) -> u8 {
    match level {
        "error" | "error: internal compiler error" => 1,
        "warning" => 2,
        "help" | "failure-note" => 4,
        _ => 3,
    }
}

/// Last non-empty stderr line, truncated for the status bar.
///
/// A message with no span never reaches stderr in some cargo versions, so its text is the fallback.
fn summarize(stderr: &str, unlocated: &[String]) -> String {
    let last_stderr = stderr.lines().rev().find(|line| !line.trim().is_empty());
    let text = match last_stderr {
        Some(line) => line.trim(),
        None => unlocated
            .last()
            .map(String::as_str)
            .unwrap_or(DEFAULT_SUMMARY),
    };
    truncate(text, SUMMARY_LIMIT)
}

fn truncate(text: &str, limit: usize) -> String {
    text.chars().take(limit).collect()
}

/// Builds a CMake project: configure the build root when it holds no generator file, then build.
///
/// A failing configure or build is a result, not an error: only a missing `cmake` or a failed
/// spawn is `Err`.
fn run_cmake_build(
    source_root: &str,
    build_root: &str,
    release: bool,
) -> Result<BuildReport, String> {
    let started = Instant::now();
    let mut text = String::new();
    let mut success = true;

    if !cmake_configured(Path::new(build_root)) {
        let outcome = run_cmake(&cmake_configure_argv(source_root, build_root), build_root)?;
        text.push_str(&outcome.text);
        success = outcome.success;
    }

    if success {
        let outcome = run_cmake(&cmake_build_argv(build_root, release), build_root)?;
        text.push_str(&outcome.text);
        success = outcome.success;
    }

    let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    Ok(BuildReport {
        success,
        diagnostics: parse_text_diagnostics(&text, Path::new(build_root)),
        duration_ms,
        summary: summarize_text(&text),
        artifact: None,
    })
}

/// True when the build root already holds a generator file, so configuring again is pointless.
fn cmake_configured(build_root: &Path) -> bool {
    CMAKE_GENERATOR_FILES
        .iter()
        .any(|name| build_root.join(name).is_file())
}

/// `cmake -S <source> -B <build root> -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`.
fn cmake_configure_argv(source_root: &str, build_root: &str) -> Vec<String> {
    vec![
        CMAKE_PROGRAM.to_string(),
        "-S".to_string(),
        source_root.to_string(),
        "-B".to_string(),
        build_root.to_string(),
        "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON".to_string(),
    ]
}

/// `cmake --build <build root> --config <Debug|Release>`.
fn cmake_build_argv(build_root: &str, release: bool) -> Vec<String> {
    vec![
        CMAKE_PROGRAM.to_string(),
        "--build".to_string(),
        build_root.to_string(),
        "--config".to_string(),
        cmake_config(release).to_string(),
    ]
}

/// The CMake configuration name for a profile.
fn cmake_config(release: bool) -> &'static str {
    if release {
        CMAKE_CONFIG_RELEASE
    } else {
        CMAKE_CONFIG_DEBUG
    }
}

/// Output of one cmake invocation: the exit verdict and the merged output text.
struct CmakeOutcome {
    success: bool,
    text: String,
}

/// Runs cmake with an argv whose first element is the program name.
fn run_cmake(argv: &[String], build_root: &str) -> Result<CmakeOutcome, String> {
    let mut command = crate::resolve::command(CMAKE_PROGRAM)?;
    command.args(&argv[1..]).current_dir(build_root);

    let output = command
        .output()
        .map_err(|error| cmake_spawn_error(&error))?;
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    text.push('\n');
    text.push_str(&String::from_utf8_lossy(&output.stderr));

    Ok(CmakeOutcome {
        success: output.status.success(),
        text,
    })
}

/// A missing cmake is a setup problem, so the message says what has to be installed.
fn cmake_spawn_error(error: &std::io::Error) -> String {
    if error.kind() == std::io::ErrorKind::NotFound {
        return missing_cmake_error();
    }
    format!("cannot run {CMAKE_PROGRAM}: {error}")
}

/// The message for a machine without cmake installed.
fn missing_cmake_error() -> String {
    format!("{CMAKE_PROGRAM} is not on PATH: C/C++ support needs CMake installed")
}

/// Cap on source files gathered for a plain-clang build.
const PLAIN_CLANG_SOURCE_CAP: usize = 200;
/// Directories skipped while gathering sources.
const PLAIN_CLANG_IGNORED_DIRS: [&str; 5] = ["target", "node_modules", ".git", ".quarry", "build"];
/// Diagnostics from a plain-clang build carry this source.
const PLAIN_CLANG_SOURCE: &str = "clang";
/// Status-bar summary for a plain-clang build that printed nothing.
const DEFAULT_CLANG_SUMMARY: &str = "clang build finished";

/// The severities a C/C++ compiler prints, matched as `path:line:column: severity: message`.
const TEXT_SEVERITIES: [(&str, u8); 5] = [
    (": fatal error:", 1),
    (": error:", 1),
    (": warning:", 2),
    (": note:", 3),
    (": remark:", 3),
];

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

fn summarize_text_with(text: &str, default: &str) -> String {
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
fn parse_text_diagnostics(text: &str, build_root: &Path) -> Vec<Diagnostic> {
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

/// One compiler line: `path:line:column: severity: message`.
fn parse_text_diagnostic(line: &str, build_root: &Path) -> Option<Diagnostic> {
    let (head, message, severity) = split_severity(line)?;
    let message = message.trim();
    if message.is_empty() {
        return None;
    }

    let (path, line_number, column) = split_position(head)?;
    let start = Position {
        line: offset(u64::from(line_number)),
        character: offset(u64::from(column)),
    };

    Some(Diagnostic {
        path: absolute_text_path(&path, build_root),
        range: Range {
            start,
            end: Position {
                line: start.line,
                character: start.character.saturating_add(1),
            },
        },
        severity,
        message: message.to_string(),
        source: Some(CMAKE_SOURCE.to_string()),
    })
}

/// Splits a line into its position head and the `severity: message` tail.
///
/// The earliest severity marker wins, so a message that mentions `error:` further right does not
/// move the split. A line without a marker carries no severity and is skipped: that covers
/// clang's `In file included from` headers and its bare `path:line:` continuation lines.
fn split_severity(line: &str) -> Option<(&str, &str, u8)> {
    let mut found: Option<(usize, u8)> = None;
    for (marker, severity) in TEXT_SEVERITIES {
        if let Some(index) = line.find(marker)
            && found.is_none_or(|(at, _)| index < at)
        {
            found = Some((index, severity));
        }
    }

    let (index, severity) = found?;
    let head = &line[..index];
    let tail = line[index + 1..].trim_start();
    let (_, message) = tail.split_once(':')?;
    Some((head, message, severity))
}

/// Splits `path:line:column` into its parts; the column is optional and defaults to 1.
fn split_position(head: &str) -> Option<(String, u32, u32)> {
    let head = head.trim();
    let (rest, last) = head.rsplit_once(':')?;
    let last_number = last.trim().parse::<u32>().ok();

    let (path, line, column) = match (last_number, rest.rsplit_once(':')) {
        (Some(column), Some((path, line))) => (path, line, column),
        (Some(_), None) => (rest, last, 1),
        (None, Some((path, line))) => (path, line, 1),
        (None, None) => return None,
    };

    let line = line.trim().parse::<u32>().ok()?;
    let path = path.trim();
    if path.is_empty() || path.chars().all(|character| character.is_ascii_digit()) {
        return None;
    }
    Some((path.to_string(), line, column))
}

/// The compiler prints paths relative to the build root; the UI keys diagnostics by absolute path.
fn absolute_text_path(path: &str, build_root: &Path) -> String {
    let candidate = Path::new(path);
    let resolved = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        build_root.join(candidate)
    };
    resolved.to_string_lossy().into_owned()
}

/// Last non-empty line of the build output, truncated for the status bar.
fn summarize_text(text: &str) -> String {
    let last = text
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .map(|line| line.trim());
    truncate(last.unwrap_or(DEFAULT_CPP_SUMMARY), SUMMARY_LIMIT)
}

#[cfg(test)]
mod tests {
    use super::*;

    const BUILD_ROOT: &str = "/projects/demo";

    fn build_root() -> &'static Path {
        Path::new(BUILD_ROOT)
    }

    fn only_diagnostic(line: &str) -> Diagnostic {
        match parse_message_line(line, build_root()) {
            ParsedLine::Diagnostics(mut diagnostics) => {
                assert_eq!(diagnostics.len(), 1, "expected exactly one diagnostic");
                diagnostics.remove(0)
            }
            _ => panic!("expected a diagnostic line"),
        }
    }

    /// Warning with a primary span at line 7, column 5: zero-based line 6, character 4.
    #[test]
    fn warning_with_primary_span_converts_to_zero_based() {
        let line = r#"{"reason":"compiler-message","message":{"level":"warning","message":"unused variable: `x`","spans":[{"file_name":"src/main.rs","line_start":7,"line_end":7,"column_start":5,"column_end":10,"is_primary":true}],"children":[]}}"#;

        let diagnostic = only_diagnostic(line);

        assert_eq!(diagnostic.path, format!("{BUILD_ROOT}/src/main.rs"));
        assert_eq!(
            diagnostic.range,
            Range {
                start: Position {
                    line: 6,
                    character: 4
                },
                end: Position {
                    line: 6,
                    character: 9
                },
            }
        );
        assert_eq!(diagnostic.severity, 2);
        assert_eq!(diagnostic.message, "unused variable: `x`");
        assert_eq!(diagnostic.source.as_deref(), Some("cargo"));
    }

    #[test]
    fn error_falls_back_to_the_first_span_when_none_is_primary() {
        let line = r#"{"reason":"compiler-message","message":{"level":"error","message":"mismatched types","spans":[{"file_name":"src/lib.rs","line_start":3,"line_end":4,"column_start":1,"column_end":2,"is_primary":false}],"children":[]}}"#;

        let diagnostic = only_diagnostic(line);

        assert_eq!(diagnostic.severity, 1);
        assert_eq!(diagnostic.path, format!("{BUILD_ROOT}/src/lib.rs"));
        assert_eq!(
            diagnostic.range,
            Range {
                start: Position {
                    line: 2,
                    character: 0
                },
                end: Position {
                    line: 3,
                    character: 1
                },
            }
        );
    }

    #[test]
    fn message_without_spans_yields_no_diagnostic() {
        let line = r#"{"reason":"compiler-message","message":{"level":"error","message":"could not compile `demo`","spans":[]}}"#;

        match parse_message_line(line, build_root()) {
            ParsedLine::Unlocated(text) => assert_eq!(text, "could not compile `demo`"),
            _ => panic!("expected the message to be unlocated"),
        }
        assert!(parse_cargo_json(line, build_root()).diagnostics.is_empty());
    }

    #[test]
    fn span_without_a_file_name_is_not_a_diagnostic() {
        let line = r#"{"reason":"compiler-message","message":{"level":"warning","message":"something","spans":[{"line_start":1,"line_end":1,"column_start":1,"column_end":2,"is_primary":true}]}}"#;

        assert!(parse_cargo_json(line, build_root()).diagnostics.is_empty());
    }

    #[test]
    fn absolute_span_paths_are_kept_and_relative_ones_joined() {
        let absolute = r#"{"reason":"compiler-message","message":{"level":"note","message":"note","spans":[{"file_name":"/elsewhere/mod.rs","line_start":1,"line_end":1,"column_start":2,"column_end":3,"is_primary":true}]}}"#;
        assert_eq!(only_diagnostic(absolute).path, "/elsewhere/mod.rs");

        let nested = r#"{"reason":"compiler-message","message":{"level":"note","message":"note","spans":[{"file_name":"crates/core/src/main.rs","line_start":1,"line_end":1,"column_start":2,"column_end":3,"is_primary":true}]}}"#;
        assert_eq!(
            only_diagnostic(nested).path,
            format!("{BUILD_ROOT}/crates/core/src/main.rs")
        );
    }

    #[test]
    fn build_finished_carries_the_verdict() {
        let finished = r#"{"reason":"build-finished","success":false}"#;

        assert!(matches!(
            parse_message_line(finished, build_root()),
            ParsedLine::Finished(false)
        ));
        assert_eq!(
            parse_cargo_json(finished, build_root()).success,
            Some(false)
        );
    }

    #[test]
    fn an_executable_artifact_is_reported() {
        let line = r#"{"reason":"compiler-artifact","target":{"name":"demo","kind":["bin"]},"executable":"/projects/demo/target/release/demo"}"#;

        assert!(matches!(
            parse_message_line(line, build_root()),
            ParsedLine::Artifact(_)
        ));

        let stream = format!(
            "{line}\n{}",
            r#"{"reason":"build-finished","success":true}"#
        );
        assert_eq!(
            parse_cargo_json(&stream, build_root()).artifact.as_deref(),
            Some("/projects/demo/target/release/demo")
        );
    }

    #[test]
    fn an_artifact_without_executable_is_skipped() {
        let line = r#"{"reason":"compiler-artifact","target":{"name":"demo"},"executable":null,"filenames":[]}"#;

        assert!(matches!(
            parse_message_line(line, build_root()),
            ParsedLine::Ignored
        ));
        assert_eq!(parse_cargo_json(line, build_root()).artifact, None);
    }

    #[test]
    fn non_json_lines_are_skipped_without_panicking() {
        let line = "    Compiling demo v0.1.0 (/projects/demo)";
        assert!(matches!(
            parse_message_line(line, build_root()),
            ParsedLine::Ignored
        ));

        let mixed = concat!(
            "    Compiling demo v0.1.0 (/projects/demo)\n",
            r#"{"reason":"compiler-artifact","target":{"name":"demo"},"filenames":[]}"#,
            "\n",
            r#"{"reason":"build-finished","success":true}"#,
            "\n",
        );
        let parsed = parse_cargo_json(mixed, build_root());
        assert!(parsed.diagnostics.is_empty());
        assert_eq!(parsed.success, Some(true));
    }

    #[test]
    fn error_and_warning_children_become_extra_diagnostics_at_the_primary_span() {
        let line = r#"{"reason":"compiler-message","message":{"level":"error","message":"mismatched types","spans":[{"file_name":"src/main.rs","line_start":5,"line_end":5,"column_start":2,"column_end":4,"is_primary":true}],"children":[{"level":"error","message":"expected `u32`, found `&str`","spans":[]},{"level":"warning","message":"consider borrowing","spans":[]},{"level":"note","message":"ignored note","spans":[]}]}}"#;

        let ParsedLine::Diagnostics(diagnostics) = parse_message_line(line, build_root()) else {
            panic!("expected diagnostics");
        };

        assert_eq!(diagnostics.len(), 3);
        assert_eq!(diagnostics[0].severity, 1);
        assert_eq!(
            diagnostics[1].message,
            "error: expected `u32`, found `&str`"
        );
        assert_eq!(diagnostics[1].severity, 1);
        assert_eq!(diagnostics[2].message, "warning: consider borrowing");
        assert_eq!(diagnostics[2].severity, 2);
        for diagnostic in &diagnostics {
            assert_eq!(diagnostic.range, diagnostics[0].range);
            assert_eq!(diagnostic.path, diagnostics[0].path);
        }
    }

    #[test]
    fn level_mapping_follows_the_lsp_scale() {
        assert_eq!(severity("error"), 1);
        assert_eq!(severity("error: internal compiler error"), 1);
        assert_eq!(severity("warning"), 2);
        assert_eq!(severity("note"), 3);
        assert_eq!(severity("help"), 4);
        assert_eq!(severity("failure-note"), 4);
    }

    #[test]
    fn summary_is_the_last_non_empty_stderr_line_truncated() {
        let stderr = "warning: unused\n\n    Finished `dev` profile [unoptimized]\n\n";
        assert_eq!(
            summarize(stderr, &[]),
            "Finished `dev` profile [unoptimized]"
        );

        assert_eq!(summarize("  \n\n", &[]), DEFAULT_SUMMARY);
        assert_eq!(
            summarize("", &["could not compile `demo`".to_string()]),
            "could not compile `demo`"
        );

        let long = "e".repeat(SUMMARY_LIMIT + 50);
        assert_eq!(summarize(&long, &[]).chars().count(), SUMMARY_LIMIT);
    }

    #[test]
    fn profile_accepts_only_debug_and_release() {
        assert_eq!(release_for("debug"), Ok(false));
        assert_eq!(release_for("release"), Ok(true));

        let error = release_for("bench").expect_err("bench is not a profile");
        assert!(error.contains("\"debug\""), "unexpected error: {error}");
        assert!(error.contains("\"release\""), "unexpected error: {error}");
    }

    #[test]
    fn only_cargo_is_wired() {
        assert!(require_cargo(ProjectKind::Cargo).is_ok());

        for kind in [ProjectKind::Cmake, ProjectKind::CompileCommands] {
            let error = require_cargo(kind).expect_err("C/C++ is not wired");
            assert!(
                error.contains("C/C++ builds are not wired yet"),
                "unexpected error: {error}"
            );
        }
        assert!(require_cargo(ProjectKind::Unknown).is_err());
    }

    /// A compiler error line becomes one diagnostic with a zero-based, one-character range.
    #[test]
    fn text_error_line_becomes_a_diagnostic() {
        let text = "src/main.cpp:12:5: error: expected ';'";

        let diagnostics = parse_text_diagnostics(text, build_root());

        assert_eq!(diagnostics.len(), 1);
        let diagnostic = &diagnostics[0];
        assert_eq!(diagnostic.path, format!("{BUILD_ROOT}/src/main.cpp"));
        assert_eq!(
            diagnostic.range,
            Range {
                start: Position {
                    line: 11,
                    character: 4
                },
                end: Position {
                    line: 11,
                    character: 5
                },
            }
        );
        assert_eq!(diagnostic.severity, 1);
        assert_eq!(diagnostic.message, "expected ';'");
        assert_eq!(diagnostic.source.as_deref(), Some("cmake"));
    }

    #[test]
    fn text_warning_line_becomes_a_warning_diagnostic() {
        let text = "src/main.cpp:3:9: warning: unused variable 'x'";

        let diagnostics = parse_text_diagnostics(text, build_root());

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].severity, 2);
        assert_eq!(diagnostics[0].message, "unused variable 'x'");
        assert_eq!(diagnostics[0].range.start.line, 2);
        assert_eq!(diagnostics[0].range.start.character, 8);
    }

    #[test]
    fn text_note_and_remark_lines_become_information_diagnostics() {
        let text = concat!(
            "src/main.cpp:7:3: note: declared here\n",
            "src/main.cpp:8:3: remark: see the manual\n",
        );

        let diagnostics = parse_text_diagnostics(text, build_root());

        assert_eq!(diagnostics.len(), 2);
        assert_eq!(diagnostics[0].severity, 3);
        assert_eq!(diagnostics[0].message, "declared here");
        assert_eq!(diagnostics[1].severity, 3);
        assert_eq!(diagnostics[1].message, "see the manual");
    }

    /// Include headers and continuation lines carry no severity, so they are not diagnostics.
    #[test]
    fn include_and_continuation_lines_are_ignored() {
        let text = concat!(
            "In file included from src/main.cpp:1:\n",
            "                 from include/thing.h:3:\n",
            "include/thing.h:5:1: warning: unused include\n",
        );

        let diagnostics = parse_text_diagnostics(text, build_root());

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].path, format!("{BUILD_ROOT}/include/thing.h"));
        assert_eq!(diagnostics[0].severity, 2);
    }

    #[test]
    fn relative_text_paths_are_joined_to_the_build_root() {
        let text = "src/deep/nested/file.cpp:1:1: error: boom";

        let diagnostics = parse_text_diagnostics(text, build_root());

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(
            diagnostics[0].path,
            format!("{BUILD_ROOT}/src/deep/nested/file.cpp")
        );
    }

    #[test]
    fn absolute_text_paths_are_kept() {
        let text = "/elsewhere/file.cpp:1:1: error: boom";

        let diagnostics = parse_text_diagnostics(text, build_root());

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].path, "/elsewhere/file.cpp");
    }

    #[test]
    fn identical_text_diagnostics_are_deduplicated() {
        let text = concat!(
            "src/main.cpp:12:5: error: expected ';'\n",
            "src/main.cpp:12:5: error: expected ';'\n",
            "src/main.cpp:13:5: error: expected ';'\n",
        );

        let diagnostics = parse_text_diagnostics(text, build_root());

        assert_eq!(diagnostics.len(), 2);
        assert_eq!(diagnostics[0].range.start.line, 11);
        assert_eq!(diagnostics[1].range.start.line, 12);
    }

    #[test]
    fn malformed_text_lines_are_skipped() {
        let text = concat!(
            "this is not a diagnostic\n",
            "src/main.cpp:12:5: error: real error\n",
            "no colon at all\n",
        );

        let diagnostics = parse_text_diagnostics(text, build_root());

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].message, "real error");
    }

    #[test]
    fn cmake_argv_carries_the_profile_and_the_configure_step() {
        let configure = cmake_configure_argv("/projects/demo", "/projects/demo/build");
        assert_eq!(
            configure.iter().map(String::as_str).collect::<Vec<_>>(),
            vec![
                "cmake",
                "-S",
                "/projects/demo",
                "-B",
                "/projects/demo/build",
                "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
            ]
        );

        let debug = cmake_build_argv("/projects/demo/build", false);
        assert_eq!(
            debug.iter().map(String::as_str).collect::<Vec<_>>(),
            vec![
                "cmake",
                "--build",
                "/projects/demo/build",
                "--config",
                "Debug"
            ]
        );

        let release = cmake_build_argv("/projects/demo/build", true);
        assert_eq!(
            release.iter().map(String::as_str).collect::<Vec<_>>(),
            vec![
                "cmake",
                "--build",
                "/projects/demo/build",
                "--config",
                "Release"
            ]
        );
    }

    #[test]
    fn missing_cmake_names_the_tool_and_says_it_must_be_installed() {
        let error = missing_cmake_error();

        assert!(error.contains("cmake"), "unexpected error: {error}");
        assert!(
            error.contains("CMake installed"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn compile_commands_projects_point_at_the_launch_config() {
        let error = compile_commands_not_wired();

        assert!(
            error.contains("compile_commands.json"),
            "unexpected error: {error}"
        );
        assert!(
            error.contains(".quarry/launch.json"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn text_summary_is_the_last_non_empty_line_truncated() {
        assert_eq!(
            summarize_text("compiling\n[100%] built target demo\n\n"),
            "[100%] built target demo"
        );
        assert_eq!(summarize_text("  \n\n"), DEFAULT_CPP_SUMMARY);

        let long = "e".repeat(SUMMARY_LIMIT + 50);
        assert_eq!(summarize_text(&long).chars().count(), SUMMARY_LIMIT);
    }
}
