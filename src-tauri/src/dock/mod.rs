//! The macOS Dock icon menu: a **New Window** item on the icon's right-click menu.
//!
//! Tauri 2 exposes no dock-menu API, so this is AppKit work: `NSApplication` asks its
//! `NSApplicationDelegate` for `applicationDockMenu:` and shows whatever `NSMenu` comes back.
//!
//! # Why a forwarding delegate
//!
//! AppKit has exactly one delegate, and Tauri/tao install their own (`TaoAppDelegate`) for
//! `applicationWillFinishLaunching`, `applicationShouldTerminateAfterLastWindowClosed` and friends
//! — window and quit behaviour depends on those calls landing. Replacing the delegate with one
//! that answers only `applicationDockMenu:` silently drops every other message, so this module
//! wraps rather than replaces.
//!
//! The wrapper answers the selectors it implements itself (`applicationDockMenu:`, `newWindow:`,
//! and its own `respondsToSelector:` / `forwardingTargetForSelector:`), refuses nothing the
//! previous delegate answers, and hands every remaining message to that previous delegate through
//! `forwardingTargetForSelector:`. That is the smallest correct shape: no per-selector forwarding
//! table to keep in sync with AppKit, and a message the previous delegate does not know still
//! ends as the usual `unrecognized selector` instead of being swallowed. The previous delegate is
//! retained by the wrapper, because `NSApplication.delegate` is a weak reference and tao keeps
//! the only strong one.
//!
//! # What only a real launch can prove
//!
//! Everything below is compiled and unit-tested, but the menu appearing on an actual Dock
//! right-click, and the callback opening a window while every existing delegate behaviour still
//! works, is only provable by running the app and right-clicking the icon.
//!
//! # Non-macOS
//!
//! `install` keeps the same signature and does nothing, so the caller needs no `cfg`.

// `install` is called from the startup wiring, which lands after this module; until then every
// item here reads as unused. The exceptions are the tests, which do exercise them.
#![allow(dead_code)]

mod spec;

#[cfg(test)]
mod tests_spec;

#[cfg(target_os = "macos")]
mod macos;

/// Register the Dock menu, calling `on_new_window` when **New Window** is chosen.
///
/// Must be called on the main thread, after AppKit has installed its own delegate (i.e. from
/// Tauri's `setup` hook).
#[cfg(target_os = "macos")]
pub fn install<F>(app: &tauri::AppHandle, on_new_window: F) -> Result<(), String>
where
    F: Fn() + Send + Sync + 'static,
{
    macos::install(app, on_new_window)
}

/// Register the Dock menu. Non-macOS arms have no Dock menu, so this is a no-op that keeps the
/// caller free of `cfg`.
#[cfg(not(target_os = "macos"))]
pub fn install<F>(app: &tauri::AppHandle, on_new_window: F) -> Result<(), String>
where
    F: Fn() + Send + Sync + 'static,
{
    let _ = (app, on_new_window);
    Ok(())
}
