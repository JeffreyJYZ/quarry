#![allow(unused_imports)]

pub(crate) use crate::resolve;
pub(crate) use crate::types::{GitFileDiff, GitStatus, GitStatusEntry};
pub use serde::Serialize;
pub use std::fs;
pub use std::path::Path;
pub use std::process::Command;

use super::*;

/// Joins a root-relative path onto the root, for the frontend.
pub fn absolute_path(root: &str, relative: &str) -> String {
    Path::new(root)
        .join(relative)
        .to_string_lossy()
        .into_owned()
}
/// The path git should see: relative to the root when the caller gave an absolute one.
pub fn relative_path(root: &str, path: &str) -> String {
    let root_path = Path::new(root);
    let given = Path::new(path);
    if given.is_absolute()
        && let Ok(stripped) = given.strip_prefix(root_path)
    {
        let relative = stripped.to_string_lossy().replace('\\', "/");
        if !relative.is_empty() {
            return relative;
        }
    }
    path.replace('\\', "/")
}

/// True when git says the directory is not a repository.
pub fn is_not_a_repository(stderr: &str) -> bool {
    stderr.contains("not a git repository")
}

/// The first stderr line, truncated for the error message.
pub fn operation_error(operation: &str, stderr: &str) -> String {
    let line = stderr
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("failed");
    format!("{operation} failed: {}", truncate(line, ERROR_LIMIT))
}

pub fn truncate(text: &str, limit: usize) -> String {
    text.chars().take(limit).collect()
}

/// True when the diff carries at least one hunk, which is what makes it a text diff.
pub fn has_hunk(diff: &str) -> bool {
    diff.lines().any(|line| line.starts_with("@@"))
}

/// True when git does not track the path.
pub fn is_untracked(program: &str, root: &str, relative: &str) -> bool {
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
pub fn read_file(root: &str, relative: &str) -> Result<String, String> {
    let path = Path::new(root).join(relative);
    fs::read_to_string(&path)
        .map_err(|error| format!("git diff failed: cannot read {path:?}: {error}"))
}

/// Builds the diff of an untracked file: its whole content as one added hunk.
pub fn untracked_diff(path: &str, content: &str) -> String {
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
pub fn run(program: &str, root: &str, args: &[&str]) -> Result<std::process::Output, String> {
    Command::new(program)
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|error| format!("cannot run {program} in {root}: {error}"))
}

/// FNV-1a 32-bit hash, matching the frontend hunk id derivation.
pub fn hunk_id(header: &str, body: &[&str]) -> String {
    let mut h: u32 = 0x811c9dc5;
    let text = format!("{}\n{}", header, body.join("\n"));
    for byte in text.bytes() {
        h ^= byte as u32;
        h = h.wrapping_mul(0x01000193);
    }
    format!("{:08x}", h)
}
