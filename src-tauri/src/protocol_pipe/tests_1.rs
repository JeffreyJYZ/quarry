#![allow(unused_imports)]

// The LSP and DAP units (P3) are the consumers of this module; until they land, nothing in the crate
// calls it, so dead-code warnings here would be noise about the intended shape rather than a defect.

use std::io::{self, BufRead, BufReader, Read, Write};
pub use std::process::{Child, ChildStdin, Command, Stdio};
pub use std::sync::mpsc::{self, Receiver};
pub use std::sync::{Arc, Condvar, Mutex};
pub use std::thread;
pub use std::time::Duration;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_1 {
    use super::*;

    use std::io::{Cursor, Read};

    use std::sync::mpsc::RecvTimeoutError;

    use std::time::Duration;

    pub fn frame_bytes(value: &serde_json::Value) -> Vec<u8> {
        let mut buffer = Vec::new();
        write_frame(&mut buffer, value).expect("write_frame into a Vec");
        buffer
    }

    /// A reader that hands out at most a few bytes per `read` call, wrapped in a tiny `BufReader` so
    /// headers and bodies arrive in fragments rather than one buffer.
    pub struct Trickle<R> {
        pub(crate) inner: R,
        pub(crate) chunk: usize,
    }

    impl<R: Read> Read for Trickle<R> {
        fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
            let limit = buffer.len().min(self.chunk);
            self.inner.read(&mut buffer[..limit])
        }
    }

    #[test]
    pub fn roundtrip_preserves_value_and_uses_byte_length() {
        let value = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "窗口/初始化",
            "params": { "text": "héllo wörld — 日本語", "id": 1 }
        });
        let bytes = frame_bytes(&value);

        let separator = b"\r\n\r\n";
        let split = bytes
            .windows(separator.len())
            .position(|window| window == separator)
            .expect("header/body separator");
        let header = String::from_utf8(bytes[..split].to_vec()).expect("ascii header");
        let body = &bytes[split + separator.len()..];

        assert!(header.starts_with("Content-Length: "), "header: {header}");
        let declared: usize = header["Content-Length: ".len()..]
            .parse()
            .expect("numeric Content-Length");
        assert_eq!(declared, body.len());
        let text = String::from_utf8(body.to_vec()).expect("utf8 body");
        assert!(
            body.len() > text.chars().count(),
            "non-ASCII body must be longer in bytes than in chars"
        );

        let mut reader = Cursor::new(bytes);
        let read = read_frame(&mut reader).expect("read_frame");
        assert_eq!(read, value);
    }

    #[test]
    pub fn lowercase_names_and_extra_headers_are_accepted() {
        let body = br#"{"jsonrpc":"2.0","id":7}"#;
        let raw = format!(
            "content-length: {}\r\ncontent-type: application/vscode-jsonrpc; charset=utf-8\r\n\r\n",
            body.len()
        );
        let mut bytes = raw.into_bytes();
        bytes.extend_from_slice(body);

        let mut reader = Cursor::new(bytes);
        let value = read_frame(&mut reader).expect("mixed-case headers with an unknown header");
        assert_eq!(value["id"], serde_json::json!(7));
    }

    #[test]
    pub fn bare_lf_line_endings_are_accepted() {
        let body = br#"{"id":1}"#;
        let mut bytes = format!("Content-Length: {}\n\n", body.len()).into_bytes();
        bytes.extend_from_slice(body);

        let mut reader = Cursor::new(bytes);
        let value = read_frame(&mut reader).expect("LF-only framing");
        assert_eq!(value["id"], serde_json::json!(1));
    }

    #[test]
    pub fn missing_content_length_is_a_protocol_error() {
        let raw = b"Content-Type: application/json\r\n\r\n{}".to_vec();
        let mut reader = Cursor::new(raw);
        let error = read_frame(&mut reader).expect_err("missing Content-Length");
        match error {
            FrameError::Protocol(message) => assert!(
                message.contains("Content-Length"),
                "message should name the missing header: {message}"
            ),
            other => panic!("expected FrameError::Protocol, got {other:?}"),
        }
    }

    #[test]
    pub fn non_numeric_content_length_is_a_protocol_error() {
        let raw = b"Content-Length: twelve\r\n\r\n{}".to_vec();
        let mut reader = Cursor::new(raw);
        let error = read_frame(&mut reader).expect_err("non-numeric Content-Length");
        match error {
            FrameError::Protocol(message) => assert!(
                message.contains("Content-Length"),
                "message should name the bad header: {message}"
            ),
            other => panic!("expected FrameError::Protocol, got {other:?}"),
        }
    }

    #[test]
    pub fn length_beyond_the_body_is_an_io_error() {
        let raw = b"Content-Length: 128\r\n\r\n{\"id\":1}".to_vec();
        let mut reader = Cursor::new(raw);
        let error = read_frame(&mut reader).expect_err("truncated body");
        match error {
            FrameError::Io(error) => assert_eq!(error.kind(), io::ErrorKind::UnexpectedEof),
            other => panic!("expected FrameError::Io(UnexpectedEof), got {other:?}"),
        }
    }
}
