#![allow(unused_imports)]

pub(crate) use crate::protocol_pipe::{FrameError, ProcessPipe};
pub(crate) use crate::resolve;
pub(crate) use crate::types::{
    BreakpointSpec, DapBreakpoint, DapEvaluation, DapFrame, DapScope, DapSession, DapStoppedEvent,
    DapThread, DapVariable, DataBreakpointInfo, DisassembledInstruction, ExceptionFilter,
    LaunchConfig, MemoryDump,
};
pub use serde_json::{Map, Value, json};
pub use std::collections::HashMap;
pub use std::fs;
pub use std::io;
pub use std::path::Path;
pub use std::process::Command;
pub use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU32, AtomicU64, Ordering};
pub use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
pub use std::sync::{Arc, Mutex, MutexGuard};
pub use std::thread;
pub use std::time::{Duration, Instant};
pub use tauri::{AppHandle, Emitter, State};

use super::*;

/// The contexts the adapter documents, in the order the UI may ask for them.
pub const EVALUATE_CONTEXTS: [&str; 5] = ["watch", "repl", "hover", "clipboard", "variables"];

/// The context used when the caller passes none.
///
/// Measured in `docs/spikes/evaluate.md`: `watch` returns the bare value (`2`, `"quarry"`) for both C
/// and Rust, while `repl` wraps a scalar in `(int) $0 = 2` and expands a container over several lines.
pub const DEFAULT_EVALUATE_CONTEXT: &str = "watch";

/// Evaluate one expression in the stopped frame (DAP `evaluate`).
///
/// `frame_id` must be the stopped frame the expression belongs to: without it the adapter answers
/// `can't evaluate expressions when the process is running.` even while the program is stopped, so
/// the UI always sends one and a `None` reaches the user as that message rather than an empty value.
#[tauri::command]
pub async fn dap_evaluate(
    state: State<'_, DapState>,
    session: String,
    expression: String,
    frame_id: Option<i64>,
    context: Option<String>,
) -> Result<DapEvaluation, String> {
    let arguments = evaluate_arguments(expression.trim(), frame_id, context.as_deref())?;

    let body = session_for(&state, &session)?.request("evaluate", arguments)?;

    evaluation_from(&body)
}

/// The DAP arguments for `evaluate`, rejecting an empty expression and an unknown context.
pub fn evaluate_arguments(
    expression: &str,
    frame_id: Option<i64>,
    context: Option<&str>,
) -> Result<Value, String> {
    if expression.is_empty() {
        return Err("evaluate: `expression` must not be empty".to_string());
    }

    let mut arguments = json!({
        "expression": expression,
        "context": evaluate_context(context)?,
    });

    // Omitting `frameId` is not "the top frame": the adapter refuses every expression then.
    if let Some(frame_id) = frame_id {
        arguments["frameId"] = json!(frame_id);
    }

    Ok(arguments)
}

/// The adapter's `context` value: the caller's choice when it named one, else the measured default.
pub fn evaluate_context(context: Option<&str>) -> Result<&'static str, String> {
    let Some(context) = context else {
        return Ok(DEFAULT_EVALUATE_CONTEXT);
    };

    EVALUATE_CONTEXTS
        .iter()
        .copied()
        .find(|candidate| *candidate == context)
        .ok_or_else(|| {
            format!(
                "unknown evaluate context {context:?}: expected one of {}",
                EVALUATE_CONTEXTS.join(", ")
            )
        })
}

/// Map an `evaluate` body onto [`DapEvaluation`].
///
/// A body with no `result` string is an error, not an empty value: the field must say something
/// rather than render a blank line that looks like a successful evaluation of nothing.
pub fn evaluation_from(body: &Value) -> Result<DapEvaluation, String> {
    let result = body
        .get("result")
        .and_then(Value::as_str)
        .ok_or_else(|| "evaluate: the adapter returned no result".to_string())?;

    Ok(DapEvaluation {
        result: result.to_string(),
        type_name: body.get("type").and_then(Value::as_str).map(str::to_string),
        variables_reference: body
            .get("variablesReference")
            .and_then(Value::as_i64)
            .unwrap_or(0),
    })
}
