//! Startup instrumentation.
//!
//! Off by default: a release run prints nothing. Enable with `QUARRY_STARTUP=1`, or use a debug build.
//! The deltas answer "it feels slow" with numbers — process start, window ready, first paint, project
//! open — instead of a guess.

use std::sync::OnceLock;
use std::time::Instant;

static PROCESS_START: OnceLock<Instant> = OnceLock::new();

/// The instant the process began, captured once.
pub fn process_start() -> Instant {
    *PROCESS_START.get_or_init(Instant::now)
}

/// Whether the marks print at all.
pub fn startup_enabled() -> bool {
    cfg!(debug_assertions) || std::env::var_os("QUARRY_STARTUP").is_some()
}

/// Format per-mark elapsed milliseconds as consecutive deltas. Pure, so it is tested.
pub fn format_startup_deltas(marks: &[(String, u128)]) -> String {
    let mut out = String::new();
    let mut prev: Option<u128> = None;
    for (label, ms) in marks {
        let delta = prev.map(|p| ms.saturating_sub(p)).unwrap_or(*ms);
        out.push_str(&format!("{label}: +{delta}ms (t={ms}ms)\n"));
        prev = Some(*ms);
    }
    out
}

/// Milliseconds since process start, for the frontend's first marks.
#[tauri::command]
pub fn startup_ms() -> u128 {
    process_start().elapsed().as_millis()
}

#[cfg(test)]
mod tests {
    use super::format_startup_deltas;

    #[test]
    fn formats_deltas() {
        let marks = vec![
            ("process".to_string(), 0u128),
            ("window".to_string(), 120u128),
            ("paint".to_string(), 135u128),
        ];
        let out = format_startup_deltas(&marks);
        assert!(out.contains("process: +0ms (t=0ms)"));
        assert!(out.contains("window: +120ms (t=120ms)"));
        assert!(out.contains("paint: +15ms (t=135ms)"));
    }
}
