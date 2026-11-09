//! The payload of the one event this module emits.

use super::*;

/// Payload of the `fs://changed` event: every path of one debounced batch.
///
/// `root` is the canonical project root the watcher serves, so a listener that outlives a project
/// switch can drop a batch meant for the previous one. `paths` are absolute and already filtered.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsChangedEvent {
    pub root: String,
    pub paths: Vec<String>,
}

impl FsChangedEvent {
    /// The event name the frontend listens on. One batch, one event.
    pub const NAME: &'static str = "fs://changed";
}
