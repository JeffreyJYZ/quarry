#![allow(unused_imports)]

use super::*;

/// Pure: compute the incremental range for a suffix-only change, or None for full sync.
pub fn incremental_range(old: &str, new: &str) -> Option<Range> {
    if old == new {
        return None;
    }
    let old_u: Vec<u16> = old.encode_utf16().collect();
    let new_u: Vec<u16> = new.encode_utf16().collect();
    let mut p = 0usize;
    while p < old_u.len() && p < new_u.len() && old_u[p] == new_u[p] {
        p += 1;
    }
    let old_tail = &old_u[p..];
    let new_tail = &new_u[p..];
    // common suffix between the two tails
    let mut cs = 0usize;
    while cs < old_tail.len()
        && cs < new_tail.len()
        && old_tail[old_tail.len() - 1 - cs] == new_tail[new_tail.len() - 1 - cs]
    {
        cs += 1;
    }
    // middle edit: an unchanged suffix remains -> fall back to full sync
    if !old_tail.is_empty() && cs > 0 && cs < old_tail.len() {
        return None;
    }
    // incremental range from first differing utf-16 position to end of old document
    Some(Range {
        start: utf16_offset_to_position(old, p),
        end: utf16_offset_to_position(old, old_u.len()),
    })
}

fn utf16_offset_to_position(text: &str, offset: usize) -> Position {
    let mut line = 0u32;
    let mut character = 0u32;
    let mut count = 0usize;
    for ch in text.chars() {
        if count >= offset {
            break;
        }
        // utf-16 length of ch
        let w = if (ch as u32) > 0xFFFF { 2 } else { 1 };
        if ch == '\n' {
            line += 1;
            character = 0;
        } else {
            character += w as u32;
        }
        count += w;
        if count > offset {
            // shouldn't happen mid-char
        }
    }
    Position { line, character }
}
