#![allow(unused_imports)]

pub use std::io::Write;
pub use std::sync::mpsc::{self, Receiver, Sender};
pub use std::time::Duration;

use super::*;

#[cfg(test)]
pub mod lock_tests {
    use super::*;

    /// A writer that parks inside `write` until the test drops the sender, standing in for a terminal
    /// whose reader has stopped draining the pty.
    struct SlowWriter {
        entered: Sender<()>,
        release: Receiver<()>,
    }

    impl Write for SlowWriter {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            let _ = self.entered.send(());
            let _ = self.release.recv();
            Ok(buf.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    type Slave = Box<dyn portable_pty::SlavePty + Send>;

    /// Builds a real master, so `resize` is the syscall the command actually makes. The slave is
    /// returned alive: closing it would make the master's `resize` fail rather than stall.
    fn session_with_writer(writer: Box<dyn Write + Send>) -> (Arc<Session>, Slave) {
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
            writer: Mutex::new(writer),
            child: Arc::new(Mutex::new(None)),
        });
        (session, pair.slave)
    }

    /// Park a write on `id`, returning the sender that releases it and the write thread.
    fn stalled_write(
        state: &Arc<PtyState>,
        id: &str,
    ) -> (Sender<()>, Slave, thread::JoinHandle<Result<(), String>>) {
        let (entered_tx, entered_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let (session, slave) = session_with_writer(Box::new(SlowWriter {
            entered: entered_tx,
            release: release_rx,
        }));
        state.insert_session(id.to_string(), session);
        let writer_state = Arc::clone(state);
        let id = id.to_string();
        let slow = thread::spawn(move || writer_state.write(&id, b"ls\n"));
        entered_rx
            .recv_timeout(Duration::from_secs(5))
            .expect("the stalled writer should have entered write_all");
        (release_tx, slave, slow)
    }

    #[cfg(unix)]
    #[test]
    fn a_stalled_write_does_not_block_another_sessions_command() {
        let state = Arc::new(PtyState::default());
        let (release_tx, _slave, slow) = stalled_write(&state, "pty-1");
        let (second, _second_slave) = session_with_writer(Box::new(Vec::new()));
        state.insert_session("pty-2".to_string(), second);

        // The map lock must be free while that write is parked inside `write_all`.
        assert!(
            state.sessions.try_lock().is_ok(),
            "the map lock must not be held across a session write"
        );

        let (done_tx, done_rx) = mpsc::channel();
        let resizer = Arc::clone(&state);
        thread::spawn(move || {
            let _ = done_tx.send(resizer.resize("pty-2", 40, 100));
        });
        let resized = done_rx.recv_timeout(Duration::from_secs(2));

        drop(release_tx);
        let wrote = slow.join().expect("the write thread should finish");

        assert!(wrote.is_ok(), "the write itself should succeed: {wrote:?}");
        assert!(
            matches!(resized, Ok(Ok(()))),
            "resize of another session must finish while a writer is stalled: {resized:?}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn an_unknown_id_errors_without_waiting_for_a_stalled_writer() {
        let state = Arc::new(PtyState::default());
        let (release_tx, _slave, slow) = stalled_write(&state, "pty-1");

        let (done_tx, done_rx) = mpsc::channel();
        let unknown = Arc::clone(&state);
        thread::spawn(move || {
            let _ = done_tx.send(unknown.write("pty-404", b"x"));
        });
        let answer = done_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("an unknown id must not queue behind a stalled writer");

        drop(release_tx);
        let _ = slow.join();

        assert_eq!(answer.unwrap_err(), "unknown pty session: pty-404");
    }

    #[test]
    fn resize_of_an_unknown_id_names_the_id() {
        let state = PtyState::default();
        assert_eq!(
            state.resize("pty-404", 40, 100).unwrap_err(),
            "unknown pty session: pty-404"
        );
    }
}
