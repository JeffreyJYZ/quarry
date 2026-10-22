//! Formatting through the project's own formatters.
//!
//! `rustfmt` for Rust, `clang-format` for C/C++. The source arrives as text and is fed on stdin, so a
//! document never has to be written to disk to be formatted; `path` only selects the formatter and
//! supplies `-assume-filename`. The binary is resolved `PATH` first and then through `xcrun`, matching
//! the toolchain probe: `clang-format` ships inside Xcode and nothing is bundled.
//!
//! A formatter failure is a command error carrying the formatter's own first stderr line; the file on
//! disk is untouched either way.

use std::env;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;

/// Largest document the editors will hand over; a whole-file format of more than this is a mistake.
pub const MAX_INPUT_BYTES: usize = 4 * 1024 * 1024;

const RUSTFMT: &str = "rustfmt";
const CLANG_FORMAT: &str = "clang-format";
/// A formatter's stderr line can be a whole diagnostic block, so it is cut for the status bar.
pub const STDERR_LIMIT: usize = 300;

/// Extensions clang-format owns. Rust has exactly one; everything else is left alone.
const C_FAMILY: [&str; 7] = ["c", "h", "cc", "cpp", "cxx", "hh", "hpp"];

/// Which formatter a document maps to, and the empty case that means "no formatter".
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Formatter {
    Rustfmt,
    ClangFormat,
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
        Formatter::None => String::new(),
    })
}

/// Extension decides, case-insensitively; a file with no extension or an unknown one has no formatter.
fn formatter_for_path(path: &str) -> Formatter {
    let extension = Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase);

    match extension.as_deref() {
        Some("rs") => Formatter::Rustfmt,
        Some(extension) if C_FAMILY.contains(&extension) => Formatter::ClangFormat,
        _ => Formatter::None,
    }
}

/// Oversized input is rejected by name rather than silently returning stale text.
fn require_size(len: usize) -> Result<(), String> {
    if len > MAX_INPUT_BYTES {
        return Err(format!(
            "document is {len} bytes: formatting is limited to {MAX_INPUT_BYTES} bytes (4 MiB)"
        ));
    }
    Ok(())
}

/// Resolve the Rust edition for the project containing `path`.
fn rust_edition_for_path(path: &str) -> &'static str {
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

fn parse_rust_edition(content: &str) -> &'static str {
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

fn parse_edition_value(raw: &str) -> Option<&str> {
    let raw = raw.trim();
    if let Some(rest) = raw.strip_prefix('"') {
        let end = rest.find('"')?;
        Some(&rest[..end])
    } else if let Some(rest) = raw.strip_prefix('\'') {
        let end = rest.find('\'')?;
        Some(&rest[..end])
    } else {
        let end = raw
            .find(|c: char| c.is_whitespace() || c == '#')
            .unwrap_or(raw.len());
        Some(&raw[..end])
    }
}

/// The exact argument list for a formatter. No shell is involved: each argument is passed separately.
fn argv(formatter: Formatter, path: &str) -> Vec<String> {
    match formatter {
        Formatter::Rustfmt => {
            let edition = rust_edition_for_path(path);
            vec![
                "--edition".to_string(),
                edition.to_string(),
                "--emit".to_string(),
                "stdout".to_string(),
            ]
        }
        Formatter::ClangFormat => vec![format!("-assume-filename={path}")],
        Formatter::None => Vec::new(),
    }
}

