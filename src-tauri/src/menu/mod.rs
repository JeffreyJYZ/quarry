use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter};

pub fn build_menu(app: &AppHandle) -> Result<tauri::menu::Menu<tauri::Wry>, tauri::Error> {
    let about = PredefinedMenuItem::about(app, Some("About quarry"), None)?;
    let check_updates = MenuItemBuilder::with_id("check-updates", "Check for updates…")
        .accelerator("")
        .build(app)?;
    let settings = MenuItemBuilder::with_id("open-settings", "Settings…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let services = PredefinedMenuItem::services(app, None)?;
    let hide = PredefinedMenuItem::hide(app, None)?;
    let hide_others = PredefinedMenuItem::hide_others(app, None)?;
    let show_all = PredefinedMenuItem::show_all(app, None)?;
    let quit = PredefinedMenuItem::quit(app, None)?;

    let app_sub = SubmenuBuilder::new(app, "quarry")
        .item(&about)
        .item(&check_updates)
        .separator()
        .item(&settings)
        .separator()
        .item(&services)
        .item(&hide)
        .item(&hide_others)
        .item(&show_all)
        .separator()
        .item(&quit)
        .build()?;

    // File
    let new_project = MenuItemBuilder::with_id("new-project", "New project…")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let open_project = MenuItemBuilder::with_id("open-project", "Open project…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let save = MenuItemBuilder::with_id("save", "Save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let save_all = MenuItemBuilder::with_id("save-all", "Save all")
        .accelerator("CmdOrCtrl+Alt+S")
        .build(app)?;
    let close_window = PredefinedMenuItem::close_window(app, None)?;

    let file_sub = SubmenuBuilder::new(app, "File")
        .item(&new_project)
        .item(&open_project)
        .separator()
        .item(&save)
        .item(&save_all)
        .separator()
        .item(&close_window)
        .build()?;

    // Edit
    let undo = PredefinedMenuItem::undo(app, None)?;
    let redo = PredefinedMenuItem::redo(app, None)?;
    let cut = PredefinedMenuItem::cut(app, None)?;
    let copy = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    let select_all = PredefinedMenuItem::select_all(app, None)?;
    let find_in_project = MenuItemBuilder::with_id("find-in-project", "Find in project")
        .accelerator("CmdOrCtrl+Alt+F")
        .build(app)?;

    let edit_sub = SubmenuBuilder::new(app, "Edit")
        .item(&undo)
        .item(&redo)
        .separator()
        .item(&cut)
        .item(&copy)
        .item(&paste)
        .item(&select_all)
        .separator()
        .item(&find_in_project)
        .build()?;

    // View
    let quick_open = MenuItemBuilder::with_id("quick-open", "Command palette")
        .accelerator("CmdOrCtrl+P")
        .build(app)?;
    let toggle_rail = MenuItemBuilder::with_id("toggle-rail", "Toggle rail")
        .accelerator("CmdOrCtrl+B")
        .build(app)?;
    let toggle_dock = MenuItemBuilder::with_id("toggle-dock", "Toggle panel")
        .accelerator("CmdOrCtrl+J")
        .build(app)?;
    let toggle_terminal =
        MenuItemBuilder::with_id("toggle-terminal", "Toggle terminal").build(app)?;
    let toggle_source_control =
        MenuItemBuilder::with_id("toggle-source-control", "Toggle source control").build(app)?;
    let toggle_debug = MenuItemBuilder::with_id("toggle-debug", "Toggle debug panel").build(app)?;
    let toggle_blame = MenuItemBuilder::with_id("toggle-blame", "Toggle blame").build(app)?;
    let show_shortcuts = MenuItemBuilder::with_id("show-shortcuts", "Show shortcuts")
        .accelerator("CmdOrCtrl+K")
        .build(app)?;

    let view_sub = SubmenuBuilder::new(app, "View")
        .item(&quick_open)
        .item(&toggle_rail)
        .item(&toggle_dock)
        .item(&toggle_terminal)
        .separator()
        .item(&toggle_source_control)
        .item(&toggle_debug)
        .item(&toggle_blame)
        .separator()
        .item(&show_shortcuts)
        .build()?;

    // Run
    let build = MenuItemBuilder::with_id("build", "Build").build(app)?;
    let run = MenuItemBuilder::with_id("run", "Run").build(app)?;
    let stop_run = MenuItemBuilder::with_id("stop-run", "Stop").build(app)?;
    let run_to_cursor = MenuItemBuilder::with_id("run-to-cursor", "Run to cursor")
        .accelerator("CmdOrCtrl+F10")
        .build(app)?;

    let run_sub = SubmenuBuilder::new(app, "Run")
        .item(&build)
        .item(&run)
        .item(&stop_run)
        .item(&run_to_cursor)
        .build()?;

    // Git
    let refresh_git = MenuItemBuilder::with_id("refresh-git", "Refresh").build(app)?;
    let git_sub = SubmenuBuilder::new(app, "Git")
        .item(&refresh_git)
        .item(&toggle_blame)
        .build()?;

    // Window
    let minimize = PredefinedMenuItem::minimize(app, None)?;
    let zoom = PredefinedMenuItem::maximize(app, None)?;
    let reveal_active_file =
        MenuItemBuilder::with_id("reveal-active-file", "Reveal active file in explorer")
            .accelerator("CmdOrCtrl+Shift+E")
            .build(app)?;

    let window_sub = SubmenuBuilder::new(app, "Window")
        .item(&minimize)
        .item(&zoom)
        .separator()
        .item(&reveal_active_file)
        .build()?;

    // Help
    let help_sub = SubmenuBuilder::new(app, "Help")
        .item(&show_shortcuts)
        .item(&check_updates)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_sub)
        .item(&file_sub)
        .item(&edit_sub)
        .item(&view_sub)
        .item(&run_sub)
        .item(&git_sub)
        .item(&window_sub)
        .item(&help_sub)
        .build()
}

pub fn on_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id().0.as_str();
    let custom = [
        "check-updates",
        "open-settings",
        "new-project",
        "open-project",
        "save",
        "save-all",
        "find-in-project",
        "quick-open",
        "toggle-rail",
        "toggle-dock",
        "toggle-terminal",
        "toggle-source-control",
        "toggle-debug",
        "toggle-blame",
        "show-shortcuts",
        "build",
        "run",
        "stop-run",
        "run-to-cursor",
        "refresh-git",
        "reveal-active-file",
    ];
    if custom.contains(&id) {
        let _ = app.emit("menu-command", id.to_string());
    }
}
