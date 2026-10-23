//! Content-Length framing shared by LSP and DAP.
//!
//! Both protocols speak JSON-RPC over a child process's stdio, framed as
//! `Content-Length: <bytes>\r\n\r\n<body>`. Header names are case-insensitive, unknown headers are
//! ignored, and both CRLF and bare LF line endings are accepted. One implementation serves both.

#![allow(unused_imports)]
// The LSP and DAP units (P3) are the consumers of this module; until they land, nothing in the crate
// calls it, so dead-code warnings here would be noise about the intended shape rather than a defect.
#![allow(dead_code)]

use std::io::{self, BufRead, BufReader, Read, Write};
pub use std::process::{Child, ChildStdin, Command, Stdio};
pub use std::sync::mpsc::{self, Receiver};
pub use std::sync::{Arc, Condvar, Mutex};
pub use std::thread;
pub use std::time::Duration;

mod max_frame_bytes;
pub use max_frame_bytes::*;

mod impl_stderrcapture;
pub use impl_stderrcapture::*;

mod impl_processpipe_1;
pub use impl_processpipe_1::*;

mod tests_1;
pub use tests_1::*;

mod tests_2;
pub use tests_2::*;
