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

pub const OUTPUT_EVENT: &str = "pty://output";

pub const EXITED_EVENT: &str = "pty://exited";

pub const BUF_SIZE: usize = 8192;

#[derive(serde::Serialize)]
pub struct PtyOpenResult {
    pub id: String,
    pub pid: Option<u32>,
}

pub struct PtyState {
    pub(crate) sessions: Mutex<HashMap<String, Session>>,
    pub(crate) counter: AtomicU64,
}

impl Default for PtyState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            counter: AtomicU64::new(0),
        }
    }
}

pub struct Session {
    pub(crate) master: Box<dyn portable_pty::MasterPty + Send>,
    pub(crate) writer: Box<dyn Write + Send>,
    pub(crate) child: Arc<Mutex<Option<Box<dyn portable_pty::Child + Send + Sync>>>>,
}

impl PtyState {
    /// Kills every shell. Called when the app exits: a live PTY keeps the process group alive, and
    /// macOS then shows the app as still running in the background after its window is gone.
    pub fn shutdown_all(&self) {
        let sessions = lock(&self.sessions);
        for session in sessions.values() {
            if let Some(mut child) = lock(&session.child).take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
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

/// A Finder launch inherits a bare environment: without `TERM` a shell prints no prompt and picks no
/// colours, whichever shell reads it. Set the facts a login shell would otherwise have had.
pub fn apply_terminal_env(cmd: &mut CommandBuilder) {
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    // Only fill a gap: a locale the user chose must survive the app.
    for key in ["LANG", "LC_ALL"] {
        if std::env::var_os(key).is_none() {
            cmd.env(key, "en_US.UTF-8");
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
) -> Result<PtyOpenResult, String> {
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
    apply_terminal_env(&mut cmd);
    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("cannot spawn shell in {cwd}: {e}"))?;
    let pid = child.process_id();
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
            if let Some(mut c) = lock(&child).take() {
                let _ = c.kill();
                let _ = c.wait();
            }
            lock(&state.sessions).remove(&id);
            format!("cannot start reader: {e}")
        })?;

    Ok(PtyOpenResult { id, pid })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_env_carries_term_and_colour() {
        let mut cmd = CommandBuilder::new("/bin/sh");
        apply_terminal_env(&mut cmd);
        let envs: Vec<(&str, &str)> = cmd.iter_extra_env_as_str().collect();
        assert!(envs.contains(&("TERM", "xterm-256color")));
        assert!(envs.contains(&("COLORTERM", "truecolor")));
    }
}
