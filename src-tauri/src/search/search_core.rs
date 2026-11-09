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
pub use std::sync::atomic::{AtomicU32, Ordering};
pub use std::thread::{self, JoinHandle};
pub use std::time::Instant;

use super::*;

/// A query of spaces matches every line, so it is rejected rather than run.
pub fn require_query(query: &str) -> Result<String, String> {
    if query.trim().is_empty() {
        return Err(
            "search query is empty: provide at least one non-whitespace character".to_string(),
        );
    }
    Ok(query.to_string())
}
/// Runs ripgrep and reports. Called on a blocking thread so the async runtime stays free.
/// pid of the ripgrep child currently running for a search, if any. 0 means none.
pub static ACTIVE_RG: AtomicU32 = AtomicU32::new(0);

/// Kill the ripgrep child of a search that is still running, if any.
pub fn cancel_active_search() {
    let pid = ACTIVE_RG.swap(0, Ordering::SeqCst);
    if pid != 0 {
        let _ = Command::new("kill").arg("-9").arg(pid.to_string()).status();
    }
}

pub fn search(
    root: &str,
    query: &str,
    max_results: u32,
    case_sensitive: bool,
    fixed_strings: bool,
) -> Result<SearchReport, String> {
    // A newer query (or an explicit cancel) owns the slot: stop any rg still running.
    cancel_active_search();

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
    let mut child = search_command(&binary, &root, query, case_sensitive, fixed_strings)
        .spawn()
        .map_err(|error| format!("cannot run {binary}: {error}"))?;

    let child_id = child.id();
    ACTIVE_RG.store(child_id, Ordering::SeqCst);

    let stderr = drain_stderr(&mut child);
    let (mut matches, truncated) = read_matches(&mut child, &root, max_results);

    // The cap is reached: the rest of the output is not wanted, so stop the process.
    if truncated {
        let _ = child.kill();
    }
    let status = child
        .wait()
        .map_err(|error| format!("cannot wait for {binary}: {error}"))?;

    // release the slot if this search still owns it
    let _ = ACTIVE_RG.compare_exchange(child_id, 0, Ordering::SeqCst, Ordering::SeqCst);
    let stderr = stderr
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();

    if !truncated && !status.success() {
        // Terminated by signal: this search was cancelled by a newer query; report it as a
        // cancellation (empty result) rather than a failure.
        if status.code().is_none() {
            return Ok(SearchReport {
                matches: Vec::new(),
                truncated: false,
                duration_ms: elapsed_ms(started),
            });
        }
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
/// Whole-word matching is deliberately NOT a flag here: the caller wraps the query in
/// word boundaries (`\\b...\\b`) and passes it as the regex, so no `--word-regexp` is added.
pub fn search_command(
    binary: &str,
    root: &Path,
    query: &str,
    case_sensitive: bool,
    fixed_strings: bool,
) -> Command {
    let mut command = Command::new(binary);
    command.arg("--json").arg("--line-number");
    if case_sensitive {
        command.arg("--case-sensitive");
    } else {
        command.arg("--smart-case");
    }
    if fixed_strings {
        command.arg("--fixed-strings");
    }
    command.arg("--no-heading").arg("--color=never");
    for excluded in ignore::ripgrep_excludes() {
        command.arg("-g").arg(excluded);
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
pub fn read_matches(child: &mut Child, root: &Path, max_results: u32) -> (Vec<SearchMatch>, bool) {
    let Some(stdout) = child.stdout.take() else {
        return (Vec::new(), false);
    };
    let reader = BufReader::new(stdout);
    collect_matches(reader.lines().map_while(Result::ok), root, max_results)
}
