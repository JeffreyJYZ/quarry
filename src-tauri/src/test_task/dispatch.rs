//! The dock's two test commands: one discovery pass and one single-test run.
//!
//! Discovery asks every suite the project can have: Cargo for a Cargo project, and GoogleTest for a
//! project whose presets name a test binary. One source failing becomes a sentence in `notes`, so a
//! C++ project with no configured program is told exactly that instead of being shown an empty list.
//!
//! A run routes on the name's shape: `Suite.Case` is a gtest case (Rust names never hold a dot) and
//! everything else is a Cargo test, so the dock keeps one run button for both.

#![allow(unused_imports)]

use super::*;

#[tauri::command]
pub async fn list_tests(root: String) -> Result<TestDiscovery, String> {
    tauri::async_runtime::spawn_blocking(move || list(&root))
        .await
        .map_err(|error| format!("test discovery task failed: {error}"))?
}

#[tauri::command]
pub async fn run_test(root: String, name: String) -> Result<TestReport, String> {
    tauri::async_runtime::spawn_blocking(move || run(&root, &name))
        .await
        .map_err(|error| format!("test run task failed: {error}"))?
}

/// Every test the project offers, with a sentence per source that could not be read.
pub fn list(root: &str) -> Result<TestDiscovery, String> {
    let info = project::inspect(root)?;
    let mut discovery = TestDiscovery::default();

    if info.kind == ProjectKind::Cargo {
        match default_cargo::list(&info) {
            Ok(items) => discovery.items.extend(items),
            Err(error) => discovery.notes.push(error),
        }
    }

    if gtest::should_probe(&info) {
        match gtest::list_gtest(&info) {
            Ok(found) => {
                discovery.program = Some(found.program);
                discovery.items.extend(found.items);
                if let Some(note) = found.note {
                    discovery.notes.push(note);
                }
            }
            Err(error) => discovery.notes.push(error),
        }
    }

    Ok(discovery)
}

/// Runs one test; the report is the same shape whichever suite answered.
pub fn run(root: &str, name: &str) -> Result<TestReport, String> {
    let info = project::inspect(root)?;
    if gtest::looks_like_gtest(name) {
        return gtest::run_gtest(&info, name);
    }
    default_cargo::run_for(&info, name)
}
