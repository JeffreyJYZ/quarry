//! Project-wide text search.
//!
//! Runs `rg --json` over the project root, parses its match records into `SearchMatch` and honours a
//! result cap. Never spawns a shell: every argument is passed separately, so the query is never
//! interpreted. `target/`, `node_modules/` and `.git/` are excluded, so a build tree cannot flood the
//! result list.

use crate::types::{SearchMatch, SearchReport};
use serde_json::Value;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::thread::{self, JoinHandle};
use std::time::Instant;

/// Default cap on returned matches.
pub const DEFAULT_MAX_RESULTS: u32 = 300;

/// Directories that never belong in a text search: build output, dependencies and git internals.
const EXCLUDES: [&str; 3] = ["target", "node_modules", ".git"];
const PROGRAM: &str = "rg";
const MISSING_PROGRAM: &str = "ripgrep (rg) is not installed: run `brew install ripgrep`";

#[tauri::command]
pub async fn search_project(
    root: String,
    query: String,
    max_results: Option<u32>,
) -> Result<SearchReport, String> {
    let query = require_query(&query)?;
    if !Path::new(&root).is_dir() {
        return Err(format!("search root is not a directory: {root}"));
    }

    let max_results = max_results.unwrap_or(DEFAULT_MAX_RESULTS);
    tauri::async_runtime::spawn_blocking(move || search(&root, &query, max_results))
        .await
        .map_err(|error| format!("search task failed: {error}"))?
}

/// A query of spaces matches every line, so it is rejected rather than run.
fn require_query(query: &str) -> Result<String, String> {
    if query.trim().is_empty() {
        return Err(
            "search query is empty: provide at least one non-whitespace character".to_string(),
        );
    }
    Ok(query.to_string())
}

/// Runs ripgrep and reports. Called on a blocking thread so the async runtime stays free.
fn search(root: &str, query: &str, max_results: u32) -> Result<SearchReport, String> {
    let started = Instant::now();
    let root = absolute_root(root);

    if max_results == 0 {
        return Ok(SearchReport {
            matches: Vec::new(),
            truncated: false,
            duration_ms: elapsed_ms(started),
        });
    }

    let binary = find_program(PROGRAM).ok_or_else(|| MISSING_PROGRAM.to_string())?;
    let mut child = search_command(&binary, &root, query)
        .spawn()
        .map_err(|error| format!("cannot run {binary}: {error}"))?;

    let stderr = drain_stderr(&mut child);
    let (mut matches, truncated) = read_matches(&mut child, &root, max_results);

    // The cap is reached: the rest of the output is not wanted, so stop the process.
    if truncated {
        let _ = child.kill();
    }
    let status = child
        .wait()
        .map_err(|error| format!("cannot wait for {binary}: {error}"))?;
    let stderr = stderr
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();

    if !truncated && !status.success() {
        // rg exits 1 when there are simply no matches; only 2 (and anything else) is a failure.
        if status.code() != Some(1) {
            return Err(ripgrep_error(&binary, &status, &stderr));
        }
    }

    sort_matches(&mut matches);
    Ok(SearchReport {
        matches,
        truncated,
        duration_ms: elapsed_ms(started),
    })
}

