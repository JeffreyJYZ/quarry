//! The document version a workspace edit was computed against, captured when the request is made.

use crate::types::FileEdit;
use std::collections::HashMap;

/// Attach the version this session last sent for each path, where the answer carried none.
///
/// `changes` has no `textDocument.version`, which is the shape clangd answers a rename with, so
/// without this an edit computed against text that has since changed cannot be told from a current
/// one. `documents` is read when the request is made, so the number is the one that was current
/// then, not the one that happens to be current when the answer arrives.
pub fn with_captured_versions(
    mut edits: Vec<FileEdit>,
    documents: &HashMap<String, u32>,
) -> Vec<FileEdit> {
    for edit in edits.iter_mut() {
        if edit.version.is_none() {
            edit.version = documents.get(&edit.path).map(|version| i64::from(*version));
        }
    }
    edits
}

#[cfg(test)]
mod tests {
    use super::*;

    fn edit(path: &str, version: Option<i64>) -> FileEdit {
        FileEdit {
            path: path.to_string(),
            edits: Vec::new(),
            version,
        }
    }

    #[test]
    fn fills_only_the_paths_whose_answer_carried_no_version() {
        let documents = HashMap::from([("/p/a.cpp".to_string(), 4u32)]);
        let out = with_captured_versions(
            vec![
                edit("/p/a.cpp", None),
                edit("/p/a.cpp", Some(9)),
                edit("/p/b.cpp", None),
            ],
            &documents,
        );
        assert_eq!(out[0].version, Some(4));
        assert_eq!(out[1].version, Some(9));
        assert_eq!(out[2].version, None);
    }
}
