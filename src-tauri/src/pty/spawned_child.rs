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

use crate::teardown::{KILL_GRACE, until_gone};

use super::*;

/// portable-pty's `Child` has no `Drop` impl: dropping the handle leaves the shell running with the
/// user's cwd and the pty attached, so every failure after a successful spawn has to kill and reap
/// it here. `kill` alone leaves a zombie, hence the `wait`.
///
/// The wait is bounded: one shell the kernel will not reap cannot freeze app teardown or every other
/// terminal command behind the sessions lock. A child that outlives `KILL_GRACE` is reaped on its own
/// thread instead, so the descriptor is still released and no zombie is left for the app.
pub fn kill_spawned(child: &ChildHandle) {
    // Take it out under the child guard, then let the guard drop: `wait` must never run under it.
    let taken = lock(child).take();
    let Some(mut spawned) = taken else {
        return;
    };
    let _ = spawned.kill();
    if until_gone(|| !matches!(spawned.try_wait(), Ok(None)), KILL_GRACE) {
        return;
    }
    let _ = thread::Builder::new()
        .name("pty-reaper".to_string())
        .spawn(move || {
            let _ = spawned.wait();
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn kill_spawned_reaps_the_shell() {
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("open a pty");
        let mut cmd = CommandBuilder::new("/bin/sleep");
        cmd.arg("60");
        let spawned = pair.slave.spawn_command(cmd).expect("spawn sleep");
        let pid = spawned.process_id().expect("pid") as i32;
        let child = Arc::new(Mutex::new(Some(spawned)));
        assert_eq!(unsafe { libc::kill(pid, 0) }, 0, "sleep should be running");

        kill_spawned(&child);

        assert_eq!(unsafe { libc::kill(pid, 0) }, -1, "sleep should be gone");
        assert_eq!(
            std::io::Error::last_os_error().raw_os_error(),
            Some(libc::ESRCH)
        );
    }
}
