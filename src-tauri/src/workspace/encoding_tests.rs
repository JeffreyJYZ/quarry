//! The read and save paths, end to end: a legacy file opens as Chinese and saves back byte-identical
//! instead of being converted to UTF-8.

use super::*;
use crate::workspace::tests_group_2::Fixture;

/// `中` and `文` in GBK/GB18030, then a newline.
const GB18030_SOURCE: [u8; 5] = [0xD6, 0xD0, 0xCE, 0xC4, 0x0A];

#[test]
fn a_gb18030_file_opens_as_chinese_and_saves_back_identical() {
    let fixture = Fixture::new("encoding-gb18030");
    fs::write(fixture.path.join("legacy.cpp"), GB18030_SOURCE).expect("write fixture");

    let file = read_text_file(fixture.path("legacy.cpp")).expect("read legacy source");
    assert_eq!(file.text, "中文\n");
    assert_eq!(file.encoding, "gb18030");

    write_text_file(
        fixture.path("legacy.cpp"),
        file.text,
        Some(file.encoding.to_string()),
    )
    .expect("write legacy source");

    assert_eq!(
        fs::read(fixture.path.join("legacy.cpp")).expect("reread"),
        GB18030_SOURCE,
        "the file was converted to UTF-8 on save"
    );
}

#[test]
fn an_edited_gb18030_buffer_is_written_as_gb18030() {
    let fixture = Fixture::new("encoding-gb18030-edit");
    let path = fixture.path("legacy.cpp");

    write_text_file(path, "中文".to_string(), Some("gb18030".to_string())).expect("write");

    assert_eq!(
        fs::read(fixture.path.join("legacy.cpp")).expect("reread"),
        GB18030_SOURCE[..4]
    );
}

#[test]
fn a_utf8_mark_is_written_back_and_a_plain_file_gets_none() {
    let fixture = Fixture::new("encoding-bom");
    let marked = fixture.path("marked.txt");
    let plain = fixture.path("plain.txt");

    write_text_file(marked, "hi".to_string(), Some("utf8-bom".to_string())).expect("write marked");
    write_text_file(plain, "hi".to_string(), None).expect("write plain");

    assert_eq!(
        fs::read(fixture.path.join("marked.txt")).expect("reread"),
        [0xEF, 0xBB, 0xBF, b'h', b'i']
    );
    assert_eq!(
        fs::read(fixture.path.join("plain.txt")).expect("reread"),
        b"hi"
    );
}

#[test]
fn an_utf16_file_keeps_its_byte_order() {
    let fixture = Fixture::new("encoding-utf16");
    let path = fixture.path("wide.txt");

    write_text_file(path, "hi".to_string(), Some("utf16-be".to_string())).expect("write");

    assert_eq!(
        fs::read(fixture.path.join("wide.txt")).expect("reread"),
        [0xFE, 0xFF, 0x00, 0x68, 0x00, 0x69]
    );
}

#[test]
fn a_binary_file_is_refused_naming_the_path_and_what_was_tried() {
    let fixture = Fixture::new("encoding-binary");
    fs::write(fixture.path.join("image.bin"), [0x00, 0xFF, 0x01, 0x00]).expect("write fixture");

    let error = read_text_file(fixture.path("image.bin")).expect_err("binary must be refused");

    assert!(error.contains("image.bin"), "unexpected error: {error}");
    assert!(
        error.contains("not valid UTF-8, UTF-16 or GB18030 text"),
        "unexpected error: {error}"
    );
}

#[test]
fn an_unknown_encoding_label_is_refused_instead_of_written_as_utf8() {
    let fixture = Fixture::new("encoding-unknown");
    let path = fixture.path("file.txt");

    let error = write_text_file(path, "text".to_string(), Some("latin1".to_string()))
        .expect_err("unknown label must be refused");

    assert!(error.contains("file.txt"), "unexpected error: {error}");
    assert!(error.contains("latin1"), "unexpected error: {error}");
    assert!(
        !fixture.path.join("file.txt").exists(),
        "target was created"
    );
}
