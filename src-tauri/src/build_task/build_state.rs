#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
pub use serde_json::Value;
pub use std::collections::HashSet;
pub use std::path::Path;
pub use std::process::{Child, Command, Stdio};
pub use std::sync::{Arc, Mutex, MutexGuard};
pub use std::time::Instant;
pub use tauri::State;

use super::*;
use crate::run_task::{Stop, Terminated, lock, stop_tree};

/// A second build is refused rather than clobbering the child the first one still needs a stop for.
pub const ALREADY_BUILDING: &str = "a build is already running: stop it before starting another";

/// The build's child, shared between the thread that waits on it and the stop that takes it.
pub type Slot = Arc<Mutex<Option<Child>>>;

/// The one build in flight, and the handle a stop or the shutdown path needs to reach it.
///
/// The child lives here rather than on the stack of the blocking thread that waits for it: with no
/// owner outside that thread, a cancelled build kept compiling and quitting mid-build left the
/// compiler behind as an orphan, because nothing held a pid to signal.
///
/// Cheap to clone, so the managed copy and the blocking task share one slot. `begin` admits a
/// single child at a time, which is what makes one stop button enough.
#[derive(Clone, Default)]
pub struct BuildState {
    current: Arc<Mutex<Option<Slot>>>,
}

impl BuildState {
    /// Track `child` as the build in flight; a second build is refused and the newcomer is killed.
    pub fn begin(&self, child: Child) -> Result<Slot, String> {
        let mut current = lock(&self.current);
        if current.is_some() {
            drop(current);
            let _ = stop_tree(child);
            return Err(ALREADY_BUILDING.to_string());
        }
        let slot: Slot = Arc::new(Mutex::new(Some(child)));
        *current = Some(Arc::clone(&slot));
        Ok(slot)
    }

    /// Forget `slot`, and only while it is still the build that was tracked.
    pub fn finish(&self, slot: &Slot) {
        let mut current = lock(&self.current);
        if current
            .as_ref()
            .is_some_and(|tracked| Arc::ptr_eq(tracked, slot))
        {
            *current = None;
        }
    }

    /// The tracked build, still tracked: a stop leaves the slot in place so its own wait can end it.
    fn tracked(&self) -> Option<Slot> {
        lock(&self.current).clone()
    }

    /// Take the tracked build out for good; only the shutdown path does this.
    fn take(&self) -> Option<Slot> {
        lock(&self.current).take()
    }

    /// The pid of the build in flight, which is also the id of its process group on unix.
    #[allow(dead_code)] // read by the tests that prove the child is reachable from the state
    pub fn pid(&self) -> Option<u32> {
        let slot = lock(&self.current).clone()?;
        lock(&slot).as_ref().map(Child::id)
    }

    /// `true` while the tracked child is still alive.
    #[allow(dead_code)] // read by the tests that prove the child is reachable from the state
    pub fn is_running(&self) -> bool {
        let Some(slot) = lock(&self.current).clone() else {
            return false;
        };
        let mut guard = lock(&slot);
        matches!(guard.as_mut().map(Child::try_wait), Some(Ok(None)))
    }

    /// Stop the build's whole process group; nothing running is a quiet no-op, not an error.
    pub fn stop(&self) -> Result<Stop, String> {
        let Some(slot) = self.tracked() else {
            return Ok(Stop::quiet());
        };
        let Some(child) = lock(&slot).take() else {
            // The wait reaped it and the report is already on its way, or a stop took it first.
            return Ok(Stop::quiet());
        };

        match stop_tree(child) {
            Terminated::Stopped(stop) => Ok(stop),
            Terminated::Failed { child, error } => {
                // Hand it back so the wait, or the run's own cleanup, kills it rather than leaking
                // a child nobody holds a pid for any more.
                lock(&slot).replace(child);
                Err(format!("cannot stop the build: {error}"))
            }
        }
    }

    /// Kill whatever is left of the build; the exit path runs this so no compiler outlives the window.
    pub fn shutdown_all(&self) {
        let Some(slot) = self.take() else {
            return;
        };
        if let Some(child) = lock(&slot).take() {
            let _ = stop_tree(child);
        }
    }
}

/// Stop the build in flight, its whole group, the same way a program run is stopped.
#[tauri::command]
pub async fn stop_build(state: State<'_, BuildState>) -> Result<Stop, String> {
    // The signal and its bounded wait block, so they run off the async runtime.
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.stop())
        .await
        .map_err(|error| format!("cannot stop the build: {error}"))?
}
