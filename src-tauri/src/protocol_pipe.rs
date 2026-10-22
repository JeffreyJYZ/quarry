//! Content-Length framing shared by LSP and DAP.
//!
//! Both protocols speak JSON-RPC over a child process's stdio, framed as
//! `Content-Length: <bytes>\r\n\r\n<body>`. Header names are case-insensitive, unknown headers are
//! ignored, and both CRLF and bare LF line endings are accepted. One implementation serves both.

// The LSP and DAP units (P3) are the consumers of this module; until they land, nothing in the crate
// calls it, so dead-code warnings here would be noise about the intended shape rather than a defect.
#![allow(dead_code)]

use std::io::{self, BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;

/// Largest body this crate is willing to allocate for a single frame. A declared length beyond this
/// is treated as a protocol error rather than trusted with an allocation.
const MAX_FRAME_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug)]
pub enum FrameError {
    Io(io::Error),
    Json(serde_json::Error),
    Protocol(String),
}

impl std::fmt::Display for FrameError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FrameError::Io(error) => write!(f, "io: {error}"),
            FrameError::Json(error) => write!(f, "json: {error}"),
            FrameError::Protocol(message) => write!(f, "protocol: {message}"),
        }
    }
}

impl std::error::Error for FrameError {}

impl From<io::Error> for FrameError {
    fn from(error: io::Error) -> Self {
        FrameError::Io(error)
    }
}

impl From<serde_json::Error> for FrameError {
    fn from(error: serde_json::Error) -> Self {
        FrameError::Json(error)
    }
}

/// Write one framed JSON body.
pub fn write_frame<W: Write>(writer: &mut W, value: &serde_json::Value) -> io::Result<()> {
    let body = serde_json::to_vec(value).map_err(io::Error::other)?;
    write!(writer, "Content-Length: {}\r\n\r\n", body.len())?;
    writer.write_all(&body)?;
    writer.flush()
}

/// Read one framed JSON body.
///
/// Reads header lines up to the blank separator, then exactly the declared number of bytes. A
/// truncated body surfaces as [`FrameError::Io`]; only a complete body reaches the JSON parser.
pub fn read_frame<R: BufRead>(reader: &mut R) -> Result<serde_json::Value, FrameError> {
    let mut line = String::new();
    let mut content_length: Option<usize> = None;
    let mut header_lines = 0usize;

    loop {
        line.clear();
        let read = reader.read_line(&mut line)?;
        if read == 0 {
            let message = if header_lines == 0 {
                "unexpected end of stream before frame header"
            } else {
                "unexpected end of stream while reading headers"
            };
            return Err(FrameError::Protocol(message.to_string()));
        }
        let header = line.trim_end_matches(['\r', '\n']);
        if header.is_empty() {
            break;
        }
        header_lines += 1;

        let Some((name, value)) = header.split_once(':') else {
            return Err(FrameError::Protocol(format!(
                "malformed header line without a colon: {header:?}"
            )));
        };
        if !name.trim().eq_ignore_ascii_case("content-length") {
            continue;
        }

        let raw = value.trim();
        let length: usize = raw.parse().map_err(|_| {
            FrameError::Protocol(format!(
                "Content-Length is not a non-negative integer: {raw:?}"
            ))
        })?;
        if length > MAX_FRAME_BYTES {
            return Err(FrameError::Protocol(format!(
                "Content-Length {length} exceeds the {MAX_FRAME_BYTES} byte frame limit"
            )));
        }
        if content_length.replace(length).is_some() {
            return Err(FrameError::Protocol(
                "duplicate Content-Length header".to_string(),
            ));
        }
    }

    let length = content_length
        .ok_or_else(|| FrameError::Protocol("missing Content-Length header".to_string()))?;

    let mut body = vec![0u8; length];
    reader.read_exact(&mut body)?;
    Ok(serde_json::from_slice(&body)?)
}

/// A child process spoken to over framing, with a background reader thread.
pub struct ProcessPipe {
    pub frames: Receiver<Result<serde_json::Value, FrameError>>,
    child: Child,
    stdin: ChildStdin,
    /// Set once the child has been killed and reaped, so `Drop` cannot signal a recycled pid.
    finished: bool,
}

