//! The reply's index: which object files CMake wrote, resolved by the names it references.
//!
//! Every reply object has a hashed file name (`codemodel-v2-2ec58ec1910a80a5a39f.json`) that no
//! caller can predict. The index is the only place those names are recorded, so an object is found
//! by the `jsonFile` the index carries for its kind — guessing a name or globbing for a prefix reads
//! the object of a previous configure, which is worse than reading nothing.

#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub use serde_json::Value;

use super::*;

/// One object the index records: its kind, the major version it was written at, and its file name.
#[derive(Clone, Debug, PartialEq)]
pub struct ReplyObject {
    pub kind: String,
    pub major: u64,
    pub json_file: String,
}

/// The directory CMake writes its reply into.
pub fn reply_dir(build_root: &Path) -> PathBuf {
    build_root.join(API_DIR).join(REPLY_DIR)
}

/// The newest index file, which is the reply of the most recent configure.
///
/// Index names carry an ISO timestamp, so the greatest name is the newest. CMake normally keeps one
/// index, but a reply an interrupted configure left behind must not shadow the one after it.
pub fn newest_index(build_root: &Path) -> Result<PathBuf, String> {
    let directory = reply_dir(build_root);
    let entries = fs::read_dir(&directory).map_err(|error| {
        format!(
            "no CMake file API reply in {}: {error}",
            directory.display()
        )
    })?;
    let newest = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with(INDEX_PREFIX))
        })
        .max_by(|left, right| left.file_name().cmp(&right.file_name()));
    newest.ok_or_else(|| {
        format!(
            "no {} file in {}: CMake wrote no reply",
            INDEX_PREFIX,
            directory.display()
        )
    })
}

/// One reply: the object files it records and the generator that wrote them.
#[derive(Clone, Debug, PartialEq)]
pub struct Reply {
    pub objects: Vec<ReplyObject>,
    /// The generator's name, which decides whether it writes a database of its own.
    pub generator: Option<String>,
    pub multi_config: bool,
}

/// Read the newest index into the objects it records and the generator that wrote it.
pub fn read_reply(build_root: &Path) -> Result<Reply, String> {
    let path = newest_index(build_root)?;
    let value = read_value(&path)?;
    let objects = value["objects"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(parse_object)
                .collect::<Vec<ReplyObject>>()
        })
        .unwrap_or_default();
    if objects.is_empty() {
        return Err(format!(
            "{} records no reply object: CMake wrote a query-only reply",
            path.display()
        ));
    }
    Ok(Reply {
        objects,
        generator: value["cmake"]["generator"]["name"]
            .as_str()
            .map(str::to_string),
        multi_config: value["cmake"]["generator"]["multiConfig"]
            .as_bool()
            .unwrap_or(false),
    })
}

/// The highest-version object of `kind`; a lower version stays readable when a newer one is absent.
pub fn best_object<'a>(objects: &'a [ReplyObject], kind: &str) -> Option<&'a ReplyObject> {
    objects
        .iter()
        .filter(|object| object.kind == kind)
        .max_by_key(|object| object.major)
}

/// The file an index entry names, joined to the reply directory.
pub fn object_path(build_root: &Path, object: &ReplyObject) -> PathBuf {
    reply_dir(build_root).join(&object.json_file)
}

/// Read one object by kind, through the file name the index gives it.
pub fn read_object(build_root: &Path, kind: &str) -> Result<Value, String> {
    let reply = read_reply(build_root)?;
    let object = best_object(&reply.objects, kind)
        .ok_or_else(|| format!("the CMake file API reply carries no {kind} object"))?;
    let path = object_path(build_root, object);
    read_value(&path)
}

/// Read one JSON object file, naming it in every error so a malformed reply is diagnosable.
pub fn read_value(path: &Path) -> Result<Value, String> {
    let text = fs::read_to_string(path)
        .map_err(|error| format!("cannot read {}: {error}", path.display()))?;
    serde_json::from_str(&text)
        .map_err(|error| format!("{} is not valid JSON: {error}", path.display()))
}

fn parse_object(item: &Value) -> Option<ReplyObject> {
    let kind = item["kind"].as_str()?.to_string();
    let json_file = item["jsonFile"].as_str()?.to_string();
    let major = item["version"]["major"].as_u64().unwrap_or(0);
    Some(ReplyObject {
        kind,
        major,
        json_file,
    })
}
