#![allow(unused_imports)]

pub(crate) use crate::protocol_pipe::{FrameError, ProcessPipe};
pub(crate) use crate::resolve;
pub(crate) use crate::types::{
    BreakpointSpec, DapBreakpoint, DapFrame, DapScope, DapSession, DapStoppedEvent, DapThread,
    DapVariable, DataBreakpointInfo, DisassembledInstruction, ExceptionFilter, LaunchConfig,
    MemoryDump,
};
pub use serde_json::{Map, Value, json};
pub use std::collections::HashMap;
pub use std::fs;
pub use std::io;
pub use std::path::Path;
pub use std::process::Command;
pub use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU32, AtomicU64, Ordering};
pub use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
pub use std::sync::{Arc, Mutex, MutexGuard};
pub use std::thread;
pub use std::time::{Duration, Instant};
pub use tauri::{AppHandle, Emitter, State};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_7 {
    use super::*;

    /// The Windows row's first trap: a stored source path arrives verbatim, and the debug info
    /// spells the same file plain, so the prefix has to go before the adapter sees it.
    #[test]
    pub fn a_verbatim_drive_path_loses_its_prefix() {
        assert_eq!(
            source_path(r"\\?\C:\work\app\main.cpp"),
            r"C:\work\app\main.cpp"
        );
    }

    /// A network path is verbatim as `\\?\UNC\server\share`, never as `\\?\\\server\share`.
    #[test]
    pub fn a_verbatim_network_path_becomes_its_unc_form() {
        assert_eq!(
            source_path(r"\\?\UNC\server\share\main.cpp"),
            r"\\server\share\main.cpp"
        );
    }

    /// A volume GUID path names the same volume without a drive letter, and the debug info holds one
    /// too: the prefix is not this path's plain form, so it stays.
    #[test]
    pub fn a_volume_guid_path_is_left_alone() {
        let path = r"\\?\Volume{1a2b3c4d-0000-0000-0000-100000000000}\app\main.cpp";
        assert_eq!(source_path(path), path);
    }

    /// The macOS and Linux spelling is already the one the debug info holds.
    #[test]
    pub fn a_plain_path_is_unchanged() {
        assert_eq!(source_path("/work/app/main.cpp"), "/work/app/main.cpp");
        assert_eq!(
            source_path(r"C:\work\app\main.cpp"),
            r"C:\work\app\main.cpp"
        );
    }

    /// A machine without the adapter must be told what to install, and never told to run `xcode-select`
    /// anywhere but macOS.
    #[test]
    pub fn the_adapter_name_and_hint_are_the_platforms_own() {
        assert!(adapter_name().starts_with(ADAPTER));
        if cfg!(target_os = "macos") {
            assert!(install_hint().contains("xcode-select"));
        } else {
            assert!(!install_hint().contains("xcode-select"));
        }
    }
}
