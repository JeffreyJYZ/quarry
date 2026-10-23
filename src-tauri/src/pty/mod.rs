//! Terminal sessions backed by a real pseudo-terminal.
#![allow(dead_code)]
#![allow(unused_imports)]
pub use portable_pty::{CommandBuilder, PtySize, native_pty_system};
pub use serde_json::{Value, json};
pub use std::collections::HashMap;
pub use std::io::{Read, Write};
pub use std::path::{Path, PathBuf};
pub use std::sync::atomic::{AtomicU64, Ordering};
pub use std::sync::{Arc, Mutex, MutexGuard};
pub use std::thread;
pub use tauri::{AppHandle, Emitter, State};

mod output_event;
pub use output_event::*;

mod validate_cwd;
pub use validate_cwd::*;

mod tests_items;
pub use tests_items::*;
