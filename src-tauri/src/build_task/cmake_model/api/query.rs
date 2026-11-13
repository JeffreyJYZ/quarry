//! The query CMake reads before it configures.
//!
//! CMake only writes a reply object a client asked for, and it only asks once per configure: the
//! query has to be on disk before `cmake -S … -B …` runs, which is why the build writes it before
//! the configure step rather than after the reply turns out to be empty.

#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub use serde_json::Value;

use super::*;

/// The object kinds this client needs, at the versions it understands.
pub const QUERY_REQUESTS: [(&str, u32); 3] = [
    (CODEMODEL_KIND, 2),
    (TOOLCHAINS_KIND, 1),
    (CMAKEFILES_KIND, 1),
];

/// The query object, built from [`QUERY_REQUESTS`] so the two can never disagree.
pub fn query_body() -> Value {
    let requests = QUERY_REQUESTS
        .iter()
        .map(|(kind, major)| serde_json::json!({ "kind": kind, "version": { "major": major } }))
        .collect::<Vec<Value>>();
    serde_json::json!({ "requests": requests })
}

/// The directory CMake reads this client's query from.
pub fn query_dir(build_root: &Path) -> PathBuf {
    build_root.join(API_DIR).join("query").join(QUERY_CLIENT)
}

/// Write the query before a configure; the path written is what the caller reports in a note.
///
/// A tree that cannot be written is not fatal: the configure still describes the build, and the
/// caller degrades to whatever database the generator writes. The error says why so the note can.
pub fn write_query(build_root: &Path) -> Result<PathBuf, String> {
    let directory = query_dir(build_root);
    fs::create_dir_all(&directory).map_err(|error| {
        format!(
            "cannot create {} for the CMake file API query: {error}",
            directory.display()
        )
    })?;
    let path = directory.join(QUERY_FILE);
    let body = serde_json::to_string_pretty(&query_body())
        .map_err(|error| format!("cannot encode the CMake file API query: {error}"))?;
    fs::write(&path, body).map_err(|error| {
        format!(
            "cannot write the CMake file API query {}: {error}",
            path.display()
        )
    })?;
    Ok(path)
}
