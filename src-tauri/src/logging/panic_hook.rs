//! Panics land in the log, then the default hook runs.
//!
//! Order matters and is the whole point: the write happens first, so the file holds the panic even
//! if the default hook aborts the process or the window is reloaded straight after. The default
//! hook still runs, so stderr and the usual abort behaviour are untouched.

use std::panic::PanicHookInfo;
use std::sync::Once;

use super::global;
use super::level::Level;

static INSTALLED: Once = Once::new();

/// Install the hook once per process; a second call is a no-op rather than a hook that writes twice.
pub fn install() {
    INSTALLED.call_once(|| {
        let default = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            let report = report_text(info);
            run_hook(
                &report,
                &mut |text| global::write(Level::Error, "panic", text),
                &mut || default(info),
            );
        }));
    });
}

/// `panic at <file>:<line>:<column>: <message>` plus the backtrace when `RUST_BACKTRACE` asked for
/// one. Pure, so the format is tested without installing a hook.
pub fn format_report(message: &str, location: Option<&str>, backtrace: Option<&str>) -> String {
    let mut out = String::from("panic");
    if let Some(location) = location {
        out.push_str(" at ");
        out.push_str(location);
    }
    out.push_str(": ");
    out.push_str(message);
    if let Some(backtrace) = backtrace {
        out.push_str("\nbacktrace:\n");
        out.push_str(backtrace.trim_end());
    }
    out
}

/// Write the report, then hand over to the default hook. Split out so a test can prove the order
/// without touching the process hook, which is global and would race every other test.
pub fn run_hook(report: &str, write: &mut dyn FnMut(&str), next: &mut dyn FnMut()) {
    write(report);
    next();
}

fn report_text(info: &PanicHookInfo<'_>) -> String {
    let message = payload_message(info);
    let location = info.location().map(|location| {
        format!(
            "{}:{}:{}",
            location.file(),
            location.line(),
            location.column()
        )
    });
    let backtrace = backtrace_text();
    format_report(&message, location.as_deref(), backtrace.as_deref())
}

/// A panic payload is usually `&str` or `String`; anything else still names itself.
fn payload_message(info: &PanicHookInfo<'_>) -> String {
    let payload = info.payload();
    if let Some(text) = payload.downcast_ref::<&str>() {
        return (*text).to_string();
    }
    if let Some(text) = payload.downcast_ref::<String>() {
        return text.clone();
    }
    "non-string panic payload".to_string()
}

/// Captured only when the environment asked for it (`RUST_BACKTRACE`); otherwise `Disabled`, and a
/// crash log that silently costs nothing.
fn backtrace_text() -> Option<String> {
    let trace = std::backtrace::Backtrace::capture();
    match trace.status() {
        std::backtrace::BacktraceStatus::Captured => Some(trace.to_string()),
        _ => None,
    }
}
