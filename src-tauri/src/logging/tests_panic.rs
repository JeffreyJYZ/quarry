//! The panic report's shape, and the order that makes it survive: write, then the default hook.

use std::cell::RefCell;

use super::panic_hook;

#[test]
fn a_report_names_the_panic_and_where_it_happened() {
    let text = panic_hook::format_report("assertion failed", Some("src/main.rs:12:5"), None);
    assert_eq!(text, "panic at src/main.rs:12:5: assertion failed");
}

#[test]
fn a_report_without_a_location_still_says_what_failed() {
    let text = panic_hook::format_report("boom", None, None);
    assert_eq!(text, "panic: boom");
}

#[test]
fn a_backtrace_rides_under_the_message_when_one_was_captured() {
    let text =
        panic_hook::format_report("boom", Some("src/a.rs:1:1"), Some("0: frame\n1: caller\n"));
    assert!(text.starts_with("panic at src/a.rs:1:1: boom"));
    assert!(text.contains("\nbacktrace:\n0: frame\n1: caller"));
}

#[test]
fn the_hook_writes_before_it_hands_over_to_the_default_hook() {
    // The process hook is global, so recording the order through `run_hook` proves the installed
    // hook's sequence without racing every other test in the binary.
    let order = RefCell::new(Vec::new());
    panic_hook::run_hook(
        "panic: boom",
        &mut |text| {
            assert_eq!(text, "panic: boom");
            order.borrow_mut().push("log");
        },
        &mut || order.borrow_mut().push("default"),
    );
    assert_eq!(*order.borrow(), vec!["log", "default"]);
}
