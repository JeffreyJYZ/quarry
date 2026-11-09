//! One event per burst.
//!
//! A save, a `git checkout` or a formatter run produces dozens of paths within a few milliseconds.
//! The coalescer holds them until the burst has been quiet for one window, then hands the whole set
//! out once. It takes `now` from the caller, so the decision is a pure function of its inputs and a
//! test needs no sleeping.

use super::*;

/// Collects changed paths that fall inside one debounce window.
pub struct Coalescer {
    window: Duration,
    pending: std::collections::BTreeSet<String>,
    deadline: Option<Instant>,
}

impl Coalescer {
    pub fn new(window: Duration) -> Self {
        Self {
            window,
            pending: std::collections::BTreeSet::new(),
            deadline: None,
        }
    }

    /// Record one changed path; the batch becomes due `window` after the latest of them.
    pub fn push(&mut self, path: String, now: Instant) {
        self.pending.insert(path);
        self.deadline = Some(now + self.window);
    }

    /// Take the whole batch once the window has passed, sorted so two runs emit the same order.
    ///
    /// `None` while the burst is still open, which is what keeps N rapid events for one path down to
    /// one entry in one event.
    pub fn take(&mut self, now: Instant) -> Option<Vec<String>> {
        let deadline = self.deadline?;
        if now < deadline {
            return None;
        }
        self.deadline = None;
        Some(std::mem::take(&mut self.pending).into_iter().collect())
    }

    /// How long the caller may block waiting for another event before it must poll [`take`].
    ///
    /// [`take`]: Coalescer::take
    pub fn wait(&self, now: Instant) -> Duration {
        match self.deadline {
            Some(deadline) if deadline > now => deadline - now,
            _ => Duration::from_millis(20),
        }
    }

    #[cfg(test)]
    pub fn is_empty(&self) -> bool {
        self.pending.is_empty()
    }
}
