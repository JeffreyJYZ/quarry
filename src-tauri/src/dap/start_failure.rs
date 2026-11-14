//! Why an adapter that is installed still cannot start.
//!
//! A protocol error only says the stream ended; the exit status says how, and the adapter's own
//! stderr is usually where it said why. `lldb-dap` that dies before answering the first `initialize`
//! leaves the client with a timeout and nothing else — and a timeout reads as a slow debugger, not as
//! a process that never ran. Those three facts are therefore always reported together.
//!
//! The wait and the length are the LSP half's, measured there for the same question: a dead child's
//! stderr ends within a moment, and a message that carries the first couple of kilobytes is enough to
//! name a missing library.

pub use crate::lsp::{STDERR_MESSAGE_LIMIT, STDERR_WAIT, one_line, truncate_stderr};

/// One startup failure: what was attempted, how the process ended, and what it said.
pub fn format_start_failure(
    adapter: &str,
    reason: &str,
    stderr: &str,
    exit: Option<i32>,
) -> String {
    let mut message = format!("{adapter}: {reason}");
    if let Some(code) = exit {
        message.push_str(&format!(" (exit code {})", describe_exit(code)));
    }

    let said = one_line(&truncate_stderr(stderr, STDERR_MESSAGE_LIMIT));
    if !said.is_empty() {
        message.push_str(&format!("; it said: {said}"));
    } else if exit.is_some() {
        message.push_str("; it printed nothing");
    }
    message
}

/// An exit code as a number and a hex word, with the loader's own reason when it is one.
pub fn describe_exit(code: i32) -> String {
    let unsigned = code as u32;
    match exit_hint(unsigned) {
        Some(hint) => format!("{code}, 0x{unsigned:x}: {hint}"),
        None => format!("{code}, 0x{unsigned:x}"),
    }
}

/// The loader statuses worth naming.
///
/// A Windows program that cannot load terminates before any of its own code runs, so it writes
/// nothing to stderr and exits with an `NTSTATUS` the shell would print as a huge number. Naming the
/// status is the difference between "the debugger is broken" and "the install is incomplete".
pub fn exit_hint(code: u32) -> Option<&'static str> {
    match code {
        0xc000_0135 => Some("the loader could not find a DLL the adapter needs beside it"),
        0xc000_0139 => Some("a DLL beside it is not the version the adapter was linked against"),
        0xc000_0142 => Some("a DLL beside it failed to initialise"),
        0xc000_0005 => Some("it crashed before it could answer"),
        _ => None,
    }
}
