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

use super::*;

/// Drop the line ending so a CRLF stream does not surface a stray carriage return.
pub fn strip_terminator(line: &mut Vec<u8>) {
    if line.last() == Some(&b'\n') {
        line.pop();
    }
    if line.last() == Some(&b'\r') {
        line.pop();
    }
}

/// Split one read into [`MAX_LINE_BYTES`] chunks, each decoded lossily.
///
/// `continues` says the read ended before a line ending, so the row carries on in the next chunk
/// instead of being complete: the panel merges the two into one line without waiting for the
/// newline, which is what makes a progress bar or a prompt visible while the program is alive.
///
/// A chunk boundary can fall inside a UTF-8 sequence, which is why each chunk is decoded with
/// `from_utf8_lossy`: a replacement character is better than losing the rest of the line. A blank
/// line is one empty chunk, so the panel keeps the program's spacing.
pub fn chunks_of(bytes: &[u8], continues: bool) -> Vec<Chunk> {
    let mut slices: Vec<&[u8]> = bytes.chunks(MAX_LINE_BYTES).collect();
    if slices.is_empty() {
        slices.push(&[]);
    }
    let last = slices.len().saturating_sub(1);
    slices
        .iter()
        .enumerate()
        .map(|(index, slice)| Chunk {
            text: String::from_utf8_lossy(slice).into_owned(),
            more: continues || index < last,
        })
        .collect()
}
