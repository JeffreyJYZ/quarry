//! Bounded waiting for a process that has been told to die.
//!
//! One helper, so the run panel and the pty layer cannot drift into two different answers to "how
//! long may a teardown block". The caller keeps the handle it asked about, so `true` proves the
//! process was reaped and `false` means it was signalled but not confirmed dead; the caller must
//! then finish the reap off its own thread.

use std::thread;
use std::time::{Duration, Instant};

/// How often a bounded wait looks at the child again.
pub const WAIT_INTERVAL: Duration = Duration::from_millis(20);

/// Longest a hard kill gets before the teardown stops waiting and hands the reap to a thread.
pub const KILL_GRACE: Duration = Duration::from_millis(500);

/// Polls `gone` until it answers true or `grace` runs out.
pub fn until_gone(mut gone: impl FnMut() -> bool, grace: Duration) -> bool {
    let deadline = Instant::now() + grace;
    loop {
        if gone() {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        thread::sleep(WAIT_INTERVAL);
    }
}
