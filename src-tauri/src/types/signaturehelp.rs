#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};

use super::*;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SignatureHelp {
    pub signatures: Vec<SignatureInformation>,
    pub active_signature: u32,
    pub active_parameter: u32,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InlayHint {
    /// Zero-based position the hint is drawn at.
    pub line: u32,
    pub character: u32,
    pub label: String,
    /// 1 type, 2 parameter.
    pub kind: Option<u32>,
}

/// One entry in a call hierarchy list.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CallHierarchyNode {
    pub name: String,
    pub kind: u32,
    pub path: String,
    pub line: u32,
    pub character: u32,
    /// Opaque handle used to expand this node; stable for the session.
    pub item_id: u32,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExceptionFilter {
    /// Adapter filter id, e.g. `uncaught`.
    pub filter: String,
    pub label: String,
    pub default: bool,
}
