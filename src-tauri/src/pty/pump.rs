#![allow(unused_imports)]

pub use portable_pty::{CommandBuilder, PtySize, native_pty_system};
pub use serde_json::{Value, json};
pub use std::collections::HashMap;
pub use std::io::{Read, Write};
pub use std::path::{Path, PathBuf};
pub use std::sync::atomic::{AtomicU64, Ordering};
pub use std::sync::{Arc, Mutex, MutexGuard};
pub use std::thread;
pub use tauri::{AppHandle, Emitter, State};

use super::*;

/// The reader thread of one terminal: stream its output, reap the shell, emit the exit, retire the
/// session. Retiring here is what closes the master and writer descriptors, which otherwise stay open
/// until the tab is closed even though the shell is long gone.
pub fn pump(
    reader: Box<dyn Read + Send>,
    app: &AppHandle,
    id: &str,
    session: &Arc<Session>,
    sessions: &Sessions,
) {
    pump_into(
        reader,
        |event, payload| {
            let _ = app.emit(event, payload);
        },
        id,
        session,
        sessions,
    );
}

/// The pump body with emitting behind a callback, so a test can drive the exit path without an
/// `AppHandle`. Everything else — the decode, the exit code, the retirement — is the production path.
pub fn pump_into(
    mut reader: Box<dyn Read + Send>,
    emit: impl Fn(&str, Value),
    id: &str,
    session: &Arc<Session>,
    sessions: &Sessions,
) {
    let mut buf = vec![0u8; BUF_SIZE];
    let mut stream = Utf8Stream::default();
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                // A character can straddle two reads, so the decoder holds its incomplete tail.
                let data = stream.push(&buf[..n]);
                if !data.is_empty() {
                    emit(OUTPUT_EVENT, output_payload(id, data));
                }
            }
            Err(_) => break,
        }
    }
    let rest = stream.finish();
    if !rest.is_empty() {
        emit(OUTPUT_EVENT, output_payload(id, rest));
    }
    let code = {
        // Take the handle out under its guard and wait outside it, so a stalled reap here cannot
        // block `close` or teardown.
        let taken = lock(&session.child).take();
        match taken {
            Some(mut child) => child.wait().ok().map(|status| status.exit_code() as i32),
            None => None,
        }
    };
    emit(EXITED_EVENT, exited_payload(id, code));
    // After the event, so the frontend still learns the exit code; the guard refuses to retire a
    // session that reused this id while the pump was draining.
    retire(sessions, id, session);
}
