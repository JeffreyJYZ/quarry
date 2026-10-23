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

impl ProcessPipe {
    /// Spawn the command and start pumping its stdout into `frames`.
    ///
    /// Stderr is piped as well and drained on its own thread: a chatty server that fills its stderr
    /// buffer would otherwise block on the write and look like a hang.
    pub fn spawn(command: &mut Command) -> io::Result<Self> {
        Self::spawn_with_stderr(command).map(|(pipe, _)| pipe)
    }

    /// Spawn the command and hand back the capture of its stderr alongside the pipe.
    ///
    /// The stderr capture is what makes a server that dies at startup diagnosable: the protocol
    /// error alone only says the stream ended.
    pub fn spawn_with_stderr(command: &mut Command) -> io::Result<(Self, StderrCapture)> {
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

        let stderr_capture = StderrCapture::default();
        if let Some(mut stderr) = child.stderr.take() {
            let capture = stderr_capture.clone();
            let spawned = thread::Builder::new()
                .name("protocol-pipe-stderr".to_string())
                .spawn(move || {
                    let mut chunk = [0u8; 4096];
                    loop {
                        match stderr.read(&mut chunk) {
                            Ok(0) => break,
                            Ok(count) => capture.push(&chunk[..count]),
                            Err(_) => break,
                        }
                    }
                    capture.finish();
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

        Ok((
            ProcessPipe {
                frames,
                child,
                stdin,
                finished: false,
                stderr: stderr_capture.clone(),
            },
            stderr_capture,
        ))
    }

    /// The child's stderr, as captured so far.
    pub fn stderr_text(&self) -> String {
        self.stderr.text()
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