/// Runs the formatter over stdin and returns stdout. Called on a blocking thread.
fn run(formatter: Formatter, root: &str, path: &str, text: &str) -> Result<String, String> {
    let program = program_for(formatter);
    let binary = resolve(program).ok_or_else(|| missing(program))?;

    let mut command = Command::new(&binary);
    command
        .args(argv(formatter, path))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // rustfmt reads its configuration from the crate it is standing in; a formatter outside a project
    // root would use the defaults instead of the project's `rustfmt.toml`.
    if formatter == Formatter::Rustfmt && Path::new(root).is_dir() {
        command.current_dir(root);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("cannot run {binary}: {error}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| format!("cannot write to {binary}: stdin is not available"))?;

    // The source goes out on its own thread: a large document must not fill the pipe while the child
    // is filling stdout, which would deadlock both sides.
    let payload = text.as_bytes().to_vec();
    let writer = thread::spawn(move || {
        let _ = stdin.write_all(&payload);
        // Dropping `stdin` closes the pipe, so the formatter sees end of input.
    });

    let output = child
        .wait_with_output()
        .map_err(|error| format!("cannot wait for {binary}: {error}"))?;
    // A formatter that exits early closes the pipe; the write error is already reflected in the status.
    let _ = writer.join();

    if !output.status.success() {
        return Err(format!(
            "{binary} failed ({}): {}",
            output.status,
            stderr_detail(&String::from_utf8_lossy(&output.stderr))
        ));
    }

    let formatted = String::from_utf8_lossy(&output.stdout).into_owned();
    if formatted.is_empty() {
        return Err(format!("{binary} produced nothing ({path})"));
    }

    Ok(formatted)
}

fn program_for(formatter: Formatter) -> &'static str {
    match formatter {
        Formatter::Rustfmt => RUSTFMT,
        Formatter::ClangFormat | Formatter::None => CLANG_FORMAT,
    }
}

/// Naming the tool and the install path is the whole point: a GUI launch cannot see `PATH`, so the
/// message has to say where the tool comes from.
fn missing(program: &str) -> String {
    if program == RUSTFMT {
        format!("{program} is not installed: run `rustup component add rustfmt`")
    } else {
        format!(
            "{program} is not installed: install the Xcode command line tools \
             (`xcode-select --install`) or run `brew install clang-format`"
        )
    }
}

/// First non-empty stderr line, trimmed and cut to the status-bar limit.
fn stderr_detail(stderr: &str) -> String {
    let line = stderr
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("no stderr output");
    truncate(line.trim(), STDERR_LIMIT)
}

fn truncate(text: &str, limit: usize) -> String {
    text.chars().take(limit).collect()
}

/// `PATH` first, then `xcrun`: `clang-format` lives in the Xcode toolchain, which a GUI-launched app
/// cannot see on its inherited `PATH`.
fn resolve(name: &str) -> Option<String> {
    find_on_path(name).or_else(|| find_with_xcrun(name))
}

/// Walk `PATH` by hand rather than shelling out, so a directory is never interpreted or expanded.
fn find_on_path(name: &str) -> Option<String> {
    let path = env::var_os("PATH")?;

    env::split_paths(&path).find_map(|dir| {
        if dir.as_os_str().is_empty() {
            return None;
        }

        let candidate = dir.join(name);
        is_executable(&candidate).then(|| candidate.to_string_lossy().into_owned())
    })
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    // `metadata` follows symlinks, so a link to a regular file counts as a hit.
    fs::metadata(path)
        .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    fs::metadata(path)
        .map(|meta| meta.is_file())
        .unwrap_or(false)
}

/// Ask `xcrun` for the tool's path; a missing `xcrun`, a non-zero status or a stale path is "not found".
fn find_with_xcrun(name: &str) -> Option<String> {
    let output = Command::new("xcrun").args(["--find", name]).output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let found = stdout.lines().next()?.trim();
    if found.is_empty() || !Path::new(found).exists() {
        return None;
    }

    Some(found.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SNIPPET: &str = "fn main(){println!(\"x\");}\n";

    #[test]
    fn rust_extension_maps_to_rustfmt() {
        assert_eq!(
            formatter_for_path("/projects/demo/src/main.rs"),
            Formatter::Rustfmt
        );
        assert_eq!(formatter_for_path("lib.rs"), Formatter::Rustfmt);
        // Extensions are matched case-insensitively.
        assert_eq!(formatter_for_path("MAIN.RS"), Formatter::Rustfmt);
    }

    #[test]
    fn every_c_family_extension_maps_to_clang_format() {
        for path in [
            "main.c", "main.h", "main.cc", "main.cpp", "main.cxx", "main.hh", "main.hpp",
            "MAIN.CPP",
        ] {
            assert_eq!(
                formatter_for_path(path),
                Formatter::ClangFormat,
                "unexpected formatter for {path}"
            );
        }
    }

    #[test]
    fn unknown_or_missing_extensions_have_no_formatter() {
        for path in [
            "notes.txt",
            "README.md",
            "Cargo.toml",
            "main",
            "/projects/demo/Makefile",
            "main.c.orig",
            "main.rs.bak",
        ] {
            assert_eq!(
                formatter_for_path(path),
                Formatter::None,
                "unexpected formatter for {path}"
            );
        }
    }

    #[test]
    fn oversized_input_is_rejected_by_name() {
        assert!(require_size(0).is_ok());
        assert!(require_size(MAX_INPUT_BYTES).is_ok());

        let error = require_size(MAX_INPUT_BYTES + 1).expect_err("over the limit");
        assert!(
            error.contains(&MAX_INPUT_BYTES.to_string()),
            "unexpected error: {error}"
        );
        assert!(error.contains("4 MiB"), "unexpected error: {error}");

        // The rejection scales with the input, so the message names the document's own size too.
        let big = MAX_INPUT_BYTES * 2;
        let error = require_size(big).expect_err("far over the limit");
        assert!(
            error.contains(&big.to_string()),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn stderr_detail_is_the_first_non_empty_line_truncated() {
        let stderr = "\n  error: expected one of `!`, `.`, `::`  \nnote: second line\n";
        assert_eq!(
            stderr_detail(stderr),
            "error: expected one of `!`, `.`, `::`"
        );

        assert_eq!(stderr_detail(""), "no stderr output");
        assert_eq!(stderr_detail("  \n\t\n"), "no stderr output");

        let long = "e".repeat(STDERR_LIMIT + 50);
        assert_eq!(stderr_detail(&long).chars().count(), STDERR_LIMIT);

        // Truncation counts characters, so a multi-byte line is never cut mid-character.
        let wide = "é".repeat(STDERR_LIMIT + 10);
        assert_eq!(stderr_detail(&wide).chars().count(), STDERR_LIMIT);
    }

    #[test]
    fn rustfmt_argv_is_edition_2021_to_stdout() {
        assert_eq!(
            argv(Formatter::Rustfmt, "/projects/demo/src/main.rs"),
            vec!["--edition", "2021", "--emit", "stdout"]
        );
    }

    #[test]
    fn clang_format_argv_assumes_the_document_path() {
        assert_eq!(
            argv(Formatter::ClangFormat, "/projects/demo/src/main.cpp"),
            vec!["-assume-filename=/projects/demo/src/main.cpp"]
        );
        // A space in the path stays inside one argument: no shell ever splits it.
        assert_eq!(
            argv(Formatter::ClangFormat, "/projects/my demo/main.c"),
            vec!["-assume-filename=/projects/my demo/main.c"]
        );
    }

    #[test]
    fn no_formatter_has_no_argv() {
        assert!(argv(Formatter::None, "/projects/demo/notes.txt").is_empty());
    }

    #[test]
    fn a_missing_formatter_names_the_tool_and_the_install_hint() {
        let rust = missing(RUSTFMT);
        assert!(rust.contains(RUSTFMT), "unexpected error: {rust}");
        assert!(
            rust.contains("rustup component add rustfmt"),
            "unexpected error: {rust}"
        );

        let clang = missing(CLANG_FORMAT);
        assert!(clang.contains(CLANG_FORMAT), "unexpected error: {clang}");
        assert!(
            clang.contains("xcode-select --install"),
            "unexpected error: {clang}"
        );
        assert!(
            clang.contains("brew install clang-format"),
            "unexpected error: {clang}"
        );
    }

    #[test]
    fn programs_are_named_for_each_formatter() {
        assert_eq!(program_for(Formatter::Rustfmt), RUSTFMT);
        assert_eq!(program_for(Formatter::ClangFormat), CLANG_FORMAT);
    }

    /// Opt-in: the real formatter only runs where it is installed.
    #[test]
    #[ignore = "requires rustfmt on PATH or through xcrun"]
    fn rustfmt_formats_a_snippet_from_stdin() {
        let root = env::temp_dir().to_string_lossy().into_owned();
        let formatted = run(Formatter::Rustfmt, &root, "/tmp/quarry-snippet.rs", SNIPPET)
            .expect("rustfmt should format the snippet");

        assert!(
            formatted.contains("fn main() {"),
            "unexpected output: {formatted}"
        );
        assert!(
            formatted.contains("println!(\"x\");"),
            "unexpected output: {formatted}"
        );
    }
}
