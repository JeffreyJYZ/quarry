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

/// Streams a run reads: the exit is reported once both have ended.
pub const STREAMS: usize = 2;

/// How long the exit waits for the pipes once the child is reaped; a grandchild holding one open
/// must not keep the console from saying the program finished.
pub const EXIT_GRACE: Duration = Duration::from_secs(2);

/// The one place output becomes ordered events: one thread, one counter.
///
/// Both readers push into the channel as their pipe delivers, so the emitter numbers what it
/// receives and emits it immediately; stdout and stderr therefore interleave in the order the
/// program wrote them rather than in two batches. The exit is emitted last, after both readers have
/// reached EOF, so no line of the run can arrive behind its exit line.
pub fn emit_ordered(
    run_id: &str,
    events: Receiver<RunEvent>,
    on_output: &mut impl FnMut(Value),
    on_exit: &mut impl FnMut(Value),
) {
    let mut seq: u64 = 0;
    let mut ended = 0usize;
    let mut exit: Option<Exit> = None;

    loop {
        let event = if exit.is_some() {
            // The child is gone, so no line can still be in flight for long: a pipe a grandchild
            // holds open must not keep the console from reporting the exit.
            events.recv_timeout(EXIT_GRACE).ok()
        } else {
            events.recv().ok()
        };
        let Some(event) = event else {
            break;
        };
        match event {
            RunEvent::Line { stream, chunk } => {
                seq = seq.saturating_add(1);
                on_output(output_payload(run_id, seq, stream, &chunk));
            }
            RunEvent::StreamEnd => ended = ended.saturating_add(1),
            RunEvent::Exit(status) => exit = Some(status),
        }
        if ended == STREAMS && exit.is_some() {
            break;
        }
    }

    if let Some(status) = exit {
        seq = seq.saturating_add(1);
        on_exit(exited_payload(run_id, seq, status));
    }
}

/// Detached thread that drains the channel in order and emits; it ends with the run.
pub fn spawn_emitter(app: &AppHandle, run_id: &str, events: Receiver<RunEvent>) -> io::Result<()> {
    let app = app.clone();
    let id = run_id.to_string();
    thread::Builder::new()
        .name(format!("{run_id}-emitter"))
        .spawn(move || {
            emit_ordered(
                &id,
                events,
                &mut |payload| {
                    let _ = app.emit(OUTPUT_EVENT, payload);
                },
                &mut |payload| {
                    let _ = app.emit(EXITED_EVENT, payload);
                },
            );
        })
        .map(drop)
}

/// Detached thread that reaps the child, reports its exit, then forgets the run.
pub fn spawn_waiter(
    run_id: &str,
    entry: Arc<Mutex<Option<Child>>>,
    runs: Arc<Mutex<Runs>>,
    stdin: Arc<Mutex<StdinHandles>>,
    events: Sender<RunEvent>,
) -> io::Result<()> {
    let id = run_id.to_string();
    thread::Builder::new()
        .name(format!("{run_id}-waiter"))
        .spawn(move || {
            let status = wait_for_exit(&entry);
            let _ = events.send(RunEvent::Exit(status));
            lock(&stdin).remove(&id);
            lock(&runs).remove(&id);
        })
        .map(drop)
}
