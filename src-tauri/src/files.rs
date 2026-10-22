//! Fast file listing for quick-open.
//!
//! Contract: list project files once, honour the same ignore set as search, and never walk into
//! `target`, `node_modules`, `.git` or `.quarry`.

/// Cap on returned files; the UI filters what it receives.
pub const MAX_FILES: usize = 20_000;

#[tauri::command]
pub async fn list_files(_root: String) -> Result<Vec<String>, String> {
    // STUB: replaced by the file-listing unit.
    Err("file listing is not implemented yet".to_string())
}
