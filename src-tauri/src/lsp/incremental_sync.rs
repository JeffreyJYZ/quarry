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
    // Two characters can share a high surrogate and differ in the low one (😀 → 😁), which lands `p`
    // between the halves of a pair. An LSP range may only start on a character boundary, so step back to
    // the start of that character: both strings agree up to there, so it is a boundary in both.
    p = floor_char_boundary(old, p);
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

/// The largest UTF-16 offset that is at or below `offset` and starts a character of `text`.
fn floor_char_boundary(text: &str, offset: usize) -> usize {
    let mut count = 0usize;
    for ch in text.chars() {
        let width = ch.len_utf16();
        if count + width > offset {
            return count;
        }
        count += width;
    }
    count
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

#[cfg(test)]
mod tests {
    use super::*;

    fn start_character(range: &Range) -> u32 {
        range.start.character
    }

    #[test]
    fn an_ascii_append_starts_where_the_text_stops_matching() {
        let range = incremental_range("int a;", "int a;b").expect("incremental");
        assert_eq!(start_character(&range), 6);
        assert_eq!(range.start.line, 0);
    }

    #[test]
    fn replacing_an_emoji_starts_at_the_character_not_inside_it() {
        // 😀 and 😁 share a high surrogate, so the shared prefix ends between the halves of a pair.
        let range = incremental_range("x😀", "x😁").expect("incremental");
        assert_eq!(
            start_character(&range),
            1,
            "range must start before the emoji"
        );
    }

    #[test]
    fn replacing_an_emoji_on_a_later_line_keeps_its_line() {
        let range = incremental_range("a\n😀", "a\n😁").expect("incremental");
        assert_eq!(range.start.line, 1);
        assert_eq!(start_character(&range), 0);
    }

    #[test]
    fn an_edit_with_an_unchanged_tail_is_a_full_sync() {
        assert_eq!(incremental_range("a😀b", "a😁b"), None);
    }

    #[test]
    fn identical_text_needs_no_update() {
        assert_eq!(incremental_range("same", "same"), None);
    }
}
