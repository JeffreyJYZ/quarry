//! The two levels this log keeps.
//!
//! A crash log answers "what happened" and "what broke", so informational breadcrumbs and failures
//! are the whole vocabulary; a debug level would only add lines nobody reads at the moment it
//! matters.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Level {
    Info,
    Error,
}

impl Level {
    pub fn as_str(self) -> &'static str {
        match self {
            Level::Info => "INFO",
            Level::Error => "ERROR",
        }
    }
}
