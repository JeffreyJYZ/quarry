//! The watch thread: receive raw paths, filter noise, debounce, emit one event per batch.
//!
//! The notify backend is a parameter so it stays alive exactly as long as this loop runs; dropping
//! it is what closes the OS watch. Nothing in here touches the async runtime or a lock.

use super::*;

/// Run until the stop channel closes or the event sender is dropped.
pub fn run_loop(
    app: AppHandle,
    root: PathBuf,
    received: Receiver<PathBuf>,
    stopped: Receiver<()>,
    _watcher: RecommendedWatcher,
) {
    let mut coalescer = Coalescer::new(DEBOUNCE);
    let label = root.to_string_lossy().into_owned();
    loop {
        match stopped.try_recv() {
            Ok(()) | Err(TryRecvError::Disconnected) => return,
            Err(TryRecvError::Empty) => {}
        }
        match received.recv_timeout(coalescer.wait(Instant::now())) {
            Ok(path) => {
                if !is_ignored(&path, &root) {
                    coalescer.push(path.to_string_lossy().into_owned(), Instant::now());
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
        if let Some(paths) = coalescer.take(Instant::now()) {
            let payload = FsChangedEvent {
                root: label.clone(),
                paths,
            };
            let _ = app.emit(FsChangedEvent::NAME, payload);
        }
    }
}
