//! Git status and per-file diffs through the `git` binary.
//!
//! Unit owns the body of this file. Contract: never link libgit2, never run a mutating command, and
//! parse porcelain output rather than locale-dependent human output.
//!
//! Every read-only command runs off the async runtime on a blocking thread. A directory that is
//! not a repository is not an error: the status comes back empty so the UI can hide the panel.

use serde::Serialize;
use std::fs;
use std::path::Path;
use std::process::Command;

use crate::resolve;
use crate::types::{GitFileDiff, GitStatus, GitStatusEntry};

/// Program used to talk to git; it is never bundled.
const GIT_PROGRAM: &str = "git";
/// Longest stderr excerpt kept in an error message.
const ERROR_LIMIT: usize = 300;

/// Status names the frontend knows.
const STATUS_MODIFIED: &str = "modified";
const STATUS_ADDED: &str = "added";
const STATUS_DELETED: &str = "deleted";
const STATUS_RENAMED: &str = "renamed";
const STATUS_UNTRACKED: &str = "untracked";
const STATUS_CONFLICTED: &str = "conflicted";

#[tauri::command]
pub async fn git_status(root: String) -> Result<GitStatus, String> {
    tauri::async_runtime::spawn_blocking(move || status(&root))
        .await
        .map_err(|error| format!("git status failed: {error}"))?
}

#[tauri::command]
pub async fn git_file_diff(root: String, path: String) -> Result<GitFileDiff, String> {
    tauri::async_runtime::spawn_blocking(move || file_diff(&root, &path))
        .await
        .map_err(|error| format!("git diff failed: {error}"))?
}

/// One changed path, relative to the project root.
struct Entry {
    path: String,
    status: String,
    staged: bool,
}

/// The parsed porcelain stream, before paths are made absolute.
struct StatusParts {
    branch: Option<String>,
    entries: Vec<Entry>,
    ahead: u32,
    behind: u32,
}

/// Reads the working tree state. A directory without a repository is not an error.
fn status(root: &str) -> Result<GitStatus, String> {
    let program = git_program()?;
    let output = run(
        &program,
        root,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "--untracked-files=all",
        ],
    )?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_not_a_repository(&stderr) {
            return Ok(GitStatus {
                branch: None,
                entries: Vec::new(),
                ahead: 0,
                behind: 0,
            });
        }
        return Err(operation_error("git status", &stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parts = parse_status(&stdout);
    let entries = parts
        .entries
        .into_iter()
        .map(|entry| GitStatusEntry {
            path: absolute_path(root, &entry.path),
            status: entry.status,
            staged: entry.staged,
        })
        .collect();

    Ok(GitStatus {
        branch: parts.branch,
        entries,
        ahead: parts.ahead,
        behind: parts.behind,
    })
}

/// Reads one file's diff against `HEAD`.
///
/// A repository without commits has no `HEAD`, so the diff falls back to the working tree against
/// the index. An untracked file has no diff at all: its whole content becomes an added hunk.
fn file_diff(root: &str, path: &str) -> Result<GitFileDiff, String> {
    let program = git_program()?;
    let relative = relative_path(root, path);

    let mut output = run(
        &program,
        root,
        &["diff", "--no-color", "--unified=3", "HEAD", "--", &relative],
    )?;
    if !output.status.success() {
        output = run(&program, root, &["diff", "--no-color", "--", &relative])?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(operation_error("git diff", &stderr));
        }
    }

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    if has_hunk(&stdout) {
        return Ok(GitFileDiff {
            path: absolute_path(root, &relative),
            diff: stdout,
            binary: false,
        });
    }

    if is_untracked(&program, root, &relative) {
        let content = read_file(root, &relative)?;
        if content.as_bytes().contains(&0) {
            return Ok(GitFileDiff {
                path: absolute_path(root, &relative),
                diff: String::new(),
                binary: true,
            });
        }
        return Ok(GitFileDiff {
            path: absolute_path(root, &relative),
            diff: untracked_diff(&relative, &content),
            binary: false,
        });
    }

    Ok(GitFileDiff {
        path: absolute_path(root, &relative),
        diff: String::new(),
        binary: true,
    })
}

