//! The parts of the Dock menu that need no AppKit: the item's title and selector, and the
//! selector decisions the forwarding delegate makes.
//!
//! Keeping these as plain functions is what makes the wrapper reviewable without a GUI — see
//! `tests_spec.rs` for the assertions, and `macos/` for the calls that use them.

/// What the Dock menu offers. One item today; a growth point, not an abstraction for its own sake.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MenuSpec {
    /// Shown in the Dock menu.
    pub title: &'static str,
    /// The Objective-C selector the item sends to the delegate.
    pub action: &'static str,
}

/// The Dock menu's contents.
///
/// No key equivalent: a Dock menu is a menu of the icon, not of the app, so AppKit shows no
/// shortcut column there and a value would only be dead text.
pub fn menu_spec() -> MenuSpec {
    MenuSpec {
        title: "New Window",
        action: NEW_WINDOW_SELECTOR,
    }
}

/// The action sent when **New Window** is chosen.
pub const NEW_WINDOW_SELECTOR: &str = "newWindow:";

/// The delegate callback AppKit uses to build the Dock menu.
pub const DOCK_MENU_SELECTOR: &str = "applicationDockMenu:";

/// The wrapper's own `respondsToSelector:` override.
pub const RESPONDS_TO_SELECTOR: &str = "respondsToSelector:";

/// The wrapper's own `forwardingTargetForSelector:` override.
pub const FORWARDING_TARGET_SELECTOR: &str = "forwardingTargetForSelector:";

/// Selectors the wrapper answers itself.
///
/// `respondsToSelector:` and `forwardingTargetForSelector:` are on this list because overriding
/// them is the whole mechanism: asking the previous delegate for them would make the wrapper
/// claim whatever it claims and forward to itself.
pub const OWN_SELECTORS: [&str; 4] = [
    DOCK_MENU_SELECTOR,
    NEW_WINDOW_SELECTOR,
    RESPONDS_TO_SELECTOR,
    FORWARDING_TARGET_SELECTOR,
];

/// Whether the wrapper implements `selector` itself rather than forwarding it.
pub fn is_own_selector(selector: &str) -> bool {
    OWN_SELECTORS.contains(&selector)
}

/// Whether a message for `selector` should be handed to the previous delegate.
///
/// True only for a selector the wrapper does not implement **and** the previous delegate answers:
/// forwarding a selector nobody answers would turn AppKit's `respondsToSelector:` probe into a
/// `true` and produce an `unrecognized selector` crash instead of a clean "not handled".
pub fn should_forward(selector: &str, previous_responds: bool) -> bool {
    !is_own_selector(selector) && previous_responds
}
