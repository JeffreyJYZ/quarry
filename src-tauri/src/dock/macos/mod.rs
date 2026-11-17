//! The macOS arm of `dock::install`.

mod delegate;
mod dock_menu;

use std::sync::Arc;

use objc2::MainThreadMarker;
use objc2::runtime::ProtocolObject;
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
    let protocol: &ProtocolObject<dyn NSApplicationDelegate> = ProtocolObject::from_ref(&*wrapper);
    application.setDelegate(Some(protocol));
    Ok(())
}
