mod build_task;
mod dap;
mod format;
mod git;
mod launch;
mod lsp;
mod project;
mod pty;
mod protocol_pipe;
mod resolve;
mod run_config;
mod run_task;
mod search;
mod settings;
mod test_task;
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
        .manage(dap::DapState::default())
        .manage(run_task::RunState::default())
        .manage(pty::PtyState::default())
        .invoke_handler(tauri::generate_handler![
            version,
            toolchain::toolchains,
            project::open_project,
            workspace::list_dir,
            workspace::read_text_file,
            workspace::write_text_file,
            lsp::start_lsp,
            lsp::stop_lsp,
            lsp::lsp_open_document,
            lsp::lsp_change_document,
            lsp::lsp_close_document,
            lsp::lsp_hover,
            lsp::lsp_definition,
            lsp::lsp_references,
            lsp::lsp_completion,
            lsp::lsp_symbols,
            lsp::lsp_rename,
            lsp::lsp_code_actions,
            lsp::lsp_signature_help,
            lsp::lsp_inlay_hints,
            lsp::lsp_call_hierarchy_prepare,
            lsp::lsp_call_hierarchy_calls,
            build_task::build_project,
            format::format_document,
            format::formatter_for,
            search::search_project,
            dap::dap_launch,
            dap::dap_attach,
            dap::dap_configuration_done,
            dap::dap_set_breakpoints,
            dap::dap_set_breakpoints_ex,
            dap::dap_continue,
            dap::dap_step,
            dap::dap_threads,
            dap::dap_stack_trace,
            dap::dap_scopes,
            dap::dap_variables,
            dap::dap_set_variable,
            dap::dap_read_memory,
            dap::dap_write_memory,
            dap::dap_disassemble,
            dap::dap_data_breakpoint_info,
            dap::dap_set_data_breakpoints,
            dap::dap_stop,
            dap::dap_restart,
            run_config::read_launch_config,
            run_config::write_launch_config,
            run_config::resolve_launch_config,
            run_task::run_program,
            run_task::stop_program,
            launch::default_launch_config,
            test_task::list_tests,
            test_task::run_test,
            settings::read_settings,
            settings::write_settings,
            git::git_status,
            git::git_file_diff,
            git::git_stage,
            git::git_unstage,
            git::git_commit,
            pty::pty_open,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_close
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
