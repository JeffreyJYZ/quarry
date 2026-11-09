#![allow(unused_imports)]

pub(crate) use crate::protocol_pipe::{FrameError, ProcessPipe};
pub(crate) use crate::resolve;
pub use serde_json::{Map, Value, json};
pub use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
pub use std::thread;
pub use std::time::{Duration, Instant};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_5 {
    use super::*;

    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::mpsc::channel;

    /// Short enough to keep a test quick, long enough to prove the loop polls more than once.
    pub const TEST_POLL: Duration = Duration::from_millis(10);

    fn event(name: &str) -> Value {
        json!({ "type": "event", "event": name })
    }

    #[test]
    pub fn a_dead_adapter_ends_the_wait() {
        let (_sender, frames) = channel::<Result<Value, FrameError>>();
        let started = Instant::now();
        let next = wait_frame(&frames, || false, TEST_POLL);
        assert!(next.is_none(), "a dead adapter has no next frame");
        assert!(
            started.elapsed() < Duration::from_secs(1),
            "the wait ended on the first poll: {:?}",
            started.elapsed()
        );
    }

    #[test]
    pub fn a_live_adapter_keeps_waiting_through_empty_polls() {
        let (sender, frames) = channel::<Result<Value, FrameError>>();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(60));
            let _ = sender.send(Ok(event("stopped")));
        });

        let polls = Arc::new(AtomicU32::new(0));
        let counted = Arc::clone(&polls);
        let next = wait_frame(
            &frames,
            move || {
                counted.fetch_add(1, Ordering::SeqCst);
                true
            },
            TEST_POLL,
        )
        .expect("the frame that arrives at 60ms");

        assert_eq!(next.get("event").and_then(Value::as_str), Some("stopped"));
        assert!(
            polls.load(Ordering::SeqCst) >= 2,
            "silence must not end a live session; polls: {}",
            polls.load(Ordering::SeqCst)
        );
    }

    #[test]
    pub fn a_closed_stream_ends_the_wait() {
        let (sender, frames) = channel::<Result<Value, FrameError>>();
        drop(sender);
        assert!(wait_frame(&frames, || true, TEST_POLL).is_none());
    }

    #[test]
    pub fn the_poll_interval_bounds_the_death_check() {
        let (_sender, frames) = channel::<Result<Value, FrameError>>();
        let started = Instant::now();
        assert!(wait_frame(&frames, || false, Duration::from_millis(40)).is_none());
        assert!(
            started.elapsed() < Duration::from_secs(1),
            "one poll is all a death takes: {:?}",
            started.elapsed()
        );
    }
}
