//! Whole-file replacement that keeps each line's own terminator.
//!
//! `Regex::replace_all` over a whole file is wrong in two ways: its `.` also matches the `\r` of a
//! CRLF pair, so a pattern that reaches the line end swallows the terminator and rewrites a CRLF
//! file as LF; and its template expands `$1` and `${name}` even for a fixed-string search, whose
//! replacement is text the user typed. Each line is replaced with its own terminator put back, and
//! a literal search inserts its replacement verbatim.

use regex::{NoExpand, Regex};

/// `(text, replacements)` after replacing every match in `text`.
///
/// `literal` inserts `replacement` verbatim: a fixed-string search has no captures, so a `$1` in
/// the replacement is inserted as typed rather than expanded.
pub(crate) fn replace_text(
    re: &Regex,
    replacement: &str,
    text: &str,
    literal: bool,
) -> (String, u32) {
    let mut out = String::with_capacity(text.len());
    let mut count = 0u32;
    let mut rest = text;
    while !rest.is_empty() {
        let (body, terminator, tail) = split_line(rest);
        count += re.find_iter(body).count() as u32;
        let replaced = if literal {
            re.replace_all(body, NoExpand(replacement))
        } else {
            re.replace_all(body, replacement)
        };
        out.push_str(&replaced);
        out.push_str(terminator);
        rest = tail;
    }
    (out, count)
}

/// One line's body, its terminator (`\r\n`, `\n`, `\r`, or empty at the end) and the rest.
fn split_line(text: &str) -> (&str, &str, &str) {
    let Some(index) = text.find(['\r', '\n']) else {
        return (text, "", "");
    };
    let bytes = text.as_bytes();
    if bytes[index] == b'\r' && bytes.get(index + 1) == Some(&b'\n') {
        return (&text[..index], &text[index..index + 2], &text[index + 2..]);
    }
    (&text[..index], &text[index..index + 1], &text[index + 1..])
}
