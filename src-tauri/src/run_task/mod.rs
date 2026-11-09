//! Run a program without the debugger, streaming its output.
//!
//! One child per run id, spawned directly and never through a shell. Its two pipes are read by one
//! thread each and pushed into one channel, and a single emitter thread numbers and emits them, so
//! stdout and stderr interleave in write order instead of arriving in two batches; the exit is
//! emitted after both readers reached EOF, so it is always the last event of the run.
//!
//! A run id is `run-<n>` from a monotonic counter, so a stale event can never address a newer
//! process.
//!
//! Waiting rule: `Child::kill` needs `&mut Child`, so a waiter blocked inside `wait()` would make the
//! child unkillable from `stop_program`. The waiter therefore polls `try_wait` at a short interval
//! and reaps the child itself; `stop_program` takes the child out of the state, signals its whole
//! process group, and waits for it on a blocking thread under a deadline, so a program that ignores
//! the polite signal cannot pin the async runtime. The waiter still reports the exit, so a stopped
//! run emits the same single event with no code.
//!
//! Nothing here panics: a failed thread spawn is a command error, a failed emit is ignored, and a
//! poisoned mutex is recovered rather than unwrapped.

#![allow(unused_imports)]
pub use serde::{Deserialize, Serialize};
pub use serde_json::{Value, json};
pub use std::collections::HashMap;
pub use std::io::{self, BufRead, BufReader, ErrorKind, Read, Write};
pub use std::path::{Path, PathBuf};
pub use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
pub use std::sync::atomic::{AtomicU64, Ordering};
pub use std::sync::mpsc::{self, Receiver, Sender};
pub use std::sync::{Arc, Mutex, MutexGuard};
pub use std::thread;
pub use std::time::Duration;
pub use tauri::{AppHandle, Emitter, State};

mod output_event;
pub use output_event::*;

mod chunks;
pub use chunks::*;

mod pump;
pub use pump::*;

mod emitter;
pub use emitter::*;

mod reap;
pub use reap::*;

mod impl_runstate;
pub use impl_runstate::*;

mod stop;
pub use stop::*;

mod stdin;
pub use stdin::*;

mod tests_items;
pub use tests_items::*;

mod tests_stream;
pub use tests_stream::*;

mod tests_stop;
pub use tests_stop::*;

mod tests_stdin;
pub use tests_stdin::*;