/// Parses the porcelain=v2 stream into branch, ahead/behind counts and entries.
fn parse_status(stdout: &str) -> StatusParts {
    let mut parts = StatusParts {
        branch: None,
        entries: Vec::new(),
        ahead: 0,
        behind: 0,
    };

    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix("# branch.head ") {
            let name = rest.trim();
            parts.branch = (!name.is_empty() && name != "(detached)").then(|| name.to_string());
            continue;
        }
        if let Some(rest) = line.strip_prefix("# branch.ab ") {
            let (ahead, behind) = parse_ahead_behind(rest);
            parts.ahead = ahead;
            parts.behind = behind;
            continue;
        }
        if line.starts_with('#') {
            continue;
        }
        if let Some(entry) = parse_entry(line) {
            parts.entries.push(entry);
        }
    }

    parts
}

/// `# branch.ab +2 -1` carries the two counts.
fn parse_ahead_behind(rest: &str) -> (u32, u32) {
    let mut ahead = 0;
    let mut behind = 0;
    for token in rest.split_whitespace() {
        let Some(value) = token.strip_prefix(['+', '-']) else {
            continue;
        };
        let Ok(number) = value.parse::<u32>() else {
            continue;
        };
        if token.starts_with('+') {
            ahead = number;
        } else {
            behind = number;
        }
    }
    (ahead, behind)
}

/// One entry line, in any of the four porcelain=v2 shapes.
fn parse_entry(line: &str) -> Option<Entry> {
    if let Some(rest) = line.strip_prefix("? ") {
        let path = unquote_path(rest.trim());
        if path.is_empty() {
            return None;
        }
        return Some(Entry {
            path,
            status: STATUS_UNTRACKED.to_string(),
            staged: false,
        });
    }

    if let Some(rest) = line.strip_prefix("1 ") {
        let fields: Vec<&str> = rest.splitn(8, ' ').collect();
        if fields.len() < 8 {
            return None;
        }
        let (x, y) = codes(fields[0]);
        let path = unquote_path(fields[7]);
        return entry(path, x, y);
    }

    if let Some(rest) = line.strip_prefix("2 ") {
        let fields: Vec<&str> = rest.splitn(9, ' ').collect();
        if fields.len() < 9 {
            return None;
        }
        let (x, y) = codes(fields[0]);
        let path = rename_path(fields[8]);
        return entry(path, x, y);
    }

    if let Some(rest) = line.strip_prefix("u ") {
        let fields: Vec<&str> = rest.splitn(10, ' ').collect();
        if fields.len() < 10 {
            return None;
        }
        let (x, y) = codes(fields[0]);
        let path = unquote_path(fields[9]);
        return entry(path, x, y);
    }

    None
}

/// The staged and unstaged codes of an XY pair.
fn codes(xy: &str) -> (char, char) {
    let mut chars = xy.chars();
    (chars.next().unwrap_or('.'), chars.next().unwrap_or('.'))
}

/// Builds an entry from the two status codes.
///
/// The staged code wins when it is set; otherwise the unstaged code names the change.
fn entry(path: String, x: char, y: char) -> Option<Entry> {
    if path.is_empty() {
        return None;
    }
    let code = if x != '.' { x } else { y };
    let Some(status) = status_name(code) else {
        return None;
    };
    let staged = x != '.' && x != '?';
    Some(Entry {
        path,
        status: status.to_string(),
        staged,
    })
}

/// Maps one porcelain code onto a status name.
fn status_name(code: char) -> Option<&'static str> {
    match code {
        'M' | 'T' => Some(STATUS_MODIFIED),
        'A' | 'C' => Some(STATUS_ADDED),
        'D' => Some(STATUS_DELETED),
        'R' => Some(STATUS_RENAMED),
        'U' | 'u' => Some(STATUS_CONFLICTED),
        '?' => Some(STATUS_UNTRACKED),
        _ => None,
    }
}

/// A rename line ends with `new path<TAB>original path`; the new path is the one shown.
fn rename_path(field: &str) -> String {
    let path = match field.split_once('\t') {
        Some((path, _original)) => path,
        None => field,
    };
    unquote_path(path.trim())
}

