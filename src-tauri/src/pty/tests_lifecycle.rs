#![allow(unused_imports)]

pub use portable_pty::{CommandBuilder, PtySize, native_pty_system};
pub use serde_json::{Value, json};
pub use std::collections::HashMap;
pub use std::io::{Cursor, Read, Write};
pub use std::sync::mpsc::{self, Receiver, Sender};
pub use std::sync::{Arc, Mutex};
pub use std::thread;
pub use std::time::{Duration, Instant};

use super::*;

#[cfg(test)]
pub mod lifecycle_tests {
    use super::*;

    type Slave = Box<dyn portable_pty::SlavePty + Send>;
    type Spawned = Box<dyn portable_pty::Child + Send + Sync>;

    /// A session with a real master and slave, so what retiring it closes are real descriptors. The
    /// slave is returned alive: closing it would make the master fail rather than behave normally.
    fn session_with(child: Option<Spawned>) -> (Arc<Session>, Slave) {
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("open a pty");
        let session = Arc::new(Session {
            master: Mutex::new(pair.master),
            writer: Mutex::new(Box::new(Vec::new())),
            child: Arc::new(Mutex::new(child)),
        });
        (session, pair.slave)
    }

    /// A child the kernel will not reap: `try_wait` reports it running forever and `wait` blocks past
    /// any bound, which is the shell that used to freeze app teardown.
    #[derive(Debug)]
    struct Unreapable {
        release: Mutex<Receiver<()>>,
    }

    #[derive(Debug)]
    struct NoopKiller;

    impl portable_pty::ChildKiller for NoopKiller {
        fn kill(&mut self) -> std::io::Result<()> {
            Ok(())
        }

        fn clone_killer(&self) -> Box<dyn portable_pty::ChildKiller + Send + Sync> {
            Box::new(NoopKiller)
        }
    }

    impl portable_pty::ChildKiller for Unreapable {
        fn kill(&mut self) -> std::io::Result<()> {
            // Ignores every signal, polite or not.
            Ok(())
        }

        fn clone_killer(&self) -> Box<dyn portable_pty::ChildKiller + Send + Sync> {
            Box::new(NoopKiller)
        }
    }

    impl portable_pty::Child for Unreapable {
        fn try_wait(&mut self) -> std::io::Result<Option<portable_pty::ExitStatus>> {
            Ok(None)
        }

        fn wait(&mut self) -> std::io::Result<portable_pty::ExitStatus> {
            let _ = lock(&self.release).recv_timeout(Duration::from_secs(30));
            Ok(portable_pty::ExitStatus::with_exit_code(0))
        }

        fn process_id(&self) -> Option<u32> {
            // No real pid, so nothing outside this struct can be signalled.
            None
        }

        #[cfg(windows)]
        fn as_raw_handle(&self) -> Option<std::os::windows::io::RawHandle> {
            None
        }
    }

    #[test]
    fn an_exited_session_is_gone_from_the_state() {
        let state = PtyState::default();
        let (session, _slave) = session_with(None);
        state.insert_session("pty-1".to_string(), Arc::clone(&session));
        let events: Mutex<Vec<(String, Value)>> = Mutex::new(Vec::new());

        pump_into(
            Box::new(Cursor::new(b"bye".to_vec())),
            |event, payload| lock(&events).push((event.to_string(), payload)),
            "pty-1",
            &session,
            &state.sessions,
        );

        assert!(
            state.session("pty-1").is_err(),
            "an exited terminal must leave the map, or its master and writer stay open until tab close"
        );
        let emitted = events.into_inner().expect("events");
        let (event, payload) = emitted.last().expect("an exit event");
        assert_eq!(event, EXITED_EVENT);
        assert_eq!(payload["id"], "pty-1");
        assert!(payload["code"].is_null(), "a taken child has no exit code");
    }

    #[test]
    fn a_pump_does_not_retire_a_session_that_reused_its_id() {
        let state = PtyState::default();
        let (old, _old_slave) = session_with(None);
        let (reused, _reused_slave) = session_with(None);
        state.insert_session("pty-1".to_string(), Arc::clone(&reused));

        pump_into(
            Box::new(Cursor::new(b"bye".to_vec())),
            |_, _| {},
            "pty-1",
            &old,
            &state.sessions,
        );

        let current = state
            .session("pty-1")
            .expect("the session that reused the id must survive");
        assert!(
            Arc::ptr_eq(&current, &reused),
            "the pump must retire its own handle, never whatever holds its id now"
        );
    }

    #[test]
    fn shutdown_all_returns_while_a_child_cannot_be_reaped() {
        let (release_tx, release_rx) = mpsc::channel();
        let (session, _slave) = session_with(Some(Box::new(Unreapable {
            release: Mutex::new(release_rx),
        })));
        let state = Arc::new(PtyState::default());
        state.insert_session("pty-1".to_string(), session);

        let started = Instant::now();
        let (done_tx, done_rx) = mpsc::channel();
        let shutdown = Arc::clone(&state);
        thread::spawn(move || {
            shutdown.shutdown_all();
            let _ = done_tx.send(());
        });
        let finished = done_rx.recv_timeout(Duration::from_secs(2));
        let elapsed = started.elapsed();
        let _ = release_tx.send(());

        assert!(
            finished.is_ok(),
            "teardown must return even when a child ignores the kill: {finished:?}"
        );
        assert!(
            elapsed < Duration::from_secs(2),
            "teardown blocked for {elapsed:?} instead of its bound"
        );
        assert!(
            state.session("pty-1").is_err(),
            "teardown takes every session out of the map"
        );
    }
}
