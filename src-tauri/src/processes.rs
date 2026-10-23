//! Running-process discovery for the attach picker.
//!
//! The list is deliberately unfiltered: it includes processes owned by other users and by the
//! system, because the caller (the debug-attach UI) decides which entries are usable. Filtering
//! here would hide a target the user legitimately wants to attach to.

use std::process::Command;

use serde::Serialize;

use crate::resolve;

/// Hard cap on the number of entries returned, so a huge process table cannot balloon memory.
const MAX_ENTRIES: usize = 500;

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
#[tauri::command]
pub async fn list_processes() -> Result<Vec<ProcessInfo>, String> {
    let ps = resolve::resolve("ps").ok_or_else(|| "ps not found".to_string())?;
    let output = Command::new(&ps.path)
        .args(["-axo", "pid=,comm="])
        .output()
        .map_err(|error| format!("cannot run ps: {error}"))?;

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
mod tests {
    use super::*;

    #[test]
    fn parses_fixture_with_duplicates_blank_and_spaces() {
        let input = "  1 /sbin/launchd\n\
			2 /System/Library/Frameworks/.../kernel_task\n\
			\n\
			42 /Applications/My App/bin/tool\n\
			42 /Applications/My App/bin/tool\n\
			99 ps\n\
			0 /kernel\n";
        let parsed = parse_process_list(input);
        let names: Vec<&str> = parsed.iter().map(|p| p.name.as_str()).collect();
        assert!(names.contains(&"launchd"));
        assert!(names.contains(&"tool"));
        // duplicate pid dropped
        assert_eq!(parsed.iter().filter(|p| p.pid == 42).count(), 1);
        // blank line ignored, pid 0 dropped, ps dropped
        assert!(!parsed.iter().any(|p| p.pid == 0));
        assert!(!parsed.iter().any(|p| p.name == "ps"));
        // command with spaces keeps full command path then basename
        let tool = parsed.iter().find(|p| p.pid == 42).unwrap();
        assert_eq!(tool.name, "tool");
    }

    #[test]
    fn sorts_case_insensitively() {
        let input = "10 /z/Zed\n5 /a/alpha\n7 /m/Mid\n";
        let parsed = parse_process_list(input);
        let names: Vec<&str> = parsed.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, vec!["alpha", "Mid", "Zed"]);
    }

    #[test]
    fn caps_at_500() {
        let mut input = String::new();
        for i in 1..=600u32 {
            input.push_str(&format!("{i} /bin/tool{i}\n"));
        }
        let parsed = parse_process_list(&input);
        assert_eq!(parsed.len(), 500);
    }
}
