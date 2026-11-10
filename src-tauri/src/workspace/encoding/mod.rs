//! The character encodings a source file can arrive in.
//!
//! A GBK/GB18030 C++ source is ordinary in a Chinese codebase, and refusing it was a hard wall: the
//! editor could not open the file at all. Every read now answers with the text *and* the encoding it
//! came in, and every write re-encodes with that same label, so opening and saving a legacy file
//! never converts it to UTF-8 behind the user's back.

use serde::Serialize;

mod decode;
mod encode;

pub use decode::decode_text;
pub use encode::encode_text;

#[cfg(test)]
mod tests;

/// UTF-8's byte-order mark.
pub(crate) const UTF8_BOM: [u8; 3] = [0xEF, 0xBB, 0xBF];

/// UTF-16 little endian's mark, written back when a file was read with it.
pub(crate) const UTF16_LE_BOM: [u8; 2] = [0xFF, 0xFE];

/// UTF-16 big endian's mark, written back when a file was read with it.
pub(crate) const UTF16_BE_BOM: [u8; 2] = [0xFE, 0xFF];

/// One encoding, under the label the frontend keeps on the buffer.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextEncoding {
    /// UTF-8 with no byte-order mark.
    Utf8,
    /// UTF-8 behind `EF BB BF`; the mark is written back.
    Utf8Bom,
    /// UTF-16 little endian; its mark is written back.
    Utf16Le,
    /// UTF-16 big endian; its mark is written back.
    Utf16Be,
    /// GBK's superset: the legacy Chinese encoding most non-UTF-8 sources use.
    Gb18030,
}

impl TextEncoding {
    /// The label the frontend stores, which is also what it sends back on save.
    pub fn label(self) -> &'static str {
        match self {
            Self::Utf8 => "utf8",
            Self::Utf8Bom => "utf8-bom",
            Self::Utf16Le => "utf16-le",
            Self::Utf16Be => "utf16-be",
            Self::Gb18030 => "gb18030",
        }
    }

    /// The encoding a buffer labelled `label` names, or a refusal naming the label.
    pub fn parse(label: &str) -> Result<Self, String> {
        match label {
            "utf8" => Ok(Self::Utf8),
            "utf8-bom" => Ok(Self::Utf8Bom),
            "utf16-le" => Ok(Self::Utf16Le),
            "utf16-be" => Ok(Self::Utf16Be),
            "gb18030" => Ok(Self::Gb18030),
            other => Err(format!("unknown encoding {other}")),
        }
    }
}

/// What a read answers: the decoded text, and the encoding it must be written back as.
///
/// The encoding leaves as its label rather than the enum, so the wire format is the one `label`
/// writes and `parse` reads back — a serde rename could drift from either.
#[derive(Debug, Serialize)]
pub struct TextFile {
    pub text: String,
    pub encoding: &'static str,
}
