//! Decoding a byte stream that arrives in chunks.
//!
//! A terminal read is whatever the kernel had ready, so a four-byte character can arrive as two bytes
//! and then two more. Decoding each chunk on its own turns both halves into U+FFFD and the character is
//! lost; a stateful decoder keeps the incomplete tail and prepends it to the next read, so the output is
//! the same as if the whole stream had arrived at once.
//!
//! Genuinely invalid bytes still become U+FFFD: this is not a validator, it only refuses to lose a
//! character to a chunk boundary.

/// How many bytes of an unfinished character the decoder is holding.
const MAX_TAIL: usize = 3;

#[derive(Default)]
pub struct Utf8Stream {
    tail: Vec<u8>,
}

impl Utf8Stream {
    /// Decodes `chunk`, returning only the text that is complete.
    ///
    /// An empty string means the chunk ended inside a character; its bytes are kept for the next call.
    pub fn push(&mut self, chunk: &[u8]) -> String {
        let mut bytes = std::mem::take(&mut self.tail);
        bytes.extend_from_slice(chunk);
        let keep = incomplete_tail(&bytes);
        let split = bytes.len() - keep;
        self.tail = bytes[split..].to_vec();
        String::from_utf8_lossy(&bytes[..split]).into_owned()
    }

    /// The held bytes, decoded lossily: call when the stream ends, so a truncated character is not lost
    /// silently.
    pub fn finish(&mut self) -> String {
        let bytes = std::mem::take(&mut self.tail);
        String::from_utf8_lossy(&bytes).into_owned()
    }
}

/// Bytes at the end of `bytes` that belong to an incomplete character, or 0 when it ends on a boundary.
fn incomplete_tail(bytes: &[u8]) -> usize {
    let len = bytes.len();
    let look = len.min(MAX_TAIL + 1);
    for back in 1..=look {
        let index = len - back;
        let byte = bytes[index];
        if byte & 0b1100_0000 == 0b1000_0000 {
            // A continuation byte: the character started further back.
            continue;
        }
        let needed = match byte {
            0x00..=0x7F => 1,
            0b1100_0000..=0b1101_1111 => 2,
            0b1110_0000..=0b1110_1111 => 3,
            0b1111_0000..=0b1111_0111 => 4,
            // A stray continuation or an invalid lead byte: let the lenient decode report it.
            _ => return 0,
        };
        return if needed > back { back } else { 0 };
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ascii_passes_straight_through() {
        let mut stream = Utf8Stream::default();
        assert_eq!(stream.push(b"make: ok\n"), "make: ok\n");
    }

    #[test]
    fn a_character_split_across_two_reads_survives() {
        let emoji = "🙂".as_bytes();
        let mut stream = Utf8Stream::default();
        let first = stream.push(&emoji[..2]);
        let second = stream.push(&emoji[2..]);
        assert_eq!(first, "");
        assert_eq!(second, "🙂");
        assert!(!format!("{first}{second}").contains('\u{FFFD}'));
    }

    #[test]
    fn the_bytes_before_a_split_character_are_not_delayed() {
        let emoji = "🙂".as_bytes();
        let mut stream = Utf8Stream::default();
        let mut chunk = b"ok ".to_vec();
        chunk.extend_from_slice(&emoji[..3]);
        assert_eq!(stream.push(&chunk), "ok ");
        assert_eq!(stream.push(&emoji[3..]), "🙂");
    }

    #[test]
    fn a_character_split_three_ways_arrives_whole() {
        let bytes = "🙂".as_bytes();
        let mut stream = Utf8Stream::default();
        let mut text = String::new();
        for byte in bytes {
            text.push_str(&stream.push(&[*byte]));
        }
        assert_eq!(text, "🙂");
    }

    #[test]
    fn invalid_bytes_still_decode_lossily() {
        let mut stream = Utf8Stream::default();
        assert_eq!(stream.push(&[0xFF, 0xFE]), "\u{FFFD}\u{FFFD}");
    }

    #[test]
    fn finish_returns_a_truncated_character_so_it_is_not_silently_dropped() {
        let mut stream = Utf8Stream::default();
        assert_eq!(stream.push(&"🙂".as_bytes()[..2]), "");
        assert_eq!(stream.finish(), "\u{FFFD}");
    }
}
