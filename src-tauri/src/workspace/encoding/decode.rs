//! Reading bytes into text, in the order a real file can be recognised.
//!
//! A byte-order mark is a declaration, so it is obeyed rather than second-guessed: a file marked
//! UTF-8 is not retried as GB18030, and one marked UTF-16 is not read as UTF-8. Without a mark,
//! strict UTF-8 decides first and GB18030 — GBK's superset — is the fallback that opens a legacy
//! Chinese source.

use encoding_rs::{Encoding, GB18030, UTF_16BE, UTF_16LE};

use super::{TextEncoding, UTF8_BOM, UTF16_BE_BOM, UTF16_LE_BOM};

/// The refusal, naming every encoding that was tried before giving up.
const NOT_TEXT: &str = "not valid UTF-8, UTF-16 or GB18030 text";

/// The text and the encoding it was read in.
pub fn decode_text(bytes: &[u8]) -> Result<(String, TextEncoding), String> {
    if let Some(rest) = bytes.strip_prefix(&UTF8_BOM) {
        let text = std::str::from_utf8(rest)
            .map_err(|_| "not valid UTF-8 after a byte-order mark".to_string())?;
        return Ok((text.to_string(), TextEncoding::Utf8Bom));
    }
    if let Some(rest) = bytes.strip_prefix(&UTF16_LE_BOM) {
        let text = utf16(rest, UTF_16LE, "little endian")?;
        return Ok((text, TextEncoding::Utf16Le));
    }
    if let Some(rest) = bytes.strip_prefix(&UTF16_BE_BOM) {
        let text = utf16(rest, UTF_16BE, "big endian")?;
        return Ok((text, TextEncoding::Utf16Be));
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return Ok((text.to_string(), TextEncoding::Utf8));
    }
    // None of these encodings stores a NUL in text, so a NUL byte is what separates a binary from a
    // legacy source: GB18030 maps nearly every byte pair to *something*, and would read an image as
    // text rather than refuse it.
    if bytes.contains(&0) {
        return Err(NOT_TEXT.to_string());
    }
    let (text, _, had_errors) = GB18030.decode(bytes);
    if had_errors {
        return Err(NOT_TEXT.to_string());
    }
    Ok((text.into_owned(), TextEncoding::Gb18030))
}

/// One UTF-16 body, after its mark has been consumed.
fn utf16(bytes: &[u8], encoding: &'static Encoding, order: &str) -> Result<String, String> {
    let (text, had_errors) = encoding.decode_without_bom_handling(bytes);
    if had_errors {
        return Err(format!("not valid UTF-16 {order} text"));
    }
    Ok(text.into_owned())
}
