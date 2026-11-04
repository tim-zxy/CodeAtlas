//! Explicit v4 settlement; Runtime profile admission remains outside Native.
use crate::syntax::{
    SYNTAX_MAX_REQUEST_BYTES, SyntaxRequest, SyntaxWalkControl, decode_syntax_request,
    write_syntax_observation,
};
use serde_json::{Value, json};
use std::{
    io::{self, Write},
    sync::atomic::AtomicBool,
    time::{Duration, Instant},
};
/// Library callers may further restrict declared request controls, never enlarge them.
pub fn serve_syntax_request(
    bytes: &[u8],
    control: &SyntaxWalkControl<'_>,
    output: &mut impl Write,
) -> io::Result<()> {
    let Some(request) = decode_or_refuse(bytes, output)? else {
        return Ok(());
    };
    write_syntax_observation(&request, control, output)
}
/// Explicit Native wire route, with no invented defaults or Java memory reservation.
pub fn serve_syntax_request_from_budget(
    bytes: &[u8],
    cancelled: &AtomicBool,
    output: &mut impl Write,
) -> io::Result<()> {
    let Some(request) = decode_or_refuse(bytes, output)? else {
        return Ok(());
    };
    let b = &request.header()["payload"]["resourceBudget"];
    let size = |key: &str| usize::try_from(b[key].as_u64().unwrap()).map_err(|_| invalid());
    let now = Instant::now();
    let deadline = now
        .checked_add(Duration::from_millis(b["maxDurationMs"].as_u64().unwrap()))
        .unwrap_or(now);
    let control = SyntaxWalkControl {
        deadline,
        cancelled,
        max_source_bytes: size("maxInputBytes")?,
        max_items: size("maxItems")?,
        max_depth: size("maxDepth")?,
        max_result_bytes: size("maxOutputBytes")?,
    };
    write_syntax_observation(&request, &control, output)
}
fn decode_or_refuse(bytes: &[u8], output: &mut impl Write) -> io::Result<Option<SyntaxRequest>> {
    if bytes.len() > SYNTAX_MAX_REQUEST_BYTES {
        return Err(invalid());
    }
    match decode_syntax_request(bytes) {
        Ok(request) => Ok(Some(request)),
        Err(error) => {
            let first = bytes.split(|b| *b == b'\n').next().ok_or_else(invalid)?;
            let header: Value = serde_json::from_slice(first).map_err(|_| invalid())?;
            let request_id = header
                .get("requestId")
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty() && id.trim_matches(crate::syntax::trim) == *id)
                .ok_or_else(invalid)?;
            let mut record=serde_json::to_vec(&json!({"protocolVersion":4,"requestId":request_id,"sequence":0,"type":"REQUEST_FAILED","payload":{"code":error.code(),"message":"Invalid Syntax observation request","retryable":false}})).map_err(io::Error::other)?;
            record.push(b'\n');
            if record.len() > SYNTAX_MAX_REQUEST_BYTES {
                return Err(invalid());
            }
            output.write_all(&record)?;
            output.flush()?;
            Ok(None)
        }
    }
}
fn invalid() -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidData,
        "Invalid Syntax request framing or identity",
    )
}
