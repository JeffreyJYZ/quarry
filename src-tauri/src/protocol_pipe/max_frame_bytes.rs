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

/// Largest body this crate is willing to allocate for a single frame. A declared length beyond this
/// is treated as a protocol error rather than trusted with an allocation.
pub const MAX_FRAME_BYTES: usize = 64 * 1024 * 1024;

/// Largest number of stderr bytes kept for a failure message. A server that dies at startup
/// explains itself there, and a protocol error on its own says nothing.
pub const STDERR_CAPTURE_LIMIT: usize = 2000;

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
    pub(crate) child: Child,
    pub(crate) stdin: ChildStdin,
    /// Set once the child has been killed and reaped, so `Drop` cannot signal a recycled pid.
    pub(crate) finished: bool,
    /// The child's stderr, drained and kept to [`STDERR_CAPTURE_LIMIT`] bytes.
    pub(crate) stderr: StderrCapture,
}

/// A bounded capture of what a child wrote to stderr.
///
/// The child's stderr is drained either way, so a chatty server never blocks on a full pipe. This
/// keeps the first [`STDERR_CAPTURE_LIMIT`] bytes, because a server that dies at startup says
/// why there and nowhere else.
#[derive(Clone, Default)]
pub struct StderrCapture {
    pub(crate) inner: Arc<(Mutex<StderrBuffer>, Condvar)>,
}

#[derive(Default)]
pub struct StderrBuffer {
    pub(crate) bytes: Vec<u8>,
    /// Set when the child's stderr reached its end.
    pub(crate) complete: bool,
}
