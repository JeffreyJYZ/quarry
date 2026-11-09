//! Running-process discovery for the attach picker.
//!
//! The list is deliberately unfiltered: it includes processes owned by other users and by the
//! system, because the caller (the debug-attach UI) decides which entries are usable. Filtering
//! here would hide a target the user legitimately wants to attach to.

use std::path::Path;
use std::process::Command;
use std::time::Duration;

use serde::Serialize;

use crate::git::output_within;
use crate::resolve;

/// Hard cap on the number of entries returned, so a huge process table cannot balloon memory.
const MAX_ENTRIES: usize = 500;

/// Longest one `ps` invocation may run before it is killed and the command fails.
///
/// A healthy `ps -axo` answers in milliseconds even on a loaded machine, so tripping this means the
/// scan itself is wedged; the picker then shows the error instead of spinning forever.
const PS_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
}

/// Parse `ps -axo pid=,comm=` output into a deduplicated, sorted, capped list.
pub fn parse_process_list(output: &str) -> Vec<ProcessInfo> {
    let mut entries: Vec<ProcessInfo> = Vec::new();
    let mut seen: std::collections::HashSet<u32> = std::collections::HashSet::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let mut parts = line.splitn(2, char::is_whitespace);
        let pid_str = match parts.next() {
            Some(value) => value.trim(),
            None => continue,
        };
        let command = match parts.next() {
            Some(value) => value.trim(),
            None => continue,
        };

        let Ok(pid) = pid_str.parse::<u32>() else {
            continue;
        };

        if pid == 0 {
            continue;
        }
        if command.is_empty() {
            continue;
        }
        // Only entries whose command looks like an executable path.
        if !command.contains('/') {
            continue;
        }
        let name = command.rsplit('/').next().unwrap_or("").to_string();
        if name.is_empty() {
            continue;
        }
        // Drop the ps process itself.
        if name == "ps" {
            continue;
        }

        if !seen.insert(pid) {
            continue;
        }

        entries.push(ProcessInfo { pid, name });
    }

    entries.sort_by_key(|a| a.name.to_lowercase());
    if entries.len() > MAX_ENTRIES {
        entries.truncate(MAX_ENTRIES);
    }
    entries
}

/// Enumerate the running processes.
///
/// The whole scan — the `ps` probe, the spawn and the capture — runs on the blocking pool: a slow
/// process table must not pin an async worker for the length of the scan.
#[tauri::command]
pub async fn list_processes() -> Result<Vec<ProcessInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let ps = resolve::resolve("ps").ok_or_else(|| "ps not found".to_string())?;
        scan(&ps.path, PS_TIMEOUT)
    })
    .await
    .map_err(|error| format!("cannot list processes: {error}"))?
}

/// Run `program` with `ps`'s arguments within `limit`, and parse its output.
fn scan(program: &Path, limit: Duration) -> Result<Vec<ProcessInfo>, String> {
    let mut command = Command::new(program);
    command.args(["-axo", "pid=,comm="]);
    let output = output_within(&mut command, limit)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let first = stderr.lines().next().unwrap_or("").trim();
        return Err(if first.is_empty() {
            format!("ps exited with status {}", output.status)
        } else {
            first.to_string()
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_process_list(&stdout))
}

#[cfg(test)]
mod tests_1;
