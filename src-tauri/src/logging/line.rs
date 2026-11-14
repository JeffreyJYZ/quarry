//! One log line: a header of timestamp, level and target, then the message.
//!
//! A multi-line message — a stack, a component stack, a backtrace — keeps its shape but every
//! continuation line is indented, so a reader can still tell one entry from the next and a line
//! beginning with a timestamp is always a real entry.

use super::level::Level;

/// `2026-11-14T09:12:33Z ERROR [ui] TypeError: nope`
pub fn format(stamp: &str, level: Level, target: &str, message: &str) -> String {
    let mut out = String::with_capacity(message.len() + 64);
    out.push_str(stamp);
    out.push(' ');
    out.push_str(level.as_str());
    out.push_str(" [");
    out.push_str(target);
    out.push_str("] ");
    for (index, part) in message.lines().enumerate() {
        if index > 0 {
            out.push('\n');
            out.push_str("    ");
        }
        out.push_str(part);
    }
    out
}
