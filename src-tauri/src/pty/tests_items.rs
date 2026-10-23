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

use super::*;

#[cfg(test)]
pub mod tests {
    use super::*;

    #[test]
    fn pty_ids_count_from_one() {
        assert_eq!(pty_id(1), "pty-1");
        let c = AtomicU64::new(0);
        assert_eq!(next_id(&c), "pty-1");
        assert_eq!(next_id(&c), "pty-2");
    }

    #[test]
    fn cwd_rejects_relative() {
        let e = validate_cwd("relative/dir").unwrap_err();
        assert!(e.contains("relative/dir"));
        assert!(e.contains("absolute"));
    }

    #[test]
    fn cwd_rejects_missing() {
        let e = validate_cwd("/no/such/dir/quarry").unwrap_err();
        assert!(e.contains("/no/such/dir/quarry"));
        assert!(e.contains("directory") || e.contains("existing"));
    }

    #[test]
    fn lossy_conversion() {
        assert_eq!(lossy_chunk(b"ok\xff"), "ok\u{fffd}");
    }

    #[test]
    fn payloads() {
        let o = output_payload("pty-1", "hi".to_string());
        assert_eq!(o["id"], "pty-1");
        assert_eq!(o["data"], "hi");
        let e = exited_payload("pty-1", Some(0));
        assert_eq!(e["id"], "pty-1");
        assert_eq!(e["code"], 0);
        let k = exited_payload("pty-1", None);
        assert!(k["code"].is_null());
    }
}
