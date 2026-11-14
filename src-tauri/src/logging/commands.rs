//! What the renderer reports: an error its boundary caught, one the window caught, and where to
//! read it afterwards.

use super::global;
use super::level::Level;

/// One renderer failure, in the shape both call sites fill.
pub struct Entry<'a> {
    pub name: &'a str,
    pub message: &'a str,
    /// `boundary`, `window.error` or `unhandledrejection` — which hook saw it first.
    pub source: Option<&'a str>,
    pub region: Option<&'a str>,
    /// The editor's document length when the failure was caught, which is the number a CodeMirror
    /// range error has to be compared against: the message's own length is the changeset, not the
    /// document.
    pub document_length: Option<u32>,
    pub stack: Option<&'a str>,
    pub component_stack: Option<&'a str>,
}

/// `TypeError: nope` on the header line, then where it was caught and the stacks below.
///
/// Everything after the header goes on its own indented block, so a log reader can tell one entry
/// from the next and the header stays one readable line.
pub fn report_text(entry: &Entry<'_>) -> String {
    let mut text = format!("{}: {}", entry.name, entry.message);
    let mut where_caught = Vec::new();
    if let Some(source) = entry.source {
        where_caught.push(source.to_string());
    }
    if let Some(region) = entry.region {
        where_caught.push(format!("in {region}"));
    }
    if let Some(length) = entry.document_length {
        where_caught.push(format!("document length {length}"));
    }
    if !where_caught.is_empty() {
        text.push_str("\ncaught by ");
        text.push_str(&where_caught.join(", "));
    }
    if let Some(stack) = entry.stack {
        text.push_str("\nstack:\n");
        text.push_str(stack.trim());
    }
    if let Some(component_stack) = entry.component_stack {
        text.push_str("\ncomponent stack:\n");
        // React's component stack starts with a newline and indents every frame; drop only the
        // leading break so the label does not sit above an empty line, and keep the frames.
        let trimmed = component_stack
            .trim_start_matches(&['\n', '\r'][..])
            .trim_end();
        text.push_str(trimmed);
    }
    text
}

/// Record a renderer failure and answer the log path, so a panel can print it.
///
/// Never fails: a log that cannot be written must not mask the error that brought the user here,
/// and it answers the path rather than making the renderer ask for a second command while it is
/// inside a crash.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn log_ui_error(
    region: Option<String>,
    name: String,
    message: String,
    stack: Option<String>,
    component_stack: Option<String>,
    source: Option<String>,
    document_length: Option<u32>,
) -> String {
    let text = report_text(&Entry {
        name: &name,
        message: &message,
        source: source.as_deref(),
        region: region.as_deref(),
        document_length,
        stack: stack.as_deref(),
        component_stack: component_stack.as_deref(),
    });
    global::write(Level::Error, "ui", &text);
    global::log_path().to_string_lossy().to_string()
}

/// The log file's path, for a panel that wants to name it before anything has failed.
#[tauri::command]
pub fn log_path() -> String {
    global::log_path().to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::{Entry, report_text};

    fn range_error() -> Entry<'static> {
        Entry {
            name: "RangeError",
            message: "Position 61 is out of range for changeset of length 52",
            source: Some("window.error"),
            region: None,
            document_length: Some(52),
            stack: Some(
                "RangeError: Position 61 is out of range\n    at dispatch (index.js:412:9)",
            ),
            component_stack: None,
        }
    }

    #[test]
    fn the_header_is_the_error_and_the_next_line_says_where_it_was_caught() {
        let text = report_text(&range_error());
        let mut lines = text.lines();
        assert_eq!(
            lines.next(),
            Some("RangeError: Position 61 is out of range for changeset of length 52")
        );
        assert_eq!(
            lines.next(),
            Some("caught by window.error, document length 52"),
            "the changeset length in the message is not the document length"
        );
    }

    #[test]
    fn the_stack_and_the_component_stack_are_separate_blocks() {
        let entry = Entry {
            component_stack: Some("\n    at Editor\n    at App"),
            ..range_error()
        };
        let text = report_text(&entry);
        assert!(text.contains("stack:\nRangeError: Position 61"));
        assert!(text.contains("component stack:\n    at Editor\n    at App"));
    }

    #[test]
    fn a_failure_with_nothing_extra_is_still_one_readable_line() {
        let entry = Entry {
            name: "Error",
            message: "boom",
            source: None,
            region: None,
            document_length: None,
            stack: None,
            component_stack: None,
        };
        assert_eq!(report_text(&entry), "Error: boom");
    }

    #[test]
    fn a_region_and_a_source_read_as_one_phrase() {
        let entry = Entry {
            source: Some("boundary"),
            region: Some("the workspace"),
            document_length: None,
            ..range_error()
        };
        let text = report_text(&entry);
        assert!(text.contains("caught by boundary, in the workspace"));
    }
}
