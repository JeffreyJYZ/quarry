//! Starting and stopping the one live watcher.
//!
//! `start` returns only once the backend is armed, so a caller cannot believe it is watching a
//! project that failed to open. The thread is detached from the async runtime and is joined on
//! `stop`, which is what keeps a project switch from leaving two watchers behind.

use super::*;

/// How long the watcher collects changes before it emits one batch.
pub const DEBOUNCE: Duration = Duration::from_millis(250);

/// One live watcher: the notify backend, the thread that owns it and its stop channel.
pub struct WatchHandle {
    /// The root exactly as the frontend asked for it, compared on a repeated start.
    root: String,
    stop: Sender<()>,
    thread: Option<JoinHandle<()>>,
}

impl WatchHandle {
    /// Watch `root` recursively and return once the backend has accepted it.
    pub fn start(app: AppHandle, root: String) -> Result<Self, String> {
        let path = PathBuf::from(&root)
            .canonicalize()
            .map_err(|error| format!("watch failed for {root}: {error}"))?;
        let (events, received) = mpsc::channel::<PathBuf>();
        let mut watcher =
            notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
                if let Ok(event) = result {
                    for path in event.paths {
                        let _ = events.send(path);
                    }
                }
            })
            .map_err(|error| format!("watch failed for {root}: {error}"))?;
        watcher
            .watch(&path, RecursiveMode::Recursive)
            .map_err(|error| format!("watch failed for {root}: {error}"))?;
        let (stop, stopped) = mpsc::channel::<()>();
        let thread = thread::Builder::new()
            .name("quarry-watch".to_string())
            .spawn(move || run_loop(app, path, received, stopped, watcher))
            .map_err(|error| format!("could not start the watch thread: {error}"))?;
        Ok(Self {
            root,
            stop,
            thread: Some(thread),
        })
    }

    /// The root this watcher was asked to serve.
    pub fn root(&self) -> &str {
        &self.root
    }

    /// Ask the thread to exit and wait for it. Consuming, so a handle is stopped at most once.
    pub fn stop(mut self) {
        let _ = self.stop.send(());
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