/// Undoes git's quoting of paths with control characters or non-ASCII bytes.
fn unquote_path(path: &str) -> String {
    if !path.starts_with('"') || !path.ends_with('"') || path.len() < 2 {
        return path.to_string();
    }

    let inner = &path[1..path.len() - 1];
    let mut out = String::with_capacity(inner.len());
    let mut chars = inner.chars();
    while let Some(character) = chars.next() {
        if character != '\\' {
            out.push(character);
            continue;
        }
        match chars.next() {
            Some('t') => out.push('\t'),
            Some('n') => out.push('\n'),
            Some('r') => out.push('\r'),
            Some('"') => out.push('"'),
            Some('\\') => out.push('\\'),
            Some(digit @ '0'..='7') => {
                let mut code = digit.to_digit(8).unwrap_or(0);
                for _ in 0..2 {
                    let Some(next @ '0'..='7') = chars.next() else {
                        break;
                    };
                    code = code * 8 + next.to_digit(8).unwrap_or(0);
                }
                out.push(char::from_u32(code).unwrap_or('\u{fffd}'));
            }
            Some(other) => out.push(other),
            None => out.push('\\'),
        }
    }
    out
}

/// Joins a root-relative path onto the root, for the frontend.
fn absolute_path(root: &str, relative: &str) -> String {
    Path::new(root)
        .join(relative)
        .to_string_lossy()
        .into_owned()
}

/// The path git should see: relative to the root when the caller gave an absolute one.
fn relative_path(root: &str, path: &str) -> String {
    let root_path = Path::new(root);
    let given = Path::new(path);
    if given.is_absolute() {
        if let Ok(stripped) = given.strip_prefix(root_path) {
            let relative = stripped.to_string_lossy().replace('\\', "/");
            if !relative.is_empty() {
                return relative;
            }
        }
    }
    path.replace('\\', "/")
}

/// True when git says the directory is not a repository.
fn is_not_a_repository(stderr: &str) -> bool {
    stderr.contains("not a git repository")
}

/// The first stderr line, truncated for the error message.
fn operation_error(operation: &str, stderr: &str) -> String {
    let line = stderr
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("failed");
    format!("{operation} failed: {}", truncate(line, ERROR_LIMIT))
}

fn truncate(text: &str, limit: usize) -> String {
    text.chars().take(limit).collect()
}

/// True when the diff carries at least one hunk, which is what makes it a text diff.
fn has_hunk(diff: &str) -> bool {
    diff.lines().any(|line| line.starts_with("@@"))
}

/// True when git does not track the path.
fn is_untracked(program: &str, root: &str, relative: &str) -> bool {
    let Ok(output) = run(
        program,
        root,
        &["ls-files", "--error-unmatch", "--", relative],
    ) else {
        return false;
    };
    !output.status.success()
}

/// Reads a file from the project root.
fn read_file(root: &str, relative: &str) -> Result<String, String> {
    let path = Path::new(root).join(relative);
    fs::read_to_string(&path)
        .map_err(|error| format!("git diff failed: cannot read {path:?}: {error}"))
}

/// Builds the diff of an untracked file: its whole content as one added hunk.
fn untracked_diff(path: &str, content: &str) -> String {
    let mut diff = String::new();
    diff.push_str(&format!("diff --git a/{path} b/{path}\n"));
    diff.push_str("new file mode 100644\n");
    diff.push_str("--- /dev/null\n");
    diff.push_str(&format!("+++ b/{path}\n"));

    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return diff;
    }

    diff.push_str(&format!("@@ -0,0 +1,{} @@\n", lines.len()));
    for line in lines {
        diff.push('+');
        diff.push_str(line);
        diff.push('\n');
    }
    diff
}

/// Runs git in the project root and returns its raw output.
fn run(program: &str, root: &str, args: &[&str]) -> Result<std::process::Output, String> {
    Command::new(program)
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|error| format!("cannot run {program} in {root}: {error}"))
}

