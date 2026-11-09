//! The watcher the app owns: at most one, replaced on a project switch, dropped on quit.

use super::*;

/// Holds the live watcher. Starting a project replaces the previous one.
#[derive(Default)]
pub struct WatchState {
    current: Mutex<Option<WatchHandle>>,
}

impl WatchState {
    /// Watch `root`, stopping whatever was watched before. A repeated start for the same root is a
    /// no-op, so a re-rendered effect cannot open a second watch just to close it again.
    pub fn start(&self, app: AppHandle, root: String) -> Result<(), String> {
        let previous = {
            let mut slot = self.slot();
            if slot.as_ref().is_some_and(|handle| handle.root() == root) {
                return Ok(());
            }
            slot.take()
        };
        if let Some(previous) = previous {
            previous.stop();
        }
        let handle = WatchHandle::start(app, root)?;
        *self.slot() = Some(handle);
        Ok(())
    }

    /// Stop watching; a project close and a project switch both land here.
    pub fn stop(&self) {
        let handle = self.slot().take();
        if let Some(handle) = handle {
            handle.stop();
        }
    }

    /// App quit: nothing is left watching a tree that is going away.
    pub fn shutdown_all(&self) {
        self.stop();
    }

    /// A poisoned lock still owns a handle, so it is recovered rather than unwrapped.
    fn slot(&self) -> std::sync::MutexGuard<'_, Option<WatchHandle>> {
        self.current
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}
