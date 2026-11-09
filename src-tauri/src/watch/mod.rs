//! One filesystem watcher per open project, so an external edit reaches the explorer.
//!
//! A recursive [`notify`] watch over the project root pushes every raw path into a channel. A
//! dedicated thread debounces the burst ([`DEBOUNCE`]) and emits **one** `fs://changed` event per
//! batch, payload [`FsChangedEvent`]: `{ root, paths }`, both absolute.
//!
//! Noise rule: a path inside a [`crate::ignore::is_dir`] directory (or `build/`) never reaches the
//! event, so a `cargo build` or a CMake configure cannot turn into a refresh storm.
//!
//! Lifecycle rule: one watcher at a time. Starting a project replaces the previous one, closing or
//! replacing the project stops it through `watch_stop`, and the last window closing or the app
//! quitting calls `shutdown_all` beside the other managed states. Nothing here blocks the async
//! runtime: the thread owns the notify backend
//! and exits when its stop channel closes.
//!
//! Frontend contract: `src/ui/app/useFileWatch.ts` subscribes, `src/lib/project/watch.ts` decides
//! what a batch means for an open buffer (a dirty buffer is never touched).

#![allow(unused_imports)]
pub use notify::{RecommendedWatcher, RecursiveMode, Watcher};
pub use serde::Serialize;
pub use std::path::{Component, Path, PathBuf};
pub use std::sync::Mutex;
pub use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
pub use std::thread::{self, JoinHandle};
pub use std::time::{Duration, Instant};
pub use tauri::{AppHandle, Emitter, Manager, State};

mod excluded;
pub use excluded::*;

mod coalesce;
pub use coalesce::*;

mod changed;
pub use changed::*;

mod handle;
pub use handle::*;

mod thread_loop;
pub use thread_loop::*;

mod state;
pub use state::*;

mod commands;
pub use commands::*;

mod tests_filter;
pub use tests_filter::*;

mod tests_coalesce;
pub use tests_coalesce::*;
