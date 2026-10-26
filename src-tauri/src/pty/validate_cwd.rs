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

// We need mutable access to writer; restructure.

pub fn validate_cwd(cwd: &str) -> Result<PathBuf, String> {
    let path = Path::new(cwd);
    if !path.is_absolute() {
        return Err(format!(
            "cannot open a terminal in {cwd:?}: the working directory must be absolute"
        ));
    }
    if !path.is_dir() {
        return Err(format!(
            "cannot open a terminal in {cwd:?}: it is not an existing directory"
        ));
    }
    Ok(path.to_path_buf())
}

pub fn next_id(counter: &AtomicU64) -> String {
    format!("pty-{}", counter.fetch_add(1, Ordering::SeqCst) + 1)
}

pub fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

// placeholder helpers for tests
#[tauri::command]
pub async fn pty_resize(
    state: State<'_, PtyState>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let sessions = lock(&state.sessions);
    let session = sessions
        .get(&id)
        .ok_or_else(|| format!("unknown pty session: {id}"))?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("cannot resize {id}: {e}"))
}

#[tauri::command]
pub async fn pty_close(state: State<'_, PtyState>, id: String) -> Result<(), String> {
    let session = lock(&state.sessions).remove(&id);
    if let Some(session) = session {
        if let Some(mut child) = lock(&session.child).take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        // Drop the master and writer so their descriptors do not leak per closed tab.
        drop(session.writer);
        drop(session.master);
    }
    Ok(())
}

pub fn pty_id(n: u64) -> String {
    format!("pty-{n}")
}

pub fn output_payload(id: &str, data: String) -> Value {
    json!({ "id": id, "data": data })
}

pub fn exited_payload(id: &str, code: Option<i32>) -> Value {
    json!({ "id": id, "code": code })
}

pub fn lossy_chunk(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

pub fn pump(
    reader: Box<dyn Read + Send>,
    app: &AppHandle,
    id: &str,
    child: Arc<Mutex<Option<Box<dyn portable_pty::Child + Send + Sync>>>>,
) {
    let mut reader = reader;
    let mut buf = vec![0u8; BUF_SIZE];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                let _ = app.emit(OUTPUT_EVENT, output_payload(id, data));
            }
            Err(_) => break,
        }
    }
    let code = {
        let mut guard = lock(&child);
        if let Some(mut c) = guard.take() {
            c.wait().ok().map(|s| s.exit_code() as i32)
        } else {
            None
        }
    };
    let payload = exited_payload(id, code);
    let _ = app.emit(EXITED_EVENT, payload);
}
