#![allow(unused_imports)]

use super::*;

// Lock order is one-way: the map lock is taken only to clone or move an `Arc<Session>`, and it is
// always released before a session's own `writer`/`master`/`child` lock is taken. No path here holds
// both, so a stalled terminal cannot block the map and the map cannot deadlock against a session.
impl PtyState {
    /// Clones the handle and lets the map guard drop before any session I/O. Holding the map across
    /// `write_all`, `flush` or `resize` stalls every other terminal command.
    pub fn session(&self, id: &str) -> Result<Arc<Session>, String> {
        let sessions = lock(&self.sessions);
        sessions
            .get(id)
            .cloned()
            .ok_or_else(|| format!("unknown pty session: {id}"))
    }

    pub fn insert_session(&self, id: String, session: Arc<Session>) {
        lock(&self.sessions).insert(id, session);
    }

    pub fn take_session(&self, id: &str) -> Option<Arc<Session>> {
        lock(&self.sessions).remove(id)
    }

    pub fn write(&self, id: &str, data: &[u8]) -> Result<(), String> {
        self.session(id)?.write(id, data)
    }

    pub fn resize(&self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        self.session(id)?.resize(id, rows, cols)
    }

    /// Drops the session once every clone is gone; that final drop closes the master and writer
    /// descriptors, so closing a tab does not leak them.
    pub fn close(&self, id: &str) -> Result<(), String> {
        if let Some(session) = self.take_session(id) {
            kill_spawned(&session.child);
        }
        Ok(())
    }

    /// Kills every shell and forgets it, so the map cannot hand a dead shell back out. Called when
    /// the window is destroyed and again on exit: a live PTY keeps the process group alive, and
    /// macOS then shows the app as still running in the background after its window is gone.
    /// The map is emptied under its guard and released before any kill, so a shell that cannot be
    /// reaped blocks at most `KILL_GRACE` and never another terminal command.
    pub fn shutdown_all(&self) {
        let sessions: Vec<Arc<Session>> = {
            let mut map = lock(&self.sessions);
            map.drain().map(|(_, session)| session).collect()
        };
        for session in sessions {
            kill_spawned(&session.child);
        }
    }
}

/// Removes `id` only while it still maps to `session`. A pump that finishes after its id was reused
/// must not retire the session that reused it, so identity is the handle, never the id.
pub fn retire(sessions: &Sessions, id: &str, session: &Arc<Session>) -> bool {
    let mut map = lock(sessions);
    let own = map
        .get(id)
        .is_some_and(|current| Arc::ptr_eq(current, session));
    if own {
        map.remove(id);
    }
    own
}
