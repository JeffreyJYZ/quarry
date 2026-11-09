#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use serde_json::{Value, json};
pub use std::collections::HashMap;
pub use std::io::{self, BufRead, BufReader, ErrorKind, Read};
pub use std::path::{Path, PathBuf};
pub use std::process::{Child, Command, Stdio};
pub use std::sync::atomic::{AtomicU64, Ordering};
pub use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
pub use std::sync::{Arc, Mutex, MutexGuard};
pub use std::thread;
pub use std::time::Duration;
pub use tauri::{AppHandle, Emitter, State};

use super::*;

/// One piece of a display row. `more` means the same row continues in the next chunk of its stream.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Chunk {
    pub text: String,
    pub more: bool,
}

/// What a reader hands the emitter. The emitter is the only thread that emits, so it owns the order.
pub enum RunEvent {
    Line {
        stream: &'static str,
        chunk: Chunk,
    },
    /// One stream reached EOF, so no further line of it can arrive.
    StreamEnd,
    /// The child was reaped; `None` is a kill by signal.
    Exit(Exit),
}

/// Wire payload for one output chunk; `seq` is unique per run and strictly increasing.
pub fn output_payload(run_id: &str, seq: u64, stream: &str, chunk: &Chunk) -> Value {
    json!({
        "runId": run_id,
        "seq": seq,
        "stream": stream,
        "line": chunk.text,
        "more": chunk.more,
    })
}

/// Wire payload for the end of a run; a `None` code is a kill, and `signal` names what killed it.
pub fn exited_payload(run_id: &str, seq: u64, exit: Exit) -> Value {
    json!({
        "runId": run_id,
        "seq": seq,
        "code": exit.code,
        "signal": exit.signal,
    })
}

/// Read one stream until its pipe closes, handing every piece to `sink` as soon as it arrives.
///
/// A complete line is emitted when its newline arrives. Whatever is left of a read is emitted at
/// once with `more` set: holding it until the newline is what left the console blank while a
/// program printed a prompt or a progress bar and the newline never came.
pub fn pump<R: Read>(mut reader: R, mut sink: impl FnMut(Chunk)) -> io::Result<()> {
    let mut buffer = [0u8; MAX_LINE_BYTES];
    let mut pending: Vec<u8> = Vec::new();

    loop {
        let read = match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => count,
            Err(error) if error.kind() == ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        };
        pending.extend_from_slice(&buffer[..read]);
        while let Some(end) = pending.iter().position(|byte| *byte == b'\n') {
            let mut line: Vec<u8> = pending.drain(..=end).collect();
            strip_terminator(&mut line);
            for chunk in chunks_of(&line, false) {
                sink(chunk);
            }
        }
        if !pending.is_empty() {
            for chunk in chunks_of(&pending, true) {
                sink(chunk);
            }
            pending.clear();
        }
    }

    Ok(())
}

/// One detached thread per stream: it reads until EOF, then says so, so the exit can follow it.
pub fn spawn_reader<R: Read + Send + 'static>(
    run_id: &str,
    stream: &'static str,
    reader: R,
    events: Sender<RunEvent>,
) -> io::Result<()> {
    thread::Builder::new()
        .name(format!("{run_id}-{stream}"))
        .spawn(move || {
            let _ = pump(reader, |chunk| {
                let _ = events.send(RunEvent::Line { stream, chunk });
            });
            let _ = events.send(RunEvent::StreamEnd);
        })
        .map(drop)
}
