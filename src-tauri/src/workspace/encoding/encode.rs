//! Writing text back in the encoding it was read with.
//!
//! The rule is symmetric with the read: a mark that was read is written again, UTF-8 without a mark
//! stays without one, and GB18030 text goes back as GB18030 instead of being silently converted.

use encoding_rs::GB18030;

use super::{TextEncoding, UTF8_BOM, UTF16_BE_BOM, UTF16_LE_BOM};

/// The bytes `text` must become to be written as `encoding`.
pub fn encode_text(text: &str, encoding: TextEncoding) -> Result<Vec<u8>, String> {
    match encoding {
        TextEncoding::Utf8 => Ok(text.as_bytes().to_vec()),
        TextEncoding::Utf8Bom => Ok(marked(&UTF8_BOM, text.as_bytes())),
        TextEncoding::Utf16Le => Ok(marked(&UTF16_LE_BOM, &utf16_units(text, true))),
        TextEncoding::Utf16Be => Ok(marked(&UTF16_BE_BOM, &utf16_units(text, false))),
        TextEncoding::Gb18030 => {
            let (bytes, _, had_errors) = GB18030.encode(text);
            if had_errors {
                return Err("text cannot be represented as GB18030".to_string());
            }
            Ok(bytes.into_owned())
        }
    }
}

/// A byte-order mark followed by the body it introduces.
fn marked(mark: &[u8], body: &[u8]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(mark.len() + body.len());
    bytes.extend_from_slice(mark);
    bytes.extend_from_slice(body);
    bytes
}

/// `text` as UTF-16 code units in the requested byte order.
fn utf16_units(text: &str, little_endian: bool) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(text.len() * 2);
    for unit in text.encode_utf16() {
        let pair = if little_endian {
            unit.to_le_bytes()
        } else {
            unit.to_be_bytes()
        };
        bytes.extend_from_slice(&pair);
    }
    bytes
}
