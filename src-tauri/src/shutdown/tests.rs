//! The lifecycle hook itself needs a running Tauri event loop, so these tests drive
//! [`Children::shutdown`] directly — the function both the window-destroyed path and the exit
//! path call — and prove the shell case end to end by killing a real `/bin/sleep`.

use super::*;
use crate::pty::{Session, lock};
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct States {
    lsp: LspState,
    dap: DapState,
    pty: PtyState,
    run: RunState,
    watch: WatchState,
    build: BuildState,
}

impl States {
    fn children(&self) -> Children<'_> {
        Children {
            lsp: &self.lsp,
            dap: &self.dap,
            pty: &self.pty,
            run: &self.run,
            watch: &self.watch,
            build: &self.build,
        }
    }
}

#[test]
fn shutdown_empties_every_state_and_a_second_call_is_a_no_op() {
    let states = States::default();

    states.children().shutdown();
    // The window-destroyed path and the exit path can both fire, so the second call must be safe.
    states.children().shutdown();

    assert!(lock(&states.lsp.sessions).is_empty());
    assert!(lock(&states.dap.sessions).is_empty());
    assert!(lock(&states.run.runs).is_empty());
    // Every session is gone, not merely stopped, so nothing can hand a dead shell back out.
    assert!(states.pty.session("shell").is_err());
}

#[test]
fn a_second_window_closing_does_not_close_the_last_one() {
    // `closing_last_window` reads the live labels minus the one being destroyed, so several
    // windows must keep the children alive when one of them goes.
    let live = ["main", "window-2", "window-3"];
    assert!(!closes_last_window(live.into_iter(), "window-2"));
    assert!(!closes_last_window(live.into_iter(), "main"));
    assert!(!closes_last_window(live.into_iter(), "window-3"));
}

#[test]
fn the_last_window_closing_still_takes_the_children_down() {
    // `main` already went, so `window-2` is the only one left.
    assert!(closes_last_window(["window-2"].into_iter(), "window-2"));
    // Two labels in the map and only one of them closing is not the last window.
    assert!(!closes_last_window(
        ["window-2", "window-9"].into_iter(),
        "window-9"
    ));
    // A label with no window at all leaves the live one behind.
    assert!(!closes_last_window(["main"].into_iter(), "window-9"));
}

#[cfg(unix)]
#[test]
fn a_live_shell_does_not_outlive_its_window() {
    let states = States::default();
    let pid = insert_sleep(&states.pty);
    assert_eq!(
        unsafe { libc::kill(pid, 0) },
        0,
        "the shell should be running"
    );

    states.children().shutdown();

    assert_eq!(
        unsafe { libc::kill(pid, 0) },
        -1,
        "the shell should be gone"
    );
    assert!(states.pty.session("shell").is_err());

    states.children().shutdown();
    assert!(states.pty.session("shell").is_err());
}

/// A real PTY running `/bin/sleep 60`, inserted under the session id `shell`.
#[cfg(unix)]
fn insert_sleep(pty: &PtyState) -> i32 {
    use crate::pty::{CommandBuilder, PtySize, native_pty_system};

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
    let child = pair.slave.spawn_command(cmd).expect("spawn sleep");
    let pid = child.process_id().expect("pid") as i32;
    let writer = pair.master.take_writer().expect("take the writer");
    let session = Session {
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
        child: Arc::new(Mutex::new(Some(child))),
    };
    pty.insert_session("shell".to_string(), Arc::new(session));
    pid
}
