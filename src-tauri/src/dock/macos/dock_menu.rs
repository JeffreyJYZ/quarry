//! Building the `NSMenu` a Dock right-click shows.
//!
//! Split from the delegate so the menu's shape can be read in one place: the item's title and
//! action come from `dock::spec`, and nothing here depends on which delegate asked for it.

use objc2::rc::Retained;
use objc2::runtime::Sel;
use objc2::{MainThreadMarker, sel};

use crate::dock::spec;
use objc2_app_kit::{NSMenu, NSMenuItem};
use objc2_foundation::NSString;

/// Build the Dock menu, sending `action` to `target`.
///
/// `target` is the delegate wrapper, not this function: `NSMenuItem.target` is a weak property, so
/// the wrapper has to outlive the menu (it does — it is also the application delegate).
pub fn build(
    mtm: MainThreadMarker,
    action: Sel,
    target: &objc2::runtime::AnyObject,
) -> Retained<NSMenu> {
    let menu = NSMenu::new(mtm);
    let item = unsafe {
        NSMenuItem::initWithTitle_action_keyEquivalent(
            mtm.alloc(),
            &NSString::from_str(spec::menu_spec().title),
            Some(action),
            &NSString::from_str(""),
        )
    };
    // SAFETY: the wrapper implements `newWindow:`; AppKit only sends it here.
    unsafe { item.setTarget(Some(target)) };
    menu.addItem(&item);
    menu
}

/// The selector AppKit sends when the item is chosen.
pub fn new_window_selector() -> Sel {
    sel!(newWindow:)
}
