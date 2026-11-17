//! The wrapper `NSApplicationDelegate`.
//!
//! It implements `applicationDockMenu:` (the item AppKit shows when the Dock icon is right-clicked)
//! and `newWindow:` (the action that item sends), and forwards every other selector to the delegate
//! AppKit already had. `dock::spec::should_forward` decides that, and `dock::spec::OWN_SELECTORS`
//! is the whole list of what it answers itself.

use std::ffi::CString;
use std::sync::Arc;

use objc2::rc::Retained;
use objc2::runtime::{AnyObject, NSObject, ProtocolObject, Sel};
use objc2::{DefinedClass, MainThreadOnly, define_class, msg_send};
use objc2_app_kit::{NSApplication, NSApplicationDelegate, NSMenu};
use objc2_foundation::{MainThreadMarker, NSObjectProtocol};

use super::dock_menu;
use crate::dock::spec;

/// State the wrapper owns for its lifetime.
pub struct DelegateIvars {
    /// The delegate AppKit had before this one; every selector it answers is forwarded here.
    pub previous: Option<Retained<ProtocolObject<dyn NSApplicationDelegate>>>,
    /// Fires when **New Window** is chosen.
    pub on_new_window: Arc<dyn Fn() + Send + Sync>,
    /// The menu is rebuilt on every `applicationDockMenu:` call, so nothing is cached.
    pub _marker: (),
}

define_class!(
    /// The Dock-menu delegate. `MainThreadOnly` because every AppKit delegate is.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "QuarryDockDelegate"]
    #[ivars = DelegateIvars]
    pub struct DockDelegate;

    unsafe impl NSObjectProtocol for DockDelegate {}

    unsafe impl NSApplicationDelegate for DockDelegate {
        // Declared as a raw pointer because `define_class!` cannot express a `none`-family
        // `Retained` return; the value is autoreleased, which is what AppKit expects here.
        #[unsafe(method(applicationDockMenu:))]
        fn application_dock_menu(&self, _sender: &NSApplication) -> *mut NSMenu {
            let mtm = MainThreadMarker::from(self);
            let action = dock_menu::new_window_selector();
            let menu = dock_menu::build(mtm, action, self.as_any_object());
            Retained::autorelease_return(menu)
        }
    }

    impl DockDelegate {
        /// `respondsToSelector:` is asked before AppKit sends anything, so the wrapper must claim
        /// its own selectors and mirror the previous delegate for everything else.
        #[unsafe(method(respondsToSelector:))]
        fn responds_to_selector(&self, selector: Sel) -> objc2::runtime::Bool {
            let name = selector_name(selector);
            if spec::is_own_selector(&name) {
                return objc2::runtime::Bool::YES;
            }
            objc2::runtime::Bool::new(self.previous_responds(&name))
        }

        /// The single forwarding hook: return the previous delegate, or null to let AppKit raise
        /// the usual `unrecognized selector`.
        #[unsafe(method(forwardingTargetForSelector:))]
        fn forwarding_target(&self, selector: Sel) -> *mut AnyObject {
            let name = selector_name(selector);
            let previous = self.ivars().previous.as_ref();
            if !spec::should_forward(&name, self.previous_responds(&name)) {
                return std::ptr::null_mut();
            }
            match previous {
                Some(target) => {
                    let erased: &AnyObject = target.as_ref();
                    // Never forward to ourselves: that is an infinite message loop, not a delegate.
                    if std::ptr::eq(erased, self.as_any_object()) {
                        std::ptr::null_mut()
                    } else {
                        erased as *const AnyObject as *mut AnyObject
                    }
                }
                None => std::ptr::null_mut(),
            }
        }

        #[unsafe(method(newWindow:))]
        fn new_window(&self, _sender: &AnyObject) {
            (self.ivars().on_new_window)();
        }
    }
);

impl DockDelegate {
    /// Create the wrapper. The previous delegate is retained here because `NSApplication.delegate`
    /// is a weak reference and tao keeps the only other strong one.
    pub fn new(
        mtm: MainThreadMarker,
        previous: Option<Retained<ProtocolObject<dyn NSApplicationDelegate>>>,
        on_new_window: Arc<dyn Fn() + Send + Sync>,
    ) -> Retained<Self> {
        let this = mtm.alloc::<DockDelegate>().set_ivars(DelegateIvars {
            previous,
            on_new_window,
            _marker: (),
        });
        unsafe { msg_send![super(this), init] }
    }

    fn as_any_object(&self) -> &AnyObject {
        // SAFETY: `DockDelegate` is an `NSObject` subclass, so the pointer layout is the same.
        unsafe { &*(self as *const Self as *const AnyObject) }
    }

    fn previous_responds(&self, name: &str) -> bool {
        let Some(previous) = self.ivars().previous.as_ref() else {
            return false;
        };
        let Ok(selector) = CString::new(name) else {
            return false;
        };
        previous.respondsToSelector(Sel::register(&selector))
    }
}

/// A selector's name as a `String`, which is what `dock::spec` reasons about.
fn selector_name(selector: Sel) -> String {
    selector.name().to_string_lossy().into_owned()
}
