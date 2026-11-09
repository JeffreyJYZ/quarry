use super::*;
use std::time::Instant;

/// How often a bounded shutdown wait looks at the child.
pub const EXIT_POLL_INTERVAL: Duration = Duration::from_millis(10);

impl ProcessPipe {
    /// Wait up to `timeout` for the child to exit on its own, reaping it.
    ///
    /// `false` means it is still running, so the caller must kill it. `wait` is the wrong tool: an
    /// adapter whose debuggee holds the pipe open would hang the caller, while `try_wait` only
    /// reaps the adapter itself.
    pub fn wait_exit(&mut self, timeout: Duration) -> bool {
        if self.finished {
            return true;
        }
        let deadline = Instant::now() + timeout;
        loop {
            match self.child.try_wait() {
                Ok(Some(_)) => {
                    self.finished = true;
                    return true;
                }
                Ok(None) => {}
                Err(_) => {
                    self.finished = true;
                    return true;
                }
            }
            if Instant::now() >= deadline {
                return false;
            }
            thread::sleep(EXIT_POLL_INTERVAL);
        }
    }
}
