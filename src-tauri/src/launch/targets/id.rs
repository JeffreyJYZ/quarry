#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

use super::*;

/// Prefix of a Cargo run-target id.
pub const CARGO_PREFIX: &str = "cargo:";

/// Prefix of a C/C++ run-target id.
pub const CPP_PREFIX: &str = "cpp:";

/// A [`RunTarget::id`] parsed back into the parts resolution needs.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TargetId {
    Cargo { package: String, target: String },
    Cpp { target: String },
}

/// Parse an id the dropdown produced; anything else is an error naming it, never a guess.
///
/// A Cargo id splits once, because a binary name is the rest of the string and is never empty; a
/// C/C++ name keeps every colon after the prefix, so an unusual executable name still parses.
pub fn parse_target_id(id: &str) -> Result<TargetId, String> {
    if let Some(rest) = id.strip_prefix(CPP_PREFIX) {
        let target = rest.trim();
        if target.is_empty() {
            return Err(unknown_id(id));
        }
        return Ok(TargetId::Cpp {
            target: target.to_string(),
        });
    }

    if let Some(rest) = id.strip_prefix(CARGO_PREFIX) {
        let (package, target) = rest.split_once(':').ok_or_else(|| unknown_id(id))?;
        let (package, target) = (package.trim(), target.trim());
        if !package.is_empty() && !target.is_empty() {
            return Ok(TargetId::Cargo {
                package: package.to_string(),
                target: target.to_string(),
            });
        }
    }

    Err(unknown_id(id))
}

/// The error for an id that names no target shape; it quotes the id and both accepted forms.
pub fn unknown_id(id: &str) -> String {
    format!("unknown run target id \"{id}\": expected cargo:<package>:<bin> or cpp:<name>")
}