/// Finds git on `PATH`, then through `xcrun`, like the toolchain probe does.
fn git_program() -> Result<String, String> {
    if let Some(found) = resolve::resolve(GIT_PROGRAM) {
        return Ok(found.path.to_string_lossy().into_owned());
    }
    Err(format!(
        "{GIT_PROGRAM} is not installed: it is not on PATH and xcrun cannot find it"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROOT: &str = "/projects/demo";

    /// Porcelain=v2 stream with every entry shape the parser must know.
    const FIXTURE: &str = concat!(
        "# branch.oid 1111111111111111111111111111111111111111\n",
        "# branch.head main\n",
        "# branch.upstream origin/main\n",
        "# branch.ab +2 -1\n",
        "1 M. N... 100644 100644 100644 aaa bbb staged.rs\n",
        "1 .M N... 100644 100644 100644 ccc ddd unstaged.rs\n",
        "? untracked.rs\n",
        "2 R. N... 100644 100644 100644 eee fff R100 new.rs\told.rs\n",
        "u UU N... 100644 100644 100644 100644 ggg hhh ijj conflict.rs\n",
    );

    #[test]
    fn status_parses_branch_counts_and_entries() {
        let parts = parse_status(FIXTURE);

        assert_eq!(parts.branch.as_deref(), Some("main"));
        assert_eq!(parts.ahead, 2);
        assert_eq!(parts.behind, 1);
        assert_eq!(parts.entries.len(), 5);

        assert_eq!(parts.entries[0].path, "staged.rs");
        assert_eq!(parts.entries[0].status, STATUS_MODIFIED);
        assert!(parts.entries[0].staged);

        assert_eq!(parts.entries[1].path, "unstaged.rs");
        assert_eq!(parts.entries[1].status, STATUS_MODIFIED);
        assert!(!parts.entries[1].staged);

        assert_eq!(parts.entries[2].path, "untracked.rs");
        assert_eq!(parts.entries[2].status, STATUS_UNTRACKED);
        assert!(!parts.entries[2].staged);

        assert_eq!(parts.entries[3].path, "new.rs");
        assert_eq!(parts.entries[3].status, STATUS_RENAMED);
        assert!(parts.entries[3].staged);

        assert_eq!(parts.entries[4].path, "conflict.rs");
        assert_eq!(parts.entries[4].status, STATUS_CONFLICTED);
        assert!(parts.entries[4].staged);
    }

    #[test]
    fn ahead_and_behind_survive_a_missing_branch_ab_line() {
        let parts = parse_status("# branch.head main\n1 .M N... 100644 100644 100644 a b c\n");
        assert_eq!(parts.ahead, 0);
        assert_eq!(parts.behind, 0);
    }

    #[test]
    fn a_detached_head_has_no_branch() {
        let parts = parse_status("# branch.head (detached)\n");
        assert_eq!(parts.branch, None);
    }

    #[test]
    fn not_a_repository_is_recognised_and_maps_to_an_empty_status() {
        assert!(is_not_a_repository(
            "fatal: not a git repository (or any of the parent directories): .git\n"
        ));
        assert!(!is_not_a_repository("fatal: something else went wrong\n"));
    }

    #[test]
    fn entry_paths_are_joined_onto_the_root() {
        assert_eq!(
            absolute_path(ROOT, "src/main.rs"),
            "/projects/demo/src/main.rs"
        );
        assert_eq!(absolute_path(ROOT, "a b/c.rs"), "/projects/demo/a b/c.rs");
    }

    #[test]
    fn relative_path_strips_the_root_from_an_absolute_path() {
        assert_eq!(
            relative_path(ROOT, "/projects/demo/src/main.rs"),
            "src/main.rs"
        );
        assert_eq!(relative_path(ROOT, "src/main.rs"), "src/main.rs");
        assert_eq!(
            relative_path(ROOT, "/elsewhere/main.rs"),
            "/elsewhere/main.rs"
        );
    }

    #[test]
    fn a_binary_diff_has_no_hunk() {
        let diff = "diff --git a/logo.png b/logo.png\nindex 111..222 100644\nBinary files a/logo.png and b/logo.png differ\n";
        assert!(!has_hunk(diff));

        let text = "diff --git a/main.rs b/main.rs\nindex 111..222 100644\n--- a/main.rs\n+++ b/main.rs\n@@ -1,2 +1,2 @@\n-old\n+new\n";
        assert!(has_hunk(text));
    }

    #[test]
    fn an_untracked_file_becomes_one_added_hunk() {
        let diff = untracked_diff("new.rs", "fn main() {}\nlet x = 1;\n");

        assert!(diff.starts_with("diff --git a/new.rs b/new.rs\n"));
        assert!(diff.contains("new file mode 100644\n"));
        assert!(diff.contains("--- /dev/null\n"));
        assert!(diff.contains("+++ b/new.rs\n"));
        assert!(diff.contains("@@ -0,0 +1,2 @@\n"));
        assert!(diff.ends_with("+fn main() {}\n+let x = 1;\n"));
    }

    #[test]
    fn an_empty_untracked_file_has_no_hunk() {
        let diff = untracked_diff("empty.rs", "");
        assert!(diff.contains("+++ b/empty.rs\n"));
        assert!(!diff.contains("@@"));
    }

    #[test]
    fn status_codes_map_onto_names() {
        assert_eq!(status_name('M'), Some(STATUS_MODIFIED));
        assert_eq!(status_name('A'), Some(STATUS_ADDED));
        assert_eq!(status_name('D'), Some(STATUS_DELETED));
        assert_eq!(status_name('R'), Some(STATUS_RENAMED));
        assert_eq!(status_name('U'), Some(STATUS_CONFLICTED));
        assert_eq!(status_name('u'), Some(STATUS_CONFLICTED));
        assert_eq!(status_name('?'), Some(STATUS_UNTRACKED));
        assert_eq!(status_name('.'), None);
    }

    #[test]
    fn errors_name_the_operation_and_the_first_stderr_line() {
        let error = operation_error("git status", "fatal: bad usage\nsecond line\n");
        assert_eq!(error, "git status failed: fatal: bad usage");

        let long = "e".repeat(ERROR_LIMIT + 100);
        let error = operation_error("git diff", &long);
        assert!(error.starts_with("git diff failed: "));
        assert_eq!(
            error.chars().count(),
            "git diff failed: ".len() + ERROR_LIMIT
        );
    }

    #[test]
    fn quoted_paths_are_unquoted() {
        assert_eq!(unquote_path("plain.rs"), "plain.rs");
        assert_eq!(unquote_path("\"with space.rs\""), "with space.rs");
        assert_eq!(unquote_path("\"tab\\there.rs\""), "tab\there.rs");
    }

    #[test]
    fn commit_message_rejects_empty_and_whitespace() {
        assert!(validate_commit_message("").is_err());
        assert!(validate_commit_message("   \n\t").is_err());
    }

    #[test]
    fn commit_message_rejects_oversized() {
        let message = "a".repeat(4097);
        assert!(validate_commit_message(&message).is_err());
    }

    #[test]
    fn commit_message_accepts_normal() {
        assert!(validate_commit_message("fix: thing").is_ok());
    }

    #[test]
    fn commit_argv_keeps_a_leading_dash_as_the_value_of_m() {
        let argv = commit_argv("-foo");
        assert_eq!(argv, vec!["commit", "-m", "-foo"]);
    }

    #[test]
    fn commit_hash_too_short_is_rejected() {
        assert!(validate_commit_hash("abc").is_err());
    }

    #[test]
    fn commit_hash_non_hex_is_rejected() {
        assert!(validate_commit_hash("zzzz").is_err());
    }

    #[test]
    fn commit_hash_40_hex_is_accepted() {
        let hash = "a".repeat(40);
        assert!(validate_commit_hash(&hash).is_ok());
    }

    #[test]
    fn binary_diff_detects_binary_files_fixture() {
        let output = "diff --git a/logo.png b/logo.png\nindex 111..222\nBinary files a/logo.png and b/logo.png differ\n";
        assert!(is_binary_diff(output));
    }

    #[test]
    fn binary_diff_detects_empty_diff() {
        assert!(is_binary_diff(""));
    }

    #[test]
    fn commit_diff_argv_builds_expected() {
        let argv = commit_diff_argv("abc123");
        assert_eq!(
            argv,
            vec!["show", "--no-color", "--unified=3", "--format=", "abc123"]
        );
    }
}

/// Stage paths (relative to `root` or absolute inside it). Never a shell, never outside the root.
#[tauri::command]
pub async fn git_stage(root: String, paths: Vec<String>) -> Result<(), String> {
    let validated = validate_paths(&root, &paths)?;
    tauri::async_runtime::spawn_blocking(move || stage(&root, &validated))
        .await
        .map_err(|error| format!("git stage failed: {error}"))?
}

#[tauri::command]
pub async fn git_unstage(root: String, paths: Vec<String>) -> Result<(), String> {
    let validated = validate_paths(&root, &paths)?;
    tauri::async_runtime::spawn_blocking(move || unstage(&root, &validated))
        .await
        .map_err(|error| format!("git unstage failed: {error}"))?
}

fn stage(root: &str, paths: &[String]) -> Result<(), String> {
    run_mutation(root, paths, &["add", "--"], "git stage")
}

fn unstage(root: &str, paths: &[String]) -> Result<(), String> {
    run_mutation(root, paths, &["restore", "--staged", "--"], "git unstage")
}

fn run_mutation(
    root: &str,
    paths: &[String],
    head: &[&str],
    operation: &str,
) -> Result<(), String> {
    let program = git_program()?;
    let mut command = Command::new(&program);
    command.args(head).args(paths).current_dir(root);
    let output = command
        .output()
        .map_err(|error| format!("cannot run {program} in {root}: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_not_a_repository(&stderr) {
            return Err(format!("not a git repository: {root}"));
        }
        return Err(operation_error(operation, &stderr));
    }
    Ok(())
}

#[allow(dead_code)]
pub fn validate_path(root: &str, path: &str) -> Result<String, String> {
    if path.is_empty() {
        return Err("path must not be empty".to_string());
    }
    let canonical_root = fs::canonicalize(root).unwrap_or_else(|_| std::path::PathBuf::from(root));
    let given = std::path::Path::new(path);
    for component in given.components() {
        if let std::path::Component::ParentDir = component {
            return Err(format!("path escapes the repository root: {path}"));
        }
    }
    if given.is_absolute() {
        if !given.starts_with(&canonical_root) && !given.starts_with(root) {
            return Err(format!("path is outside the repository root: {path}"));
        }
    }
    Ok(path.to_string())
}

#[allow(dead_code)]
pub fn validate_paths(root: &str, paths: &[String]) -> Result<Vec<String>, String> {
    if paths.is_empty() {
        return Err("no paths given".to_string());
    }
    let mut validated = Vec::with_capacity(paths.len());
    for path in paths {
        validated.push(validate_path(root, path)?);
    }
    Ok(validated)
}

#[allow(dead_code)]
pub fn stage_args(paths: &[String]) -> Vec<String> {
    let mut argv = vec!["add".to_string(), "--".to_string()];
    argv.extend(paths.iter().cloned());
    argv
}

#[allow(dead_code)]
pub fn unstage_args(paths: &[String]) -> Vec<String> {
    let mut argv = vec![
        "restore".to_string(),
        "--staged".to_string(),
        "--".to_string(),
    ];
    argv.extend(paths.iter().cloned());
    argv
}

/// Validates a commit message before it reaches git.
pub fn validate_commit_message(message: &str) -> Result<(), String> {
    if message.trim().is_empty() {
        return Err("commit message must not be empty".to_string());
    }
    if message.len() > 4096 {
        return Err("commit message exceeds 4096 bytes".to_string());
    }
    Ok(())
}

/// Builds the argv for `git commit`, with the message as the value of `-m`.
pub fn commit_argv(message: &str) -> Vec<String> {
    vec!["commit".to_string(), "-m".to_string(), message.to_string()]
}

/// Commit the staged changes with `message`. Refuses an empty message or an empty index.
#[tauri::command]
pub async fn git_commit(root: String, message: String) -> Result<String, String> {
    validate_commit_message(&message)?;
    tauri::async_runtime::spawn_blocking(move || commit(&root, &message))
        .await
        .map_err(|error| format!("git commit failed: {error}"))?
}

fn commit(root: &str, message: &str) -> Result<String, String> {
    let program = git_program()?;

    // Refuse an empty index before touching commit: a zero exit means "nothing staged".
    let staged_check = Command::new(&program)
        .args(["diff", "--cached", "--quiet"])
        .current_dir(root)
        .output()
        .map_err(|error| format!("cannot run {program} in {root}: {error}"))?;
    let stderr = String::from_utf8_lossy(&staged_check.stderr);
    if is_not_a_repository(&stderr) {
        return Err(format!("not a git repository: {root}"));
    }
    if staged_check.status.success() {
        return Err("nothing staged to commit; stage something first".to_string());
    }

    let output = Command::new(&program)
        .args(commit_argv(message))
        .current_dir(root)
        .output()
        .map_err(|error| format!("cannot run {program} in {root}: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_not_a_repository(&stderr) {
            return Err(format!("not a git repository: {root}"));
        }
        return Err(operation_error("git commit", &stderr));
    }

    // The commit already landed; a failed rev-parse must not turn success into failure.
    let hash_output = Command::new(&program)
        .args(["rev-parse", "--short", "HEAD"])
        .current_dir(root)
        .output();
    match hash_output {
        Ok(result) if result.status.success() => {
            Ok(String::from_utf8_lossy(&result.stdout).trim().to_string())
        }
        _ => Ok(String::new()),
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub current: bool,
}

#[tauri::command]
pub async fn git_branches(root: String) -> Result<Vec<Branch>, String> {
    tauri::async_runtime::spawn_blocking(move || branches(&root))
        .await
        .map_err(|error| format!("git branch failed: {error}"))?
}

/// Switch branches. Never forces: git's own refusal on a dirty tree is the answer.
#[tauri::command]
pub async fn git_checkout(root: String, branch: String) -> Result<(), String> {
    validate_branch_name(&branch)?;
    tauri::async_runtime::spawn_blocking(move || checkout(&root, &branch))
        .await
        .map_err(|error| format!("git checkout failed: {error}"))?
}

fn branches(root: &str) -> Result<Vec<Branch>, String> {
    let program = git_program()?;
    let output = run(
        &program,
        root,
        &["branch", "--format=%(refname:short)%09%(HEAD)"],
    )?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_not_a_repository(&stderr) {
            return Ok(Vec::new());
        }
        return Err(operation_error("git branch", &stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut parsed = parse_branches(&stdout);
    sort_branches(&mut parsed);
    Ok(parsed)
}

fn checkout(root: &str, branch: &str) -> Result<(), String> {
    let program = git_program()?;
    let output = Command::new(&program)
        .args(checkout_argv(branch))
        .current_dir(root)
        .output()
        .map_err(|error| format!("cannot run {program} in {root}: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_not_a_repository(&stderr) {
            return Err(format!("not a git repository: {root}"));
        }
        return Err(operation_error("git checkout", &stderr));
    }
    Ok(())
}

/// Parses the tab-separated output of `git branch --format=...`.
pub fn parse_branches(stdout: &str) -> Vec<Branch> {
    let mut branches = Vec::new();
    for line in stdout.lines() {
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split('\t');
        let name = parts.next().unwrap_or("").trim();
        if name.is_empty() {
            continue;
        }
        let head = parts.next().unwrap_or("");
        let current = head.trim() == "*";
        branches.push(Branch {
            name: name.to_string(),
            current,
        });
    }
    branches
}

/// Sorts branches: current first, then alphabetically by name.
pub fn sort_branches(branches: &mut [Branch]) {
    branches.sort_by(|left, right| {
        right
            .current
            .cmp(&left.current)
            .then_with(|| left.name.cmp(&right.name))
    });
}

#[allow(dead_code)]
pub fn validate_branch_name(branch: &str) -> Result<(), String> {
    if branch.is_empty() {
        return Err("branch name must not be empty".to_string());
    }
    if !branch
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || "._/-".contains(character))
    {
        return Err("branch name must contain only characters in [A-Za-z0-9._/-]".to_string());
    }
    if branch
        .split('/')
        .any(|segment| segment.is_empty() || segment == "..")
    {
        return Err("branch name must not contain '..' segments".to_string());
    }
    Ok(())
}

/// Builds the argv for `git checkout <branch>`.
#[allow(dead_code)]
pub fn checkout_argv(branch: &str) -> Vec<String> {
    vec!["checkout".to_string(), branch.to_string()]
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitEntry {
    pub hash: String,
    pub subject: String,
    pub author: String,
    pub when: String,
}

/// Default and bounds for `git_log`.
const DEFAULT_LOG_LIMIT: u32 = 50;
const MAX_LOG_LIMIT: u32 = 500;
const MIN_LOG_LIMIT: u32 = 1;

#[tauri::command]
pub async fn git_log(root: String, limit: Option<u32>) -> Result<Vec<GitCommitEntry>, String> {
    let limit = resolve_log_limit(limit)?;
    tauri::async_runtime::spawn_blocking(move || log(&root, limit))
        .await
        .map_err(|error| format!("git log failed: {error}"))?
}

fn log(root: &str, limit: u32) -> Result<Vec<GitCommitEntry>, String> {
    let program = git_program()?;
    let argv = log_argv(limit);
    let args: Vec<&str> = argv.iter().map(String::as_str).collect();
    let output = run(&program, root, &args)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_not_a_repository(&stderr) || is_no_commits(&stderr) {
            return Ok(Vec::new());
        }
        return Err(operation_error("git log", &stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_git_log(&stdout))
}

/// Resolves and validates the requested limit.
pub fn resolve_log_limit(limit: Option<u32>) -> Result<u32, String> {
    match limit {
        None => Ok(DEFAULT_LOG_LIMIT),
        Some(0) => Err(format!("limit must be at least {MIN_LOG_LIMIT}")),
        Some(value) => Ok(value.min(MAX_LOG_LIMIT)),
    }
}

/// Builds the argv for `git log`.
pub fn log_argv(limit: u32) -> Vec<String> {
    vec![
        "log".to_string(),
        format!("--max-count={}", limit),
        "--pretty=format:%h%x09%s%x09%an%x09%ar".to_string(),
    ]
}

/// Parses the tab-separated output of `git log`.
pub fn parse_git_log(stdout: &str) -> Vec<GitCommitEntry> {
    let mut entries = Vec::new();
    for line in stdout.lines() {
        if line.is_empty() {
            continue;
        }
        let mut fields = line.split('\t');
        let hash = fields.next().unwrap_or("").to_string();
        let subject = fields.next().unwrap_or("").to_string();
        let author = fields.next().unwrap_or("").to_string();
        let when = fields.next().unwrap_or("").to_string();
        entries.push(GitCommitEntry {
            hash,
            subject,
            author,
            when,
        });
    }
    entries
}

fn is_no_commits(stderr: &str) -> bool {
    stderr.contains("does not have any commits")
}

// Aliases for callers/tests that use the other naming.
#[allow(dead_code)]
pub fn parse_log(stdout: &str) -> Vec<GitCommitEntry> {
    parse_git_log(stdout)
}

#[allow(dead_code)]
pub fn git_log_argv(limit: u32) -> Vec<String> {
    log_argv(limit)
}

#[allow(dead_code)]
pub fn clamp_log_limit(limit: Option<u32>) -> Result<u32, String> {
    resolve_log_limit(limit)
}

#[allow(dead_code)]
pub fn normalize_limit(limit: Option<u32>) -> Result<u32, String> {
    resolve_log_limit(limit)
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommitDiff {
    pub hash: String,
    pub diff: String,
    pub binary: bool,
}

/// Validates a commit hash: 4 to 40 hex characters. Prevents flag injection.
pub fn validate_commit_hash(hash: &str) -> Result<(), String> {
    if hash.len() < 4 || hash.len() > 40 {
        return Err("commit hash must be 4 to 40 hex characters".to_string());
    }
    if !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("commit hash must contain only hex characters [0-9a-fA-F]".to_string());
    }
    Ok(())
}

/// Builds the argv for `git show` of one commit.
pub fn commit_diff_argv(hash: &str) -> Vec<String> {
    vec![
        "show".to_string(),
        "--no-color".to_string(),
        "--unified=3".to_string(),
        "--format=".to_string(),
        hash.to_string(),
    ]
}

/// True when the output is a binary diff or has no text hunk.
pub fn is_binary_diff(output: &str) -> bool {
    if output.contains("Binary files") && output.contains("differ") {
        return true;
    }
    let has_hunk = output.lines().any(|line| line.starts_with("@@"));
    let has_pair = output.contains("---") && output.contains("+++");
    !(has_hunk || has_pair)
}

fn trim_trailing_blank_lines(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }
    let trimmed = text.trim_end_matches('\n');
    let mut out = trimmed.to_string();
    out.push('\n');
    out
}

/// Unified diff of one commit against its first parent.
#[tauri::command]
pub async fn git_commit_diff(root: String, hash: String) -> Result<CommitDiff, String> {
    validate_commit_hash(&hash)?;
    tauri::async_runtime::spawn_blocking(move || commit_diff(&root, &hash))
        .await
        .map_err(|error| format!("git show failed: {error}"))?
}

fn commit_diff(root: &str, hash: &str) -> Result<CommitDiff, String> {
    let program = git_program()?;
    let argv = commit_diff_argv(hash);
    let args: Vec<&str> = argv.iter().map(String::as_str).collect();
    let output = run(&program, root, &args)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_not_a_repository(&stderr) {
            return Err(format!("not a git repository: {root}"));
        }
        return Err(operation_error("git show", &stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let binary = is_binary_diff(&stdout);
    let diff = if binary {
        String::new()
    } else {
        trim_trailing_blank_lines(&stdout)
    };

    Ok(CommitDiff {
        hash: hash.to_string(),
        diff,
        binary,
    })
}
