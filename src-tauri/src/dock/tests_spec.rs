//! Dock menu tests: the pure selector decisions, plus the invariant that the wrapper never
//! claims to handle a selector it does not implement.

use crate::dock::spec::{
    DOCK_MENU_SELECTOR, FORWARDING_TARGET_SELECTOR, MenuSpec, NEW_WINDOW_SELECTOR, OWN_SELECTORS,
    RESPONDS_TO_SELECTOR, is_own_selector, menu_spec, should_forward,
};

#[test]
fn menu_offers_new_window() {
    let spec: MenuSpec = menu_spec();
    assert_eq!(spec.title, "New Window");
    assert_eq!(spec.action, NEW_WINDOW_SELECTOR);
}

#[test]
fn own_selectors_are_exactly_the_wrapper_implementations() {
    assert_eq!(
        OWN_SELECTORS,
        [
            DOCK_MENU_SELECTOR,
            NEW_WINDOW_SELECTOR,
            RESPONDS_TO_SELECTOR,
            FORWARDING_TARGET_SELECTOR,
        ]
    );
}

#[test]
fn own_selectors_never_forward() {
    for selector in OWN_SELECTORS {
        assert!(is_own_selector(selector), "{selector} should be ours");
        assert!(
            !should_forward(selector, true),
            "{selector} must not forward"
        );
        assert!(
            !should_forward(selector, false),
            "{selector} must not forward"
        );
    }
}

#[test]
fn a_selector_the_wrapper_lacks_goes_to_the_previous_delegate() {
    // tao's own hooks, which window and quit behaviour depends on.
    for selector in [
        "applicationWillFinishLaunching:",
        "applicationShouldTerminateAfterLastWindowClosed:",
        "applicationShouldHandleReopen:hasVisibleWindows:",
    ] {
        assert!(!is_own_selector(selector));
        assert!(should_forward(selector, true), "{selector} should forward");
    }
}

#[test]
fn nothing_forwards_to_a_delegate_that_cannot_answer() {
    // `forwardingTargetForSelector:` must never make an unanswerable selector look handled.
    assert!(!should_forward("someSelectorNobodyImplements:", false));
    assert!(!should_forward("", false));
}
