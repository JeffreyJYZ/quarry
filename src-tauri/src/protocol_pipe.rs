//! Content-Length framing shared by LSP and DAP.
//!
//! Unit U3 owns the body of this file. Contract: JSON-RPC over stdio, `Content-Length` header with
//! case-insensitive names, CRLF or LF line endings, and a reader thread per child process. DAP speaks
//! the same framing as LSP, so one implementation serves both.

use std::io::{self, BufRead, Read, Write};
use std::process::{Child, ChildStdin, Command};
use std::sync::mpsc::Receiver;

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

/// Write one framed JSON body.
pub fn write_frame<W: Write>(_writer: &mut W, _value: &serde_json::Value) -> io::Result<()> {
    // STUB: U3 replaces this.
    unimplemented!("write_frame is implemented by unit U3")
}

/// Read one framed JSON body.
pub fn read_frame<R: BufRead>(_reader: &mut R) -> Result<serde_json::Value, FrameError> {
    // STUB: U3 replaces this.
    unimplemented!("read_frame is implemented by unit U3")
}

/// A child process spoken to over framing, with a background reader thread.
pub struct ProcessPipe {
    pub frames: Receiver<Result<serde_json::Value, FrameError>>,
    child: Child,
    stdin: ChildStdin,
}

impl ProcessPipe {
    /// Spawn the command and start pumping its stdout into `frames`.
    pub fn spawn(_command: &mut Command) -> io::Result<Self> {
        // STUB: U3 replaces this.
        unimplemented!("ProcessPipe::spawn is implemented by unit U3")
    }

    /// Frame and send one JSON message.
    pub fn send(&mut self, _value: &serde_json::Value) -> io::Result<()> {
        write_frame(&mut self.stdin, _value)
    }

    /// Terminate the child.
    pub fn kill(&mut self) -> io::Result<()> {
        self.child.kill()
    }
}

/// Keeps `Read` in the import list for the reader-thread implementation.
#[allow(dead_code)]
fn _assert_read<R: Read>(_value: R) {}
