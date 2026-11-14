//! The spelling a source path reaches the adapter in.
//!
//! Windows canonicalisation answers with a verbatim path (`\\?\C:\…`), and the project tree is
//! opened through it, so a breakpoint can arrive spelled that way while the debug info spells the
//! same file `C:\…`. LLDB compares a source path as written, so a spelling only the IDE has leaves
//! every breakpoint unverified and the debugger looks dead.
//!
//! The adapter therefore gets the spelling the build tools get, from the one function in this crate
//! that renders a path for a consumer outside it — the same function a launch's program path goes
//! through, so the two cannot disagree. The Windows row asserts both spellings, so the difference is
//! measured on the image rather than assumed here.

pub use crate::build_task::external_str;

/// The path an adapter is given for a source file, in the spelling the debug info holds.
pub fn source_path(path: &str) -> String {
    external_str(path)
}
