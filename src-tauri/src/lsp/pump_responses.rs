#![allow(unused_imports)]

use super::*;

/// Hand a server's answer to the request that is waiting for it.
pub fn resolve_response(session: &Arc<Mutex<Session>>, message: &Value) {
    let Some(id) = message.get("id").and_then(Value::as_i64) else {
        return;
    };

    let outcome = {
        let mut guard = lock(session);
        let Some(pending) = guard.pending.remove(&id) else {
            return;
        };
        let outcome = match message.get("error") {
            Some(error) => Err(format!(
                "{} rejected {}: {error}",
                guard.server, pending.method
            )),
            None => Ok(message.get("result").cloned().unwrap_or(Value::Null)),
        };
        (pending.sender, outcome)
    };

    let _ = outcome.0.send(outcome.1);
}

/// Answer a server-to-client request. `workspace/configuration` gets one `null` per requested item,
/// so a server asking for a setting it may not need sees "nothing configured" and carries on;
/// everything else gets a bare `null` result.
pub fn server_request_response(message: &Value) -> Value {
    let id = message.get("id").cloned().unwrap_or(Value::Null);
    let result = match message.get("method").and_then(Value::as_str) {
        Some("workspace/configuration") => configuration_result(message.get("params")),
        _ => Value::Null,
    };

    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

/// `[{ items: [...] }, …]` becomes `[null, null, …]`, one entry per item.
pub fn configuration_result(params: Option<&Value>) -> Value {
    let count = params
        .and_then(|params| params.get("items"))
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);

    Value::Array(vec![Value::Null; count])
}

pub fn diagnostics_event(root: &str, params: Option<&Value>) -> Option<DiagnosticsEvent> {
    let params = params?;
    let path = uri_to_path(params.get("uri").and_then(Value::as_str)?)?;
    let reported = params.get("diagnostics").and_then(Value::as_array)?;

    Some(DiagnosticsEvent {
        root: root.to_string(),
        path: path.clone(),
        diagnostics: reported
            .iter()
            .map(|value| diagnostic(&path, value))
            .collect(),
    })
}

pub fn diagnostic(path: &str, value: &Value) -> Diagnostic {
    let range = value.get("range");

    Diagnostic {
        path: path.to_string(),
        range: Range {
            start: position(range.and_then(|range| range.get("start"))),
            end: position(range.and_then(|range| range.get("end"))),
        },
        // LSP severity is optional; an absent value reads as an error, and the scale tops out at 4.
        severity: value
            .get("severity")
            .and_then(Value::as_u64)
            .unwrap_or(1)
            .clamp(1, 4) as u8,
        message: value
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        source: value
            .get("source")
            .and_then(Value::as_str)
            .map(str::to_string),
    }
}
