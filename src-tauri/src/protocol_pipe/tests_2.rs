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
pub mod tests_group_2 {
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
    pub fn truncated_header_block_is_a_protocol_error() {
        let raw = b"Content-Length: 10\r\n".to_vec();
        let mut reader = Cursor::new(raw);
        let error = read_frame(&mut reader).expect_err("header block never ends");
        assert!(
            matches!(error, FrameError::Protocol(_)),
            "expected FrameError::Protocol, got {error:?}"
        );
    }

    #[test]
    pub fn fragmented_reads_do_not_assume_a_single_buffer() {
        let first = serde_json::json!({ "seq": 1, "text": "日本語テキスト" });
        let second = serde_json::json!({ "seq": 2, "text": "ok" });
        let mut bytes = frame_bytes(&first);
        bytes.extend_from_slice(&frame_bytes(&second));

        let trickle = Trickle {
            inner: Cursor::new(bytes),
            chunk: 3,
        };
        let mut reader = BufReader::with_capacity(4, trickle);

        assert_eq!(read_frame(&mut reader).expect("first frame"), first);
        assert_eq!(read_frame(&mut reader).expect("second frame"), second);
    }

    #[test]
    pub fn process_pipe_roundtrips_through_cat() {
        let mut command = Command::new("/bin/cat");
        let mut pipe = ProcessPipe::spawn(&mut command).expect("spawn /bin/cat");

        let first = serde_json::json!({ "jsonrpc": "2.0", "id": 1, "method": "初始化" });
        let second = serde_json::json!({ "jsonrpc": "2.0", "id": 2, "result": { "ok": true } });
        pipe.send(&first).expect("send first frame");
        pipe.send(&second).expect("send second frame");

        let received = pipe
            .frames
            .recv_timeout(Duration::from_secs(5))
            .expect("first frame from the reader thread")
            .expect("first frame is a value");
        assert_eq!(received, first);

        let received = pipe
            .frames
            .recv_timeout(Duration::from_secs(5))
            .expect("second frame from the reader thread")
            .expect("second frame is a value");
        assert_eq!(received, second);

        pipe.kill().expect("kill");
        assert!(
            !matches!(
                pipe.frames.recv_timeout(Duration::from_secs(5)),
                Err(RecvTimeoutError::Timeout)
            ),
            "reader thread should end once the child is gone"
        );
    }
}
