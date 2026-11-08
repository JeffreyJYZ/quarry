//! Go to implementation and go to type definition.
//!
//! Both are the same shape as go to definition — a `textDocument/…` position request answered with
//! `Location[]` or `LocationLink[]` — so they share its plumbing and its parser and differ only in the
//! method name. They were advertised in the palette and implemented in the frontend long before the
//! commands existed: the invoke was rejected, the rejection was turned into an empty list, and the user
//! was told "No implementation found". A missing endpoint must not be able to read as an empty answer,
//! which is what `src/lib/project/api/commands.test.ts` now guards.

use super::*;

/// The two methods, named once so the test can pin them.
pub const IMPLEMENTATION_METHOD: &str = "textDocument/implementation";
pub const TYPE_DEFINITION_METHOD: &str = "textDocument/typeDefinition";

async fn request_locations(
    state: State<'_, LspState>,
    root: String,
    path: String,
    line: u32,
    character: u32,
    method: &str,
) -> Result<Vec<Location>, String> {
    let session = session_for(&state, &root)?;
    let result = send_request(
        &session,
        method,
        position_params(&path_to_uri(&path), line, character),
    )
    .await?;
    Ok(parse_locations(&result))
}

#[tauri::command]
pub async fn lsp_implementation(
    state: State<'_, LspState>,
    root: String,
    path: String,
    line: u32,
    character: u32,
) -> Result<Vec<Location>, String> {
    request_locations(state, root, path, line, character, IMPLEMENTATION_METHOD).await
}

#[tauri::command]
pub async fn lsp_type_definition(
    state: State<'_, LspState>,
    root: String,
    path: String,
    line: u32,
    character: u32,
) -> Result<Vec<Location>, String> {
    request_locations(state, root, path, line, character, TYPE_DEFINITION_METHOD).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_methods_are_the_spec_ones() {
        assert_eq!(IMPLEMENTATION_METHOD, "textDocument/implementation");
        assert_eq!(TYPE_DEFINITION_METHOD, "textDocument/typeDefinition");
    }
}
