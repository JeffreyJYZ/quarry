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

impl StderrCapture {
    /// Keep the beginning of `chunk`, dropping whatever no longer fits.
    pub(crate) fn push(&self, chunk: &[u8]) {
        let (lock, _) = &*self.inner;
        let mut buffer = lock.lock().unwrap_or_else(|poison| poison.into_inner());
        if buffer.bytes.len() >= STDERR_CAPTURE_LIMIT {
            return;
        }
        let room = STDERR_CAPTURE_LIMIT - buffer.bytes.len();
        buffer
            .bytes
            .extend_from_slice(&chunk[..room.min(chunk.len())]);
    }

    /// Mark the capture as finished, so a waiter stops waiting.
    pub(crate) fn finish(&self) {
        let (lock, condvar) = &*self.inner;
        let mut buffer = lock.lock().unwrap_or_else(|poison| poison.into_inner());
        buffer.complete = true;
        condvar.notify_all();
    }

    /// The captured bytes, as text.
    pub fn text(&self) -> String {
        let (lock, _) = &*self.inner;
        let buffer = lock.lock().unwrap_or_else(|poison| poison.into_inner());
        String::from_utf8_lossy(&buffer.bytes).into_owned()
    }

    /// Wait until the child's stderr ends, or the timeout passes, and return what it said.
    pub fn wait(&self, timeout: Duration) -> String {
        let deadline = std::time::Instant::now() + timeout;
        let (lock, condvar) = &*self.inner;
        let mut buffer = lock.lock().unwrap_or_else(|poison| poison.into_inner());
        while !buffer.complete {
            let remaining = deadline.saturating_duration_since(std::time::Instant::now());
            if remaining.is_zero() {
                break;
            }
            let (next, result) = condvar
                .wait_timeout(buffer, remaining)
                .unwrap_or_else(|poison| poison.into_inner());
            buffer = next;
            if result.timed_out() {
                break;
            }
        }
        String::from_utf8_lossy(&buffer.bytes).into_owned()
    }
}
