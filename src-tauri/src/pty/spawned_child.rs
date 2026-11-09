#![allow(unused_imports)]

use super::*;

/// portable-pty's `Child` has no `Drop` impl: dropping the handle leaves the shell running with the
/// user's cwd and the pty attached, so every failure after a successful spawn has to kill and reap
/// it here. `kill` alone leaves a zombie, hence the `wait`.
pub fn kill_spawned(child: &Arc<Mutex<Option<Box<dyn portable_pty::Child + Send + Sync>>>>) {
    if let Some(mut spawned) = lock(child).take() {
        let _ = spawned.kill();
        let _ = spawned.wait();
    }
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
