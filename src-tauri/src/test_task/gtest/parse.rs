#![allow(unused_imports)]

/// One `--gtest_list_tests` entry: the suite and the case inside it.
pub type SuiteCase = (String, String);

/// A gtest case name is `Suite.Case`; a Cargo test name is a Rust path and never holds a dot.
pub fn looks_like_gtest(name: &str) -> bool {
    !name.contains("::") && name.contains('.')
}

/// Parses `--gtest_list_tests` output into suite/case pairs.
///
/// A suite line carries no indentation and ends in `.`, optionally followed by gtest's own comment
/// (`Typed/0.  # TypeParam = int`); every non-empty indented line after it is a case of that suite.
/// Everything else — the `Running main() from …` banner, a blank line — is skipped, and a case
/// before any suite is dropped rather than attributed to one.
pub fn parse_list(merged: &str) -> Vec<SuiteCase> {
    let mut suite: Option<String> = None;
    let mut cases = Vec::new();
    for line in merged.lines() {
        let line = line.trim_end_matches('\r');
        if line.trim().is_empty() {
            continue;
        }
        let indented = line.starts_with(' ') || line.starts_with('\t');
        let text = line.trim();
        if !indented {
            let head = text.split("  #").next().unwrap_or(text).trim_end();
            suite = head
                .strip_suffix('.')
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .map(str::to_string);
            continue;
        }
        let Some(suite) = suite.as_ref() else {
            continue;
        };
        if text.starts_with('#') || text.contains(char::is_whitespace) {
            continue;
        }
        cases.push((suite.clone(), text.to_string()));
    }
    cases
}

/// `Suite.Case`, the name the frontend and the filter both carry.
pub fn full_name(suite: &str, case: &str) -> String {
    format!("{suite}.{case}")
}

/// Splits a gtest name back into its suite and case, or nothing when it holds no dot.
pub fn split_name(name: &str) -> Option<(&str, &str)> {
    let (suite, case) = name.split_once('.')?;
    if suite.is_empty() || case.is_empty() {
        return None;
    }
    Some((suite, case))
}
