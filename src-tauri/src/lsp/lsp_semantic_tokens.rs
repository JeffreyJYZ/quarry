#![allow(unused_imports)]

pub(crate) use crate::protocol_pipe::{FrameError, ProcessPipe};
pub use serde::Serialize;
pub use serde_json::{Value, json};
pub use std::collections::HashMap;
pub use tauri::State;

use super::*;

/// One semantic token, in absolute positions the editor can mark directly.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SemanticToken {
    /// 0-based line, as LSP counts.
    pub line: u32,
    /// 0-based character offset of the token's first byte on that line.
    pub start: u32,
    /// Length in UTF-16 units, which is what LSP counts a character as.
    pub length: u32,
    /// The server's legend name for this token's number: `function`, `type`, `parameter`, …
    pub kind: String,
    /// Legend modifier names the server set, such as `declaration` or `readonly`.
    pub modifiers: Vec<String>,
}

/// Decode the delta-encoded `data` array of a `semanticTokens/full` answer.
///
/// The wire format is five numbers per token — delta line, delta start character, length, type,
/// modifier bitset — where the line and character deltas are relative to the previous token. A type
/// index the legend does not cover becomes an empty kind, which the editor skips rather than
/// colouring something at random.
pub fn semantic_tokens_from(
    data: &[i64],
    types: &[String],
    modifiers: &[String],
) -> Vec<SemanticToken> {
    let mut out = Vec::new();
    let mut line = 0_u32;
    let mut start = 0_u32;
    for chunk in data.as_chunks::<5>().0 {
        let delta_line = chunk[0].max(0) as u32;
        let delta_start = chunk[1].max(0) as u32;
        if delta_line > 0 {
            line += delta_line;
            start = delta_start;
        } else {
            start += delta_start;
        }
        let length = chunk[2].max(0) as u32;
        if length == 0 {
            continue;
        }
        let kind = types
            .get(chunk[3].max(0) as usize)
            .cloned()
            .unwrap_or_default();
        let bits = chunk[4].max(0) as u32;
        let mut flags = Vec::new();
        for (index, name) in modifiers.iter().enumerate() {
            if index < 32 && bits & (1 << index) != 0 {
                flags.push(name.clone());
            }
        }
        out.push(SemanticToken {
            line,
            start,
            length,
            kind,
            modifiers: flags,
        });
    }
    out
}

/// Every semantic token in one file, for highlighting what the grammar cannot see.
#[tauri::command]
pub async fn lsp_semantic_tokens(
    state: State<'_, LspState>,
    root: String,
    path: String,
) -> Result<Vec<SemanticToken>, String> {
    let session = session_for(&state, &root)?;
    ensure_open_for(&session, &path)?;
    let (types, modifiers) = {
        let guard = lock(&session);
        (
            guard.semantic_types.clone(),
            guard.semantic_modifiers.clone(),
        )
    };
    if types.is_empty() {
        return Ok(Vec::new());
    }
    let result = send_request(
        &session,
        "textDocument/semanticTokens/full",
        json!({ "textDocument": { "uri": path_to_uri(&path) } }),
    )
    .await?;
    let data: Vec<i64> = result
        .get("data")
        .and_then(Value::as_array)
        .map(|values| values.iter().filter_map(Value::as_i64).collect())
        .unwrap_or_default();
    Ok(semantic_tokens_from(&data, &types, &modifiers))
}

#[cfg(test)]
mod semantic_token_tests {
    use super::*;

    fn legend() -> (Vec<String>, Vec<String>) {
        (
            vec!["namespace".into(), "type".into(), "function".into()],
            vec!["declaration".into(), "readonly".into()],
        )
    }

    #[test]
    fn decodes_delta_positions_into_absolute_ones() {
        let (types, modifiers) = legend();
        // line 0 char 0 len 3 -> function; same line +10 -> type; next line char 4 -> namespace
        let data = vec![0, 0, 3, 2, 0, 0, 10, 4, 1, 0, 1, 4, 6, 0, 1];
        let tokens = semantic_tokens_from(&data, &types, &modifiers);
        assert_eq!(tokens.len(), 3);
        assert_eq!(tokens[0].line, 0);
        assert_eq!(tokens[0].start, 0);
        assert_eq!(tokens[0].kind, "function");
        assert_eq!(tokens[1].start, 10);
        assert_eq!(tokens[1].kind, "type");
        assert_eq!(tokens[2].line, 1);
        assert_eq!(tokens[2].start, 4);
        assert_eq!(tokens[2].kind, "namespace");
        assert_eq!(tokens[2].modifiers, vec!["declaration".to_string()]);
    }

    #[test]
    fn drops_a_type_the_legend_does_not_cover() {
        let (types, modifiers) = legend();
        let data = vec![0, 0, 3, 99, 0];
        let tokens = semantic_tokens_from(&data, &types, &modifiers);
        assert_eq!(tokens.len(), 1);
        assert!(tokens[0].kind.is_empty());
    }

    #[test]
    fn ignores_a_trailing_partial_token() {
        let (types, modifiers) = legend();
        let data = vec![0, 0, 3, 2, 0, 0, 4];
        assert_eq!(semantic_tokens_from(&data, &types, &modifiers).len(), 1);
    }
}
