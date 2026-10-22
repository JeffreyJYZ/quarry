mod build_task;
mod lsp;
mod project;
mod protocol_pipe;
mod toolchain;
mod types;
mod workspace;

#[tauri::command]
fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(lsp::LspState::default())
        .invoke_handler(tauri::generate_handler![
            version,
            toolchain::toolchains,
            project::open_project,
            workspace::list_dir,
            workspace::read_text_file,
            lsp::start_lsp,
            lsp::stop_lsp,
            lsp::lsp_open_document,
            lsp::lsp_change_document,
            lsp::lsp_close_document,
            build_task::build_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
