#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use serde_json::{Value, json};
pub use std::collections::HashMap;
pub use std::io::{self, BufRead, BufReader, ErrorKind, Read};
pub use std::path::{Path, PathBuf};
pub use std::process::{Child, Command, ExitStatus, Stdio};
pub use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
pub use std::sync::mpsc::{self, Receiver, Sender};
pub use std::sync::{Arc, Mutex, MutexGuard};
pub use std::thread;
pub use std::time::Duration;
pub use tauri::{AppHandle, Emitter, State};

use super::*;

#[cfg(test)]
pub mod stream_tests {
    use crate::run_task::*;

    fn line(stream: &'static str, text: &str, more: bool) -> RunEvent {
        RunEvent::Line {
            stream,
            chunk: Chunk {
                text: text.to_string(),
                more,
            },
        }
    }

    #[test]
    fn a_line_of_exactly_the_limit_stays_whole() {
        let exact = vec![b'a'; MAX_LINE_BYTES];

        let chunks = chunks_of(&exact, false);

        assert_eq!(
            chunks.len(),
            1,
            "exactly {MAX_LINE_BYTES} bytes is one line"
        );
        assert_eq!(chunks[0].text.len(), MAX_LINE_BYTES);
        assert!(!chunks[0].more);
    }

    #[test]
    fn a_line_above_the_limit_is_split_at_the_limit() {
        let over = vec![b'b'; MAX_LINE_BYTES + 3];

        let chunks = chunks_of(&over, false);

        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].text.len(), MAX_LINE_BYTES);
        assert!(chunks[0].more, "the row continues in the next chunk");
        assert_eq!(chunks[1].text, "bbb");
        assert!(!chunks[1].more);
    }

    #[test]
    fn invalid_utf8_becomes_replacement_characters() {
        let chunks = chunks_of(b"ok\xff end", false);

        assert_eq!(chunks[0].text, "ok\u{fffd} end");
    }

    #[test]
    fn a_blank_line_is_one_empty_chunk() {
        let chunks = chunks_of(b"", false);

        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].text, "");
    }

    /// A reader that hands over one newline-free line, then asserts the sink already saw it.
    struct WithoutNewline {
        text: Vec<u8>,
        seen: Arc<AtomicBool>,
    }

    impl Read for WithoutNewline {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            if self.text.is_empty() {
                assert!(
                    self.seen.load(Ordering::SeqCst),
                    "output without a newline was held back until the pipe closed"
                );
                return Ok(0);
            }
            let count = self.text.len().min(buf.len());
            buf[..count].copy_from_slice(&self.text[..count]);
            self.text.drain(..count);
            Ok(count)
        }
    }

    #[test]
    fn output_without_a_newline_reaches_the_panel_before_the_pipe_closes() {
        let seen = Arc::new(AtomicBool::new(false));
        let reader = WithoutNewline {
            text: b"serving on port 8080".to_vec(),
            seen: Arc::clone(&seen),
        };
        let mut chunks = Vec::new();

        pump(reader, |chunk| {
            seen.store(true, Ordering::SeqCst);
            chunks.push(chunk);
        })
        .expect("a readable pipe");

        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].text, "serving on port 8080");
        assert!(chunks[0].more, "the row is open until its newline arrives");
    }

    #[test]
    fn complete_lines_are_emitted_in_order_and_crlf_is_stripped() {
        let input: &[u8] = b"one\r\ntwo\nthree";
        let mut chunks = Vec::new();

        pump(input, |chunk| chunks.push(chunk)).expect("a readable pipe");

        assert_eq!(chunks[0].text, "one");
        assert!(!chunks[0].more);
        assert_eq!(chunks[1].text, "two");
        assert!(!chunks[1].more);
        assert_eq!(chunks[2].text, "three");
        assert!(chunks[2].more, "the last line never got its newline");
    }

    #[test]
    fn a_partial_line_continues_the_row_it_started() {
        let input: &[u8] = b"hel";
        let mut chunks = Vec::new();

        pump(input, |chunk| chunks.push(chunk)).expect("a readable pipe");

        assert_eq!(chunks[0].text, "hel");
        assert!(chunks[0].more);
    }

    #[test]
    fn the_emitter_numbers_every_line_across_both_streams() {
        let (tx, rx) = mpsc::channel();
        tx.send(line(STDOUT, "out 1", false)).unwrap();
        tx.send(line(STDERR, "err 1", false)).unwrap();
        tx.send(line(STDOUT, "out 2", false)).unwrap();
        drop(tx);

        let mut output = Vec::new();
        let mut exit = Vec::new();
        emit_ordered("run-9", rx, &mut |value| output.push(value), &mut |value| {
            exit.push(value)
        });

        assert_eq!(output.len(), 3);
        assert_eq!(output[0]["seq"], 1);
        assert_eq!(output[1]["seq"], 2);
        assert_eq!(output[2]["seq"], 3);
        assert_eq!(output[0]["stream"], "stdout");
        assert_eq!(output[1]["stream"], "stderr");
        assert_eq!(output[2]["line"], "out 2");
        assert!(exit.is_empty(), "no exit was sent");
    }

    #[test]
    fn the_exit_is_reported_last_even_when_it_arrives_before_the_streams_end() {
        let (tx, rx) = mpsc::channel();
        tx.send(line(STDOUT, "still printing", true)).unwrap();
        tx.send(RunEvent::Exit(Exit {
            code: Some(3),
            signal: None,
        }))
        .unwrap();
        tx.send(RunEvent::StreamEnd).unwrap();
        tx.send(RunEvent::StreamEnd).unwrap();
        drop(tx);

        let mut output = Vec::new();
        let mut exit = Vec::new();
        emit_ordered("run-9", rx, &mut |value| output.push(value), &mut |value| {
            exit.push(value)
        });

        assert_eq!(output.len(), 1);
        assert_eq!(exit.len(), 1);
        assert_eq!(exit[0]["seq"], 2, "the exit takes the next number");
        assert_eq!(exit[0]["code"], 3);
        assert_eq!(exit[0]["signal"], Value::Null);
    }
}
