#![allow(unused_imports)]

use super::*;

impl Session {
    /// Writes under this session's writer lock only: a terminal whose reader stalls holds its own
    /// handle, never the map that open, resize and close need.
    pub fn write(&self, id: &str, data: &[u8]) -> Result<(), String> {
        let mut writer = lock(&self.writer);
        writer
            .write_all(data)
            .map_err(|e| format!("cannot write to {id}: {e}"))?;
        writer
            .flush()
            .map_err(|e| format!("cannot flush {id}: {e}"))
    }

    /// Resizes under this session's master lock only; `resize` is a syscall that can stall.
    pub fn resize(&self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        lock(&self.master)
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("cannot resize {id}: {e}"))
    }
}
