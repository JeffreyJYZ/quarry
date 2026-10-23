//! Run a program without the debugger, streaming its output.
//!
//! One child per run id, spawned directly and never through a shell, with stdout and stderr pumped
//! line by line into `run://output` events and exactly one `run://exited` once the child is reaped.
//! A run id is `run-<n>` from a monotonic counter, so a stale event can never address a newer process.
//!
//! Waiting rule: `Child::kill` needs `&mut Child`, so a waiter blocked inside `wait()` would make the
//! child unkillable from `stop_program`. The waiter therefore polls `try_wait` at a short interval
//! and reaps the child itself; `stop_program` kills and reaps too, and the waiter still reports the
//! exit, so a stopped run emits the same single event with a `null` code.
//!
//! Nothing here panics: a failed thread spawn is a command error, a failed emit is ignored, and a
//! poisoned mutex is recovered rather than unwrapped.

#![allow(unused_imports)]
pub use serde::{Deserialize, Serialize};
pub use serde_json::{Value, json};
pub use std::collections::HashMap;
pub use std::io::{self, BufRead, BufReader, ErrorKind, Read};
pub use std::path::{Path, PathBuf};
pub use std::process::{Child, Command, Stdio};
pub use std::sync::atomic::{AtomicU64, Ordering};
pub use std::sync::{Arc, Mutex, MutexGuard};
pub use std::thread;
pub use std::time::Duration;
pub use tauri::{AppHandle, Emitter, State};

mod output_event;
pub use output_event::*;

mod impl_runstate;
pub use impl_runstate::*;

mod strip_terminator;
pub use strip_terminator::*;

mod tests_items;
pub use tests_items::*;
