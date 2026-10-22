//! Test discovery and single-test runs.
//!
//! Unit U21 owns the body of this file. Contract: list tests with `cargo test -- --list` and run one
//! named test, returning its output. Never build the whole workspace for a list, never hang: both
//! commands have a hard timeout.

use crate::types::{TestItem, TestReport};

#[tauri::command]
pub async fn list_tests(_root: String) -> Result<Vec<TestItem>, String> {
    // STUB: U21 replaces this.
    Err("test discovery is not implemented yet".to_string())
}

#[tauri::command]
pub async fn run_test(_root: String, _name: String) -> Result<TestReport, String> {
    // STUB: U21 replaces this.
    Err("running a test is not implemented yet".to_string())
}
