//! The macOS arm of `dock::install`.

mod delegate;
mod dock_menu;

use std::sync::Arc;

use objc2::MainThreadMarker;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject};
use objc2_app_kit::{NSApplication, NSApplicationDelegate};

use self::delegate::DockDelegate;

/// Swap in the Dock-menu delegate, wrapping whatever delegate AppKit already installed.
pub fn install<F>(app: &tauri::AppHandle, on_new_window: F) -> Result<(), String>
where
    F: Fn() + Send + Sync + 'static,
{
    let _ = app;
    let mtm = MainThreadMarker::new()
        .ok_or_else(|| "the Dock menu must be installed on the main thread".to_string())?;

    let application = NSApplication::sharedApplication(mtm);
    // Taken before the swap: `setDelegate:` drops our only strong reference to it.
    let previous = application.delegate();
    let wrapper = DockDelegate::new(mtm, previous, Arc::new(on_new_window));
    let ours: *const AnyObject = Retained::as_ptr(&wrapper) as *const AnyObject;
    let protocol: &ProtocolObject<dyn NSApplicationDelegate> = ProtocolObject::from_ref(&*wrapper);
    application.setDelegate(Some(protocol));
    // `NSApplication.delegate` is a *weak* property, so without this the wrapper is deallocated the
    // moment this function returns, the delegate slot goes nil and AppKit falls back to its stock
    // Dock menu — which is exactly what shipped in alpha.102. Leaked on purpose: an application
    // delegate lives for the whole process, and there is one of them.
    std::mem::forget(wrapper);
    installed(&application, ours)?;
    crate::logging::write(
        crate::logging::Level::Info,
        "dock",
        "dock menu installed: a right-click on the Dock icon offers New Window",
    );
    Ok(())
}

/// The swap is only real if the delegate slot still holds the wrapper we installed.
///
/// A weak property that lost its only strong reference reads back as `None`, and that is silent if
/// nobody looks: the app simply shows the stock Dock menu. This turns the whole class of failure
/// into a reported one instead of a screenshot three days later.
fn installed(application: &NSApplication, ours: *const AnyObject) -> Result<(), String> {
    match application.delegate() {
        Some(current) if std::ptr::eq(Retained::as_ptr(&current) as *const AnyObject, ours) => {
            Ok(())
        }
        Some(_) => Err("the Dock menu delegate was replaced by something else".to_string()),
        None => Err("the Dock menu delegate did not stay installed".to_string()),
    }
}
