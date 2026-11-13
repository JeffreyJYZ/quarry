#![allow(unused_imports)]

pub use std::collections::{HashMap, HashSet};
pub use std::path::{Path, PathBuf};

use super::*;

/// Flags a plain-clang build reuses from the project's database.
///
/// Only what decides whether a source compiles at all: include and framework directories, defines,
/// a sysroot or target, and the language standard. Dependency, optimisation and warning flags are
/// the build's own business, and a `-Werror` copied from the database would fail a build the project
/// itself only fails with the flags it actually passes.
pub fn database_flags(database: &Path, cxx: bool) -> Vec<String> {
    flags_from_entries(&read_entries(database), cxx)
}

/// The curated flags of a set of entries, deduplicated and in first-seen order.
///
/// A define or undefine whose text differs between translation units is dropped: the plain build
/// compiles every source in one invocation, so it cannot honour both, and picking one would compile
/// half the project against a value its own build never used.
pub fn flags_from_entries(entries: &[CompileEntry], cxx: bool) -> Vec<String> {
    let mut paths: Vec<String> = Vec::new();
    let mut toolchain: Vec<String> = Vec::new();
    let mut defines = Defines::default();
    let mut standard: Option<String> = None;
    let mut seen: HashSet<String> = HashSet::new();

    for entry in entries {
        let argv = &entry.argv;
        let mut index = 1;
        while index < argv.len() {
            let token = argv[index].as_str();
            let value = argv.get(index + 1).map(String::as_str);

            if let Some((flag, consumed)) = take_search_path(token, value, entry) {
                push_unique(&mut paths, flag, &mut seen);
                index += if consumed { 2 } else { 1 };
                continue;
            }
            if let Some((text, consumed)) = take_define(token, value) {
                defines.add(text);
                index += consumed;
                continue;
            }
            if let Some((text, consumed)) = take_toolchain(token, value, entry) {
                push_unique(&mut toolchain, text, &mut seen);
                index += consumed;
                continue;
            }
            if standard.is_none()
                && let Some(found) = token.strip_prefix("-std=")
                && found.contains("++") == cxx
            {
                standard = Some(token.to_string());
            }
            index += 1;
        }
    }

    let mut flags = paths;
    flags.extend(defines.into_flags());
    flags.extend(toolchain);
    flags.extend(standard);
    flags
}

/// Include, system-include, quote and framework directories, joined and resolved against the
/// directory the command ran in. The flag reports whether it consumed the following argv slot.
fn take_search_path(
    token: &str,
    value: Option<&str>,
    entry: &CompileEntry,
) -> Option<(String, bool)> {
    const SEPARATE: [&str; 5] = ["-I", "-isystem", "-iquote", "-F", "-iframework"];
    if SEPARATE.contains(&token) {
        let dir = absolute(entry, value?);
        return Some((format!("{token}{dir}"), true));
    }
    for prefix in ["-isystem", "-iquote", "-iframework", "-I", "-F"] {
        if let Some(dir) = token.strip_prefix(prefix)
            && !dir.is_empty()
        {
            return Some((format!("{prefix}{}", absolute(entry, dir)), false));
        }
    }
    None
}

/// A `-D`/`-U` pair, reported as the text to record and how many argv slots it took.
fn take_define(token: &str, value: Option<&str>) -> Option<(String, usize)> {
    if token == "-D" || token == "-U" {
        return value.map(|text| (format!("{token}{text}"), 2));
    }
    let text = token
        .strip_prefix("-D")
        .or_else(|| token.strip_prefix("-U"))?;
    if text.is_empty() {
        return None;
    }
    Some((token.to_string(), 1))
}

/// A sysroot or target, which decides where system headers are searched.
///
/// A sysroot is a directory and resolves against the command's working directory; a `-target` is a
/// triple such as `arm64-apple-macos` and must be passed through untouched.
fn take_toolchain(
    token: &str,
    value: Option<&str>,
    entry: &CompileEntry,
) -> Option<(String, usize)> {
    const DIRECTORIES: [&str; 2] = ["-isysroot", "--sysroot"];
    const TRIPLES: [&str; 2] = ["-target", "--target"];

    if DIRECTORIES.contains(&token) {
        return Some((format!("{token}{}", absolute(entry, value?)), 2));
    }
    if TRIPLES.contains(&token) {
        return Some((format!("{token}{}", value?), 2));
    }
    for prefix in ["--sysroot=", "-target=", "--target="] {
        if let Some(rest) = token.strip_prefix(prefix)
            && !rest.is_empty()
        {
            let value = if prefix.starts_with("--sysroot") {
                absolute(entry, rest)
            } else {
                rest.to_string()
            };
            return Some((format!("{prefix}{value}"), 1));
        }
    }
    None
}

/// Resolve a directory argument against the entry's own working directory.
pub fn absolute(entry: &CompileEntry, value: &str) -> String {
    let path = Path::new(value);
    if path.is_absolute() {
        return value.to_string();
    }
    entry.directory.join(path).display().to_string()
}

fn push_unique(into: &mut Vec<String>, value: String, seen: &mut HashSet<String>) {
    if seen.insert(value.clone()) {
        into.push(value);
    }
}

/// Defines and undefines, keyed by macro name so two different values for one name cancel out.
#[derive(Default)]
struct Defines {
    order: Vec<String>,
    values: HashMap<String, Option<String>>,
}

impl Defines {
    fn add(&mut self, text: String) {
        let name = text
            .trim_start_matches("-D")
            .trim_start_matches("-U")
            .split('=')
            .next()
            .unwrap_or_default()
            .to_string();
        if name.is_empty() {
            return;
        }
        match self.values.get(&name) {
            None => {
                self.values.insert(name.clone(), Some(text));
                self.order.push(name);
            }
            Some(Some(existing)) if *existing != text => {
                self.values.insert(name, None);
            }
            _ => {}
        }
    }

    fn into_flags(self) -> Vec<String> {
        self.order
            .into_iter()
            .filter_map(|name| self.values.get(&name).cloned().flatten())
            .collect()
    }
}
