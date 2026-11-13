//! Turning one preset file's text into presets.
//!
//! The parse is deliberately lenient per entry and strict per file: an entry without a name is
//! skipped because nothing can refer to it, while text that is not JSON at all is reported by
//! [`super::preset::load`] rather than read as "no presets" — a project whose file is broken must
//! not silently build somewhere else.

#![allow(unused_imports)]

pub use serde_json::Value;
pub use std::collections::BTreeMap;

use super::*;

pub(crate) fn parse(text: &str) -> Option<Presets> {
    let value: Value = serde_json::from_str(text).ok()?;
    let object = value.as_object()?;
    Some(Presets {
        configure: entries(object.get("configurePresets"))
            .into_iter()
            .filter_map(configure_preset)
            .collect(),
        build: entries(object.get("buildPresets"))
            .into_iter()
            .filter_map(build_preset)
            .collect(),
        invalid: Vec::new(),
    })
}

fn entries(value: Option<&Value>) -> Vec<&Value> {
    match value {
        Some(Value::Array(items)) => items.iter().collect(),
        _ => Vec::new(),
    }
}

fn configure_preset(value: &Value) -> Option<ConfigurePreset> {
    let object = value.as_object()?;
    Some(ConfigurePreset {
        name: object.get("name")?.as_str()?.to_string(),
        hidden: hidden(object),
        inherits: names(object.get("inherits")),
        binary_dir: text(object.get("binaryDir")),
        generator: text(object.get("generator")),
        cache: cache(object.get("cacheVariables")),
    })
}

fn build_preset(value: &Value) -> Option<BuildPreset> {
    let object = value.as_object()?;
    Some(BuildPreset {
        name: object.get("name")?.as_str()?.to_string(),
        hidden: hidden(object),
        inherits: names(object.get("inherits")),
        configure_preset: text(object.get("configurePreset")),
        configuration: text(object.get("configuration")),
    })
}

fn hidden(object: &serde_json::Map<String, Value>) -> bool {
    object
        .get("hidden")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn text(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).map(str::to_string)
}

/// `inherits` is either one name or a list of them.
fn names(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::String(name)) => vec![name.clone()],
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

/// Cache variables as CMake writes them on the command line: a bare `true` is `ON`, `false` is `OFF`.
fn cache(value: Option<&Value>) -> BTreeMap<String, String> {
    let Some(object) = value.and_then(Value::as_object) else {
        return BTreeMap::new();
    };
    object
        .iter()
        .map(|(key, value)| (key.clone(), cache_value(value)))
        .collect()
}

fn cache_value(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Bool(true) => "ON".to_string(),
        Value::Bool(false) => "OFF".to_string(),
        Value::Number(number) => number.to_string(),
        _ => String::new(),
    }
}
