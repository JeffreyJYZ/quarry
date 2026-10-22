//! Terminal sessions backed by a real pseudo-terminal.
#![allow(dead_code)]

use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use tauri::{AppHandle, Emitter, State};

const OUTPUT_EVENT: &str = "pty://output";
const EXITED_EVENT: &str = "pty://exited";
const BUF_SIZE: usize = 8192;

pub struct PtyState {
    sessions: Mutex<HashMap<String, Session>>,
    counter: AtomicU64,
}

impl Default for PtyState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            counter: AtomicU64::new(0),
        }
    }
}

struct Session {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Arc<Mutex<Option<Box<dyn portable_pty::Child + Send + Sync>>>>,
}

impl Drop for PtyState {
    fn drop(&mut self) {
        let sessions = lock(&self.sessions);
        for session in sessions.values() {
            if let Some(mut child) = lock(&session.child).take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[tauri::command]
pub async fn pty_open(
    app: AppHandle,
    state: State<'_, PtyState>,
    cwd: String,
    rows: u16,
    cols: u16,
) -> Result<String, String> {
    let cwd_path = validate_cwd(&cwd)?;
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("cannot open pty: {e}"))?;
    let mut cmd = CommandBuilder::new(&shell);
    cmd.cwd(&cwd_path);
    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("cannot spawn shell in {cwd}: {e}"))?;
    let child = Arc::new(Mutex::new(Some(child)));
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("cannot take writer: {e}"))?;
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("cannot clone reader: {e}"))?;

    let id = next_id(&state.counter);

    let session = Session {
        master: pair.master,
        writer,
        child: Arc::clone(&child),
    };
    lock(&state.sessions).insert(id.clone(), session);

    // reader thread
    let app2 = app.clone();
    let id2 = id.clone();
    let child2 = Arc::clone(&child);
    thread::Builder::new()
        .name(format!("{id}-reader"))
        .spawn(move || pump(reader, &app2, &id2, child2))
        .map_err(|e| {
            lock(&state.sessions).remove(&id);
            format!("cannot start reader: {e}")
        })?;

    Ok(id)
}

#[tauri::command]
pub async fn pty_write(state: State<'_, PtyState>, id: String, data: String) -> Result<(), String> {
    let mut sessions = lock(&state.sessions);
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| format!("unknown pty session: {id}"))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("cannot write to {id}: {e}"))?;
    session
        .writer
        .flush()
        .map_err(|e| format!("cannot flush {id}: {e}"))?;
    Ok(())
}

// We need mutable access to writer; restructure.

fn validate_cwd(cwd: &str) -> Result<PathBuf, String> {
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

fn next_id(counter: &AtomicU64) -> String {
    format!("pty-{}", counter.fetch_add(1, Ordering::SeqCst) + 1)
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
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
pub fn chunk_to_string(bytes: &[u8]) -> String {
    lossy_chunk(bytes)
}
pub fn utf8_lossy(bytes: &[u8]) -> String {
    lossy_chunk(bytes)
}
pub fn bytes_to_string(bytes: &[u8]) -> String {
    lossy_chunk(bytes)
}

fn pump(
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pty_ids_count_from_one() {
        assert_eq!(pty_id(1), "pty-1");
        let c = AtomicU64::new(0);
        assert_eq!(next_id(&c), "pty-1");
        assert_eq!(next_id(&c), "pty-2");
    }

    #[test]
    fn cwd_rejects_relative() {
        let e = validate_cwd("relative/dir").unwrap_err();
        assert!(e.contains("relative/dir"));
        assert!(e.contains("absolute"));
    }

    #[test]
    fn cwd_rejects_missing() {
        let e = validate_cwd("/no/such/dir/quarry").unwrap_err();
        assert!(e.contains("/no/such/dir/quarry"));
        assert!(e.contains("directory") || e.contains("existing"));
    }

    #[test]
    fn lossy_conversion() {
        assert_eq!(lossy_chunk(b"ok\xff"), "ok\u{fffd}");
    }

    #[test]
    fn payloads() {
        let o = output_payload("pty-1", "hi".to_string());
        assert_eq!(o["id"], "pty-1");
        assert_eq!(o["data"], "hi");
        let e = exited_payload("pty-1", Some(0));
        assert_eq!(e["id"], "pty-1");
        assert_eq!(e["code"], 0);
        let k = exited_payload("pty-1", None);
        assert!(k["code"].is_null());
    }
}
