//! Build runner and compiler diagnostics.
//!
//! Unit U7 owns the body of this file. Contract: run the project's build, parse machine-readable
//! diagnostics into `Diagnostic`, and return a `BuildReport`. Cargo only in this slice — anything else
//! returns an honest error. Never run the program, never write into the source tree.

use crate::types::BuildReport;

/// `profile` is `debug` or `release`.
#[tauri::command]
pub async fn build_project(_root: String, _profile: String) -> Result<BuildReport, String> {
    // STUB: U7 replaces this.
    Err("build is not implemented yet".to_string())
}
