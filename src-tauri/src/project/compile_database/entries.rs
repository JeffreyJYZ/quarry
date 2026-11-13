#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use serde_json::Value;

use super::*;

/// One translation unit as the database records it.
#[derive(Debug, Clone, Default)]
pub struct CompileEntry {
    /// Directory the command ran in, so a relative argument can be resolved.
    pub directory: PathBuf,
    /// The full command line, program first.
    pub argv: Vec<String>,
}

/// Every entry a database holds, or nothing when it is missing or not a JSON array.
///
/// A malformed database is a project without flags, never an error the analyser or the build has to
/// report: both have a working path without it.
pub fn read_entries(database: &Path) -> Vec<CompileEntry> {
    let Ok(text) = fs::read_to_string(database) else {
        return Vec::new();
    };
    let Ok(Value::Array(items)) = serde_json::from_str::<Value>(&text) else {
        return Vec::new();
    };
    items.iter().filter_map(read_entry).collect()
}

/// One object of the array, preferring `arguments` over `command` where both are present.
fn read_entry(item: &Value) -> Option<CompileEntry> {
    let argv = match item.get("arguments").and_then(Value::as_array) {
        Some(arguments) => arguments
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect(),
        None => split_command(item.get("command").and_then(Value::as_str)?),
    };
    if argv.is_empty() {
        return None;
    }
    Some(CompileEntry {
        directory: item
            .get("directory")
            .and_then(Value::as_str)
            .map(PathBuf::from)
            .unwrap_or_default(),
        argv,
    })
}

/// Split a `command` string the way a shell would, without running one.
///
/// CMake quotes an argument that holds a space, so quotes are dropped and their contents kept whole;
/// a backslash escapes the next character outside single quotes.
pub fn split_command(command: &str) -> Vec<String> {
    let mut argv: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut started = false;
    let mut quote: Option<char> = None;
    let mut chars = command.chars();

    while let Some(character) = chars.next() {
        match character {
            '\'' | '"' if quote.is_none() => {
                quote = Some(character);
                started = true;
            }
            c if Some(c) == quote => quote = None,
            '\\' if quote != Some('\'') => {
                if let Some(escaped) = chars.next() {
                    current.push(escaped);
                    started = true;
                }
            }
            c if c.is_whitespace() && quote.is_none() => {
                if started {
                    argv.push(std::mem::take(&mut current));
                    started = false;
                }
            }
            c => {
                current.push(c);
                started = true;
            }
        }
    }
    if started {
        argv.push(current);
    }
    argv
}