/// The full argument list: JSON records, 1-based lines, smart case, no colour, the three excluded
/// directories, the query as one literal `-e` argument, and the root. No shell is involved.
fn search_command(binary: &str, root: &Path, query: &str) -> Command {
    let mut command = Command::new(binary);
    command
        .arg("--json")
        .arg("--line-number")
        .arg("--smart-case")
        .arg("--no-heading")
        .arg("--color=never");
    for excluded in EXCLUDES {
        command.arg("-g").arg(format!("!{excluded}"));
    }
    command
        .arg("-e")
        .arg(query)
        .arg(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    command
}

/// Reads match records until the cap is reached; the caller kills the child, so nothing is drained.
fn read_matches(child: &mut Child, root: &Path, max_results: u32) -> (Vec<SearchMatch>, bool) {
    let Some(stdout) = child.stdout.take() else {
        return (Vec::new(), false);
    };
    let reader = BufReader::new(stdout);
    collect_matches(reader.lines().map_while(Result::ok), root, max_results)
}

/// Collects matches from a stream of JSON lines, stopping as soon as the cap is hit.
fn collect_matches(
    lines: impl Iterator<Item = impl AsRef<str>>,
    root: &Path,
    max_results: u32,
) -> (Vec<SearchMatch>, bool) {
    let mut matches = Vec::new();
    for line in lines {
        if let Some(found) = parse_match_line(line.as_ref(), root) {
            matches.push(found);
            if matches.len() >= max_results as usize {
                return (matches, true);
            }
        }
    }
    (matches, false)
}

/// Parses one JSON line; every record except `match` (and every malformed line) yields `None`.
fn parse_match_line(line: &str, root: &Path) -> Option<SearchMatch> {
    let record = serde_json::from_str::<Value>(line).ok()?;
    if record["type"].as_str() != Some("match") {
        return None;
    }

    let data = &record["data"];
    let path = data["path"]["text"].as_str()?;
    let text = data["lines"]["text"].as_str()?;
    let line_number = data["line_number"].as_u64()?;
    // The first submatch sits at the start of the reported column; a missing one falls back to 1.
    let start = data["submatches"]
        .as_array()
        .and_then(|submatches| submatches.first())
        .and_then(|submatch| submatch["start"].as_u64())
        .unwrap_or(0);

    Some(SearchMatch {
        path: absolute_match_path(path, root),
        line: u32::try_from(line_number).unwrap_or(u32::MAX),
        column: u32::try_from(start).unwrap_or(u32::MAX).saturating_add(1),
        text: strip_trailing_newline(text).to_string(),
    })
}

/// ripgrep already emits absolute paths for an absolute root; join defensively when it does not.
fn absolute_match_path(path: &str, root: &Path) -> String {
    let path = Path::new(path);
    if path.is_absolute() {
        return path.to_string_lossy().into_owned();
    }
    root.join(path).to_string_lossy().into_owned()
}

/// Makes a relative root absolute without resolving symlinks, so reported paths stay keyed to the
/// root the UI opened.
fn absolute_root(root: &str) -> PathBuf {
    let path = PathBuf::from(root);
    std::path::absolute(&path).unwrap_or(path)
}

/// `lines.text` carries the newline that ended the line; the UI renders the line itself.
fn strip_trailing_newline(text: &str) -> &str {
    text.strip_suffix("\r\n")
        .or_else(|| text.strip_suffix('\n'))
        .unwrap_or(text)
}

/// Stable order for the UI: by path, then by line.
fn sort_matches(matches: &mut [SearchMatch]) {
    matches.sort_by(|a, b| {
        a.path
            .cmp(&b.path)
            .then(a.line.cmp(&b.line))
            .then(a.column.cmp(&b.column))
    });
}

/// Drains stderr on its own thread, so a talkative failure cannot fill the pipe and deadlock.
fn drain_stderr(child: &mut Child) -> Option<JoinHandle<String>> {
    let stderr = child.stderr.take()?;
    Some(thread::spawn(move || {
        let mut text = String::new();
        let _ = BufReader::new(stderr).read_to_string(&mut text);
        text
    }))
}

/// Walk `PATH` by hand rather than shelling out, matching how the toolchain probe resolves tools.
fn find_program(name: &str) -> Option<String> {
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

fn ripgrep_error(binary: &str, status: &ExitStatus, stderr: &str) -> String {
    let detail = stderr
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("no stderr output");
    format!("{binary} failed ({status}): {}", detail.trim())
}

fn elapsed_ms(started: Instant) -> u64 {
    u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROOT: &str = "/projects/demo";

    fn root() -> &'static Path {
        Path::new(ROOT)
    }

    /// One line with a trailing newline, a submatch at byte 16 and line number 12.
    const MATCH: &str = r#"{"type":"match","data":{"path":{"text":"/projects/demo/src/main.rs"},"lines":{"text":"    let found = search_project(root);\n"},"line_number":12,"absolute_offset":0,"submatches":[{"match":{"text":"search_project"},"start":16,"end":30}]}}"#;

    #[test]
    fn match_record_uses_the_first_submatch_for_the_column() {
        let found = parse_match_line(MATCH, root()).expect("a match record");

        assert_eq!(found.path, "/projects/demo/src/main.rs");
        assert_eq!(found.line, 12);
        assert_eq!(found.column, 17);
        assert_eq!(found.text, "    let found = search_project(root);");
    }

    #[test]
    fn non_match_records_are_skipped() {
        let summary = r#"{"type":"summary","data":{"elapsed_total":{"secs":0,"nanos":1234,"human":"0.000001s"},"stats":{"bytes_printed":0,"matched_lines":0,"matches":0}}}"#;
        let begin = r#"{"type":"begin","data":{"path":{"text":"/projects/demo/src/main.rs"}}}"#;
        let end = r#"{"type":"end","data":{"path":{"text":"/projects/demo/src/main.rs"},"binary_offset":null,"stats":{}}}"#;

        assert!(parse_match_line(summary, root()).is_none());
        assert!(parse_match_line(begin, root()).is_none());
        assert!(parse_match_line(end, root()).is_none());

        let (matches, truncated) =
            collect_matches([begin, MATCH, summary, end].into_iter(), root(), 10);
        assert_eq!(matches.len(), 1);
        assert!(!truncated);
    }

    #[test]
    fn line_text_loses_its_trailing_newline() {
        let lf = parse_match_line(MATCH, root()).expect("a match record");
        assert!(!lf.text.ends_with('\n'));

        let crlf = MATCH.replace("\\n", "\\r\\n");
        let found = parse_match_line(&crlf, root()).expect("a match record");
        assert_eq!(found.text, "    let found = search_project(root);");
    }

    #[test]
    fn cap_stops_collection_and_reports_truncation() {
        let second = MATCH.replace("line_number\":12", "line_number\":13");
        let third = MATCH.replace("line_number\":12", "line_number\":14");
        let lines = [MATCH, second.as_str(), third.as_str()];

        let (matches, truncated) = collect_matches(lines.into_iter(), root(), 2);
        assert_eq!(matches.len(), 2);
        assert!(truncated);

        let (all, uncapped) = collect_matches(lines.into_iter(), root(), 10);
        assert_eq!(all.len(), 3);
        assert!(!uncapped);

        let exactly = collect_matches(lines[..2].iter().copied(), root(), 2);
        assert_eq!(exactly.0.len(), 2);
        assert!(exactly.1);
    }

    #[test]
    fn malformed_lines_are_skipped_without_panicking() {
        let truncated_json = r#"{"type":"match","data":{"path":"#;
        let not_json = "src/main.rs:12:search_project";

        assert!(parse_match_line(truncated_json, root()).is_none());
        assert!(parse_match_line(not_json, root()).is_none());
        assert!(parse_match_line("", root()).is_none());

        let (matches, _) =
            collect_matches([truncated_json, MATCH, not_json].into_iter(), root(), 10);
        assert_eq!(matches.len(), 1);
    }

    #[test]
    fn relative_paths_are_joined_to_the_root() {
        let relative = MATCH.replace("/projects/demo/src/main.rs", "src/main.rs");
        let found = parse_match_line(&relative, root()).expect("a match record");

        assert_eq!(found.path, "/projects/demo/src/main.rs");
    }

    #[test]
    fn matches_sort_by_path_then_line() {
        let later = MATCH.replace("line_number\":12", "line_number\":20");
        let other = MATCH.replace("/projects/demo/src/main.rs", "/projects/demo/src/lib.rs");
        let mut matches = vec![
            parse_match_line(&later, root()).expect("a match record"),
            parse_match_line(&other, root()).expect("a match record"),
            parse_match_line(MATCH, root()).expect("a match record"),
        ];

        sort_matches(&mut matches);

        let order: Vec<(&str, u32)> = matches
            .iter()
            .map(|found| (found.path.as_str(), found.line))
            .collect();
        assert_eq!(
            order,
            vec![
                ("/projects/demo/src/lib.rs", 12),
                ("/projects/demo/src/main.rs", 12),
                ("/projects/demo/src/main.rs", 20),
            ]
        );
    }

    #[test]
    fn empty_queries_are_rejected_by_name() {
        assert!(require_query("").is_err());
        assert!(require_query(" \n\t ").is_err());
        assert_eq!(require_query("needle").as_deref(), Ok("needle"));
    }
}
