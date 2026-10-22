//! Git status and per-file diffs through the `git` binary.
//!
//! Unit owns the body of this file. Contract: never link libgit2, never run a mutating command, and
//! parse porcelain output rather than locale-dependent human output.
//!
//! Every read-only command runs off the async runtime on a blocking thread. A directory that is
//! not a repository is not an error: the status comes back empty so the UI can hide the panel.

use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;

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
    if let Some(found) = find_on_path(GIT_PROGRAM) {
        return Ok(found);
    }
    if let Some(found) = find_with_xcrun(GIT_PROGRAM) {
        return Ok(found);
    }
    Err(format!(
        "{GIT_PROGRAM} is not installed: it is not on PATH and xcrun cannot find it"
    ))
}

/// Walk `PATH` by hand rather than shelling out.
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

/// Ask `xcrun` for the tool's path; a failure only means "not found".
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
}
