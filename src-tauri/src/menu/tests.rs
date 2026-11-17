//! Pins the File ▸ New Window row to its id and chord.
//!
//! The menu itself needs a running app, so these read the source the way the frontend's
//! `shortcuts.test.ts` does: the row's id, its accelerator, and the fact that it is handled in Rust
//! rather than forwarded are three facts no runtime test here can see.

/// The menu source, read where cargo runs the test.
fn source(file: &str) -> String {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("src/menu")
        .join(file);
    std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("cannot read {}: {error}", path.display()))
}

#[test]
fn the_file_menu_declares_new_window_with_its_chord() {
    let menu = source("mod.rs");

    let row = menu
        .split("with_id(\"new-window\"")
        .nth(1)
        .expect("the File menu should declare a new-window row")
        .split(".build(app)?")
        .next()
        .expect("the row should be built");

    assert!(
        row.contains("CmdOrCtrl+Shift+N"),
        "New Window should answer to CmdOrCtrl+Shift+N"
    );
    assert!(
        menu.contains(".item(&new_window)"),
        "the row should be added to a submenu, not merely built"
    );
}

#[test]
fn new_window_is_handled_in_rust_and_not_forwarded() {
    let events = source("events.rs");

    assert!(
        events.contains("id == \"new-window\""),
        "the row should be matched in the event handler"
    );
    assert!(
        events.contains("windows::new_window"),
        "the handler should create the window itself"
    );

    // A forwarded id would travel to whichever webview holds focus, which is exactly what window
    // creation must survive; the id must not appear in the forwarded table.
    let forwarded = events
        .split("const FORWARDED")
        .nth(1)
        .and_then(|rest| rest.split(']').next())
        .expect("the forwarded table should exist");
    assert!(
        !forwarded.contains("\"new-window\""),
        "new-window must not be forwarded to the frontend"
    );
}
