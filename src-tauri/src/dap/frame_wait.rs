#![allow(unused_imports)]

use super::*;

/// Waits one frame from the adapter, giving up as soon as the adapter process is gone.
///
/// `recv` alone is the wrong primitive: a dead `lldb-dap` whose debuggee kept the pipe open leaves
/// the channel connected forever, so the pump never reaches `fail_pending` and every request waits
/// out [`REQUEST_TIMEOUT`] instead of failing at once. Each empty poll asks whether the process is
/// still alive, which is the only condition that ends the wait — a paused debuggee is silent by
/// design and must not end it.
pub fn wait_frame<F>(
    frames: &Receiver<Result<Value, FrameError>>,
    adapter_alive: F,
    poll: Duration,
) -> Option<Value>
where
    F: Fn() -> bool,
{
    loop {
        match frames.recv_timeout(poll) {
            Ok(Ok(value)) => return Some(value),
            // A framing error is the end of the stream, exactly like a closed channel.
            Ok(Err(_)) | Err(RecvTimeoutError::Disconnected) => return None,
            Err(RecvTimeoutError::Timeout) => {
                if !adapter_alive() {
                    return None;
                }
            }
        }
    }
}