impl ProcessPipe {
    /// Spawn the command and start pumping its stdout into `frames`.
    ///
    /// Stderr is piped as well and drained on its own thread: a chatty server that fills its stderr
    /// buffer would otherwise block on the write and look like a hang.
    pub fn spawn(command: &mut Command) -> io::Result<Self> {
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = command.spawn()?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| io::Error::other("child stdout was not piped"))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| io::Error::other("child stdin was not piped"))?;

        if let Some(mut stderr) = child.stderr.take() {
            let spawned = thread::Builder::new()
                .name("protocol-pipe-stderr".to_string())
                .spawn(move || {
                    let _ = io::copy(&mut stderr, &mut io::sink());
                });
            if spawned.is_err() {
                // Losing the drain thread is not fatal: the child keeps running and we stay usable.
                let _ = child.kill();
                let _ = child.wait();
                return Err(io::Error::other("failed to start the stderr drain thread"));
            }
        }

        let (sender, frames) = mpsc::channel();
        let reader = thread::Builder::new()
            .name("protocol-pipe-reader".to_string())
            .spawn(move || {
                let mut reader = BufReader::new(stdout);
                loop {
                    match read_frame(&mut reader) {
                        Ok(value) => {
                            if sender.send(Ok(value)).is_err() {
                                break;
                            }
                        }
                        Err(error) => {
                            let _ = sender.send(Err(error));
                            break;
                        }
                    }
                }
            });

        if let Err(error) = reader {
            let _ = child.kill();
            let _ = child.wait();
            return Err(io::Error::other(format!(
                "failed to start the reader thread: {error}"
            )));
        }

        Ok(ProcessPipe {
            frames,
            child,
            stdin,
            finished: false,
        })
    }

    /// Frame and send one JSON message.
    pub fn send(&mut self, value: &serde_json::Value) -> io::Result<()> {
        write_frame(&mut self.stdin, value)
    }

    /// Move the frame receiver out; sending stays available.
    ///
    /// The caller takes ownership of the stream from the child, which is what a protocol pump needs
    /// when it reads frames on its own thread. The pipe keeps a fresh, empty channel in the field's
    /// place, so the struct stays whole and `send` / `kill` behave exactly as before.
    pub fn take_frames(&mut self) -> Receiver<Result<serde_json::Value, FrameError>> {
        let (_sender, replacement) = mpsc::channel();
        std::mem::replace(&mut self.frames, replacement)
    }

    /// Terminate the child and reap it so no zombie is left behind.
    pub fn kill(&mut self) -> io::Result<()> {
        if self.finished {
            return Ok(());
        }
        let killed = self.child.kill();
        let reaped = self.child.wait();
        self.finished = true;
        match killed {
            // Already exited: `kill` reports it, but the wait above still reaped the process.
            Err(error) if error.kind() == io::ErrorKind::InvalidInput => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error),
            Ok(()) => reaped.map(|_| ()),
        }
    }
}

impl Drop for ProcessPipe {
    fn drop(&mut self) {
        let _ = self.kill();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Read};
    use std::sync::mpsc::RecvTimeoutError;
    use std::time::Duration;

    fn frame_bytes(value: &serde_json::Value) -> Vec<u8> {
        let mut buffer = Vec::new();
        write_frame(&mut buffer, value).expect("write_frame into a Vec");
        buffer
    }

    /// A reader that hands out at most a few bytes per `read` call, wrapped in a tiny `BufReader` so
    /// headers and bodies arrive in fragments rather than one buffer.
    struct Trickle<R> {
        inner: R,
        chunk: usize,
    }

    impl<R: Read> Read for Trickle<R> {
        fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
            let limit = buffer.len().min(self.chunk);
            self.inner.read(&mut buffer[..limit])
        }
    }

    #[test]
    fn roundtrip_preserves_value_and_uses_byte_length() {
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
    fn lowercase_names_and_extra_headers_are_accepted() {
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
    fn bare_lf_line_endings_are_accepted() {
        let body = br#"{"id":1}"#;
        let mut bytes = format!("Content-Length: {}\n\n", body.len()).into_bytes();
        bytes.extend_from_slice(body);

        let mut reader = Cursor::new(bytes);
        let value = read_frame(&mut reader).expect("LF-only framing");
        assert_eq!(value["id"], serde_json::json!(1));
    }

    #[test]
    fn missing_content_length_is_a_protocol_error() {
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
    fn non_numeric_content_length_is_a_protocol_error() {
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
    fn length_beyond_the_body_is_an_io_error() {
        let raw = b"Content-Length: 128\r\n\r\n{\"id\":1}".to_vec();
        let mut reader = Cursor::new(raw);
        let error = read_frame(&mut reader).expect_err("truncated body");
        match error {
            FrameError::Io(error) => assert_eq!(error.kind(), io::ErrorKind::UnexpectedEof),
            other => panic!("expected FrameError::Io(UnexpectedEof), got {other:?}"),
        }
    }

    #[test]
    fn truncated_header_block_is_a_protocol_error() {
        let raw = b"Content-Length: 10\r\n".to_vec();
        let mut reader = Cursor::new(raw);
        let error = read_frame(&mut reader).expect_err("header block never ends");
        assert!(
            matches!(error, FrameError::Protocol(_)),
            "expected FrameError::Protocol, got {error:?}"
        );
    }

    #[test]
    fn fragmented_reads_do_not_assume_a_single_buffer() {
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
    fn process_pipe_roundtrips_through_cat() {
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
