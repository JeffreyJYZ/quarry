//! Window labels, kept pure so uniqueness is testable without a GUI.
//!
//! Tauri keys every window by its label and refuses a second one with the same name, so a new
//! window's label must be picked against the labels that are alive at that moment. The numbering is
//! a scan for the first free index rather than a counter: a closed window's number becomes free
//! again, and a counter would keep climbing and never reuse it.

/// The label of the window `tauri.conf.json` declares, and the one a first extra window follows.
///
/// Only the tests name it: production reads the live labels from the handle, where `main` is
/// already present.
#[cfg(test)]
pub const MAIN_LABEL: &str = "main";

/// The label for the next window, given the ones already alive.
///
/// Starts at `window-2`, because `main` is window one, and returns the first index whose label is
/// not taken. A gap left by a closed window is filled first, so labels stay small.
pub fn next_label(live: &[String]) -> String {
    let mut index = 2;
    loop {
        let candidate = format!("window-{index}");
        if !live.iter().any(|label| label == &candidate) {
            return candidate;
        }
        index += 1;
    }
}
