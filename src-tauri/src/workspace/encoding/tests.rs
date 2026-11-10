//! The encoding rules, pinned byte for byte.
//!
//! `中` is `D6 D0` and `文` is `CE C4` in GBK/GB18030, so the fixture below is what a real legacy
//! C++ source line looks like on disk — not a shape this code produced itself.

use super::*;

const GB18030_SOURCE: [u8; 5] = [0xD6, 0xD0, 0xCE, 0xC4, 0x0A];

#[test]
fn a_gb18030_source_decodes_to_its_chinese_text() {
    let (text, encoding) = decode_text(&GB18030_SOURCE).expect("gb18030 must decode");

    assert_eq!(text, "中文\n");
    assert_eq!(encoding, TextEncoding::Gb18030);
}

#[test]
fn gb18030_text_saves_back_as_the_identical_bytes() {
    let (text, encoding) = decode_text(&GB18030_SOURCE).expect("gb18030 must decode");

    assert_eq!(
        encode_text(&text, encoding).expect("encode"),
        GB18030_SOURCE
    );
}

#[test]
fn utf8_without_a_mark_keeps_none() {
    let bytes = b"fn main() {}\n";
    let (text, encoding) = decode_text(bytes).expect("utf-8 must decode");

    assert_eq!(encoding, TextEncoding::Utf8);
    assert_eq!(encode_text(&text, encoding).expect("encode"), bytes);
}

#[test]
fn utf8_with_a_mark_keeps_one() {
    let bytes = [0xEF, 0xBB, 0xBF, b'h', b'i'];
    let (text, encoding) = decode_text(&bytes).expect("utf-8 with a mark must decode");

    assert_eq!(text, "hi");
    assert_eq!(encoding, TextEncoding::Utf8Bom);
    assert_eq!(encode_text(&text, encoding).expect("encode"), bytes);
}

#[test]
fn utf16_little_endian_round_trips() {
    let bytes = [0xFF, 0xFE, 0x68, 0x00, 0x69, 0x00];
    let (text, encoding) = decode_text(&bytes).expect("utf-16 le must decode");

    assert_eq!(text, "hi");
    assert_eq!(encoding, TextEncoding::Utf16Le);
    assert_eq!(encode_text(&text, encoding).expect("encode"), bytes);
}

#[test]
fn utf16_big_endian_round_trips() {
    let bytes = [0xFE, 0xFF, 0x00, 0x68, 0x00, 0x69];
    let (text, encoding) = decode_text(&bytes).expect("utf-16 be must decode");

    assert_eq!(text, "hi");
    assert_eq!(encoding, TextEncoding::Utf16Be);
    assert_eq!(encode_text(&text, encoding).expect("encode"), bytes);
}

#[test]
fn bytes_that_are_not_text_are_refused() {
    // A NUL never appears in text of any of these encodings; GB18030 alone would read this happily.
    let error = decode_text(&[0x00, 0xFF, 0x01, 0x00]).expect_err("binary must be refused");

    assert_eq!(error, "not valid UTF-8, UTF-16 or GB18030 text");
}

#[test]
fn a_marked_utf8_file_is_not_retried_as_gb18030() {
    let error = decode_text(&[0xEF, 0xBB, 0xBF, 0xFF]).expect_err("must be refused");

    assert_eq!(error, "not valid UTF-8 after a byte-order mark");
}

#[test]
fn every_label_parses_back_to_its_encoding() {
    for encoding in [
        TextEncoding::Utf8,
        TextEncoding::Utf8Bom,
        TextEncoding::Utf16Le,
        TextEncoding::Utf16Be,
        TextEncoding::Gb18030,
    ] {
        assert_eq!(TextEncoding::parse(encoding.label()), Ok(encoding));
    }
}

#[test]
fn an_unknown_label_is_named() {
    let error = TextEncoding::parse("latin1").expect_err("must be refused");

    assert_eq!(error, "unknown encoding latin1");
}
