use std::collections::HashSet;
use std::io::{self, Read, Write};
use std::process::ExitCode;

use serde_json::{Map, Value, json};
use std::num::NonZeroUsize;

const PROTOCOL_VERSION: u64 = 1;
const IR_SCHEMA_VERSION: u64 = 1;
const MAX_LINE_BYTES: usize = 1_000_000;
const MAX_EVENT_COUNT: u64 = 10_000;
const MAX_TOTAL_BYTES: u64 = 10_000_000;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

struct DescribeRequest {
    request_id: String,
    client_protocol_versions: Vec<u64>,
    client_ir_schema_versions: Vec<u64>,
}

enum RequestFailure {
    Recoverable {
        request_id: String,
        code: &'static str,
        message: &'static str,
    },
    Unrecoverable {
        diagnostic: &'static str,
    },
}

pub(crate) fn serve_once<R: Read, W: Write, E: Write>(
    input: &mut R,
    output: &mut W,
    diagnostics: &mut E,
) -> io::Result<ExitCode> {
    serve_once_impl(input, output, diagnostics, None)
}

pub(crate) fn serve_once_with_workers<R: Read, W: Write, E: Write>(
    input: &mut R,
    output: &mut W,
    diagnostics: &mut E,
    worker_count: NonZeroUsize,
) -> io::Result<ExitCode> {
    serve_once_impl(input, output, diagnostics, Some(worker_count))
}

fn serve_once_impl<R: Read, W: Write, E: Write>(
    input: &mut R,
    output: &mut W,
    diagnostics: &mut E,
    worker_count: Option<NonZeroUsize>,
) -> io::Result<ExitCode> {
    let mut bytes = Vec::new();
    input
        .take((MAX_LINE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)?;

    if bytes.len() <= MAX_LINE_BYTES
        && bytes.last() == Some(&b'\n')
        && !bytes[..bytes.len() - 1].contains(&b'\n')
        && !bytes[..bytes.len() - 1].contains(&b'\r')
        && let Ok(value) = serde_json::from_slice::<Value>(&bytes[..bytes.len() - 1])
        && value.get("type").and_then(Value::as_str) == Some("ANALYZE")
    {
        return crate::analyze::run(
            value,
            worker_count.unwrap_or(NonZeroUsize::new(1).expect("one worker")),
            output,
            diagnostics,
        );
    }
    if bytes.len() <= MAX_LINE_BYTES
        && bytes.last() == Some(&b'\n')
        && !bytes[..bytes.len() - 1].contains(&b'\n')
        && !bytes[..bytes.len() - 1].contains(&b'\r')
        && let Ok(value) = serde_json::from_slice::<Value>(&bytes[..bytes.len() - 1])
        && value.get("protocolVersion").and_then(Value::as_u64) == Some(2)
        && value.get("type").and_then(Value::as_str) == Some("REFRESH")
        && let Some(request_id) = trustworthy_request_id(&value)
    {
        return write_event(
            output,
            request_failed_with_version(
                &request_id,
                "INVALID_REQUEST",
                "Protocol v2 REFRESH is unavailable",
                2,
            ),
        );
    }
    if worker_count.is_some() {
        writeln!(diagnostics, "parse-workers requires ANALYZE")?;
        return Ok(ExitCode::from(2));
    }

    let request = match parse_request(&bytes) {
        Ok(request) => request,
        Err(RequestFailure::Unrecoverable { diagnostic }) => {
            writeln!(diagnostics, "{diagnostic}")?;
            diagnostics.flush()?;
            return Ok(ExitCode::from(2));
        }
        Err(RequestFailure::Recoverable {
            request_id,
            code,
            message,
        }) => {
            return write_event(output, request_failed(&request_id, code, message));
        }
    };

    let event = if !request.client_protocol_versions.contains(&PROTOCOL_VERSION) {
        request_failed(
            &request.request_id,
            "INCOMPATIBLE_PROTOCOL_VERSION",
            "No mutually supported protocol version",
        )
    } else if !request
        .client_ir_schema_versions
        .contains(&IR_SCHEMA_VERSION)
    {
        request_failed(
            &request.request_id,
            "INCOMPATIBLE_IR_SCHEMA_VERSION",
            "No mutually supported IR schema version",
        )
    } else {
        describe_completed(&request.request_id)
    };

    write_event(output, event)
}

fn parse_request(bytes: &[u8]) -> Result<DescribeRequest, RequestFailure> {
    if bytes.len() > MAX_LINE_BYTES
        || bytes.len() < 2
        || bytes.starts_with(&[0xef, 0xbb, 0xbf])
        || bytes.last() != Some(&b'\n')
        || bytes[..bytes.len() - 1]
            .iter()
            .any(|byte| matches!(byte, b'\n' | b'\r'))
    {
        return Err(unrecoverable("invalid JSONL request framing"));
    }

    let line = std::str::from_utf8(&bytes[..bytes.len() - 1])
        .map_err(|_| unrecoverable("request is not valid UTF-8"))?;
    let value: Value =
        serde_json::from_str(line).map_err(|_| unrecoverable("request is not valid JSON"))?;
    let request_id = trustworthy_request_id(&value);
    let invalid = || match &request_id {
        Some(request_id) => RequestFailure::Recoverable {
            request_id: request_id.clone(),
            code: "INVALID_REQUEST",
            message: "Invalid DESCRIBE request",
        },
        None => unrecoverable("request has no trustworthy requestId"),
    };

    let object = value.as_object().ok_or_else(invalid)?;
    if request_id.is_none()
        || !has_exact_keys(object, &["protocolVersion", "requestId", "type", "payload"])
        || safe_integer(&object["protocolVersion"]) != Some(PROTOCOL_VERSION)
        || object["type"].as_str() != Some("DESCRIBE")
    {
        return Err(invalid());
    }

    let payload = object["payload"].as_object().ok_or_else(invalid)?;
    if !has_exact_keys(
        payload,
        &["clientProtocolVersions", "clientIrSchemaVersions"],
    ) {
        return Err(invalid());
    }

    let client_protocol_versions =
        version_list(&payload["clientProtocolVersions"]).ok_or_else(invalid)?;
    let client_ir_schema_versions =
        version_list(&payload["clientIrSchemaVersions"]).ok_or_else(invalid)?;

    Ok(DescribeRequest {
        request_id: request_id.expect("validated requestId"),
        client_protocol_versions,
        client_ir_schema_versions,
    })
}

fn trustworthy_request_id(value: &Value) -> Option<String> {
    let request_id = value.as_object()?.get("requestId")?.as_str()?;
    (!request_id.is_empty()
        && request_id.trim() == request_id
        && request_id.encode_utf16().count() <= 128)
        .then(|| request_id.to_owned())
}

fn has_exact_keys(object: &Map<String, Value>, expected: &[&str]) -> bool {
    object.len() == expected.len() && expected.iter().all(|key| object.contains_key(*key))
}

fn version_list(value: &Value) -> Option<Vec<u64>> {
    let values = value.as_array()?;
    if values.is_empty() {
        return None;
    }

    let versions: Vec<u64> = values.iter().map(safe_integer).collect::<Option<_>>()?;
    let unique: HashSet<u64> = versions.iter().copied().collect();
    (versions.iter().all(|version| *version > 0) && unique.len() == versions.len())
        .then_some(versions)
}

fn safe_integer(value: &Value) -> Option<u64> {
    if let Some(integer) = value.as_u64() {
        return (integer <= MAX_SAFE_INTEGER).then_some(integer);
    }

    let number = value.as_f64()?;
    (number.is_finite()
        && number >= 0.0
        && number.fract() == 0.0
        && number <= MAX_SAFE_INTEGER as f64)
        .then_some(number as u64)
}

fn describe_completed(request_id: &str) -> Value {
    json!({
        "protocolVersion": PROTOCOL_VERSION,
        "requestId": request_id,
        "sequence": 0,
        "type": "DESCRIBE_COMPLETED",
        "payload": {
            "providerId": "native",
            "providerVersion": env!("CARGO_PKG_VERSION"),
            "runtimeVersion": env!("CARGO_PKG_VERSION"),
            "protocolVersions": [PROTOCOL_VERSION, 2],
            "irSchemaVersions": [IR_SCHEMA_VERSION],
            "capabilities": ["protocol-handshake", "SYMBOL", "IMPORT", "CALL", "INHERITANCE", "REFERENCE"],
            "languages": [{
                "languageId": "java",
                "grammarVersion": "0.23.5",
                "analyzerVersion": "0.0.0",
                "compatibilityVersion": "1"
            }],
            "limits": {
                "maxLineBytes": MAX_LINE_BYTES,
                "maxEventCount": MAX_EVENT_COUNT,
                "maxTotalBytes": MAX_TOTAL_BYTES
            },
            "build": {
                "target": format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS),
                "profile": if cfg!(debug_assertions) { "debug" } else { "release" }
            }
        }
    })
}

fn request_failed(request_id: &str, code: &'static str, message: &'static str) -> Value {
    request_failed_with_version(request_id, code, message, PROTOCOL_VERSION)
}

fn request_failed_with_version(
    request_id: &str,
    code: &'static str,
    message: &'static str,
    version: u64,
) -> Value {
    json!({
        "protocolVersion": version,
        "requestId": request_id,
        "sequence": 0,
        "type": "REQUEST_FAILED",
        "payload": {
            "error": {
                "code": code,
                "message": message,
                "retryable": false
            }
        }
    })
}

fn write_event<W: Write>(output: &mut W, event: Value) -> io::Result<ExitCode> {
    serde_json::to_writer(&mut *output, &event).map_err(io::Error::other)?;
    output.write_all(b"\n")?;
    output.flush()?;
    Ok(ExitCode::SUCCESS)
}

fn unrecoverable(diagnostic: &'static str) -> RequestFailure {
    RequestFailure::Unrecoverable { diagnostic }
}

#[cfg(test)]
mod tests {
    use std::process::ExitCode;

    use serde_json::{Value, json};

    use super::*;

    fn run(input: &[u8]) -> (ExitCode, Vec<u8>, Vec<u8>) {
        let mut input = input;
        let mut output = Vec::new();
        let mut diagnostics = Vec::new();
        let exit = serve_once(&mut input, &mut output, &mut diagnostics).unwrap();
        (exit, output, diagnostics)
    }

    #[test]
    fn compatible_describe_emits_one_descriptor_event() {
        let (exit, output, diagnostics) = run(
            br#"{"protocolVersion":1,"requestId":"request-a","type":"DESCRIBE","payload":{"clientProtocolVersions":[1],"clientIrSchemaVersions":[1]}}
"#,
        );
        assert_eq!(exit, ExitCode::SUCCESS);
        assert!(diagnostics.is_empty());
        let event: Value = serde_json::from_slice(&output).unwrap();
        assert_eq!(event["type"], "DESCRIBE_COMPLETED");
        assert_eq!(event["payload"]["protocolVersions"], json!([1, 2]));
        assert_eq!(event["payload"]["irSchemaVersions"], json!([1]));
        assert_eq!(
            event["payload"]["capabilities"],
            json!([
                "protocol-handshake",
                "SYMBOL",
                "IMPORT",
                "CALL",
                "INHERITANCE",
                "REFERENCE"
            ])
        );
    }

    #[test]
    fn framing_rejects_non_jsonl_inputs_without_protocol_output() {
        for input in [
            b"{}".as_slice(),
            b"{}\r\n".as_slice(),
            b"\xef\xbb\xbf{}\n".as_slice(),
            b"\n".as_slice(),
            b"\xff\n".as_slice(),
            b"{\n".as_slice(),
            b"{}\n{}\n".as_slice(),
            b"{}\ntrailing".as_slice(),
        ] {
            let (exit, output, diagnostics) = run(input);
            assert_eq!(exit, ExitCode::from(2));
            assert!(output.is_empty());
            assert!(!diagnostics.is_empty());
        }

        let oversized = vec![b'x'; 1_000_001];
        let (exit, output, diagnostics) = run(&oversized);
        assert_eq!(exit, ExitCode::from(2));
        assert!(output.is_empty());
        assert!(!diagnostics.is_empty());

        let refresh =
            r#"{"protocolVersion":2,"requestId":"request-a","type":"REFRESH","payload":{}}"#;
        for suffix in ["\r\n", "\n\n", "\ntrailing"] {
            let input = format!("{refresh}{suffix}");
            let (exit, output, diagnostics) = run(input.as_bytes());
            assert_eq!(exit, ExitCode::from(2), "suffix: {suffix:?}");
            assert!(output.is_empty(), "suffix: {suffix:?}");
            assert!(!diagnostics.is_empty(), "suffix: {suffix:?}");
        }
    }

    #[test]
    fn invalid_requests_with_a_trustworthy_id_emit_invalid_request() {
        let exact_utf16 = "😀".repeat(64);
        let over_utf16 = format!("{exact_utf16}a");
        let inputs = [
            r#"{"protocolVersion":1,"requestId":"request-a","type":"DESCRIBE","payload":{"clientProtocolVersions":[],"clientIrSchemaVersions":[1]}}"#.to_owned(),
            r#"{"protocolVersion":1,"requestId":"request-a","type":"DESCRIBE","payload":{"clientProtocolVersions":[1,1],"clientIrSchemaVersions":[1]}}"#.to_owned(),
            r#"{"protocolVersion":1,"requestId":"request-a","type":"DESCRIBE","payload":{"clientProtocolVersions":[0],"clientIrSchemaVersions":[1]}}"#.to_owned(),
            r#"{"protocolVersion":1,"requestId":"request-a","type":"DESCRIBE","payload":{"clientProtocolVersions":[1.5],"clientIrSchemaVersions":[1]}}"#.to_owned(),
            r#"{"protocolVersion":1,"requestId":"request-a","type":"DESCRIBE","payload":{"clientProtocolVersions":[9007199254740992],"clientIrSchemaVersions":[1]}}"#.to_owned(),
            r#"{"protocolVersion":2,"requestId":"request-a","type":"DESCRIBE","payload":{"clientProtocolVersions":[1],"clientIrSchemaVersions":[1]}}"#.to_owned(),
            r#"{"protocolVersion":1,"requestId":"request-a","type":"ANALYZE","payload":{"clientProtocolVersions":[1],"clientIrSchemaVersions":[1]}}"#.to_owned(),
            r#"{"protocolVersion":1,"requestId":"request-a","type":"DESCRIBE","payload":{"clientProtocolVersions":[1],"clientIrSchemaVersions":[1],"extra":true}}"#.to_owned(),
            r#"{"protocolVersion":1,"requestId":"request-a","type":"DESCRIBE","payload":{"clientProtocolVersions":[1],"clientIrSchemaVersions":[1]},"extra":true}"#.to_owned(),
        ];

        for input in inputs {
            let input = format!("{input}\n");
            let (exit, output, diagnostics) = run(input.as_bytes());
            assert_eq!(exit, ExitCode::SUCCESS);
            assert!(diagnostics.is_empty());
            let event: Value = serde_json::from_slice(&output).unwrap();
            assert_eq!(event["type"], "REQUEST_FAILED");
            assert_eq!(event["payload"]["error"]["code"], "INVALID_REQUEST");
        }

        let accepted = format!(
            "{{\"protocolVersion\":1,\"requestId\":\"{exact_utf16}\",\"type\":\"DESCRIBE\",\"payload\":{{\"clientProtocolVersions\":[1.0],\"clientIrSchemaVersions\":[1.0]}}}}\n"
        );
        let (exit, output, diagnostics) = run(accepted.as_bytes());
        assert_eq!(exit, ExitCode::SUCCESS);
        assert!(diagnostics.is_empty());
        let event: Value = serde_json::from_slice(&output).unwrap();
        assert_eq!(event["type"], "DESCRIBE_COMPLETED");

        for invalid_id in [
            r#"{"protocolVersion":1,"type":"DESCRIBE","payload":{"clientProtocolVersions":[1],"clientIrSchemaVersions":[1]}}"#.to_owned(),
            r#"{"protocolVersion":1,"requestId":1,"type":"DESCRIBE","payload":{"clientProtocolVersions":[1],"clientIrSchemaVersions":[1]}}"#.to_owned(),
            r#"{"protocolVersion":1,"requestId":"","type":"DESCRIBE","payload":{"clientProtocolVersions":[1],"clientIrSchemaVersions":[1]}}"#.to_owned(),
            r#"{"protocolVersion":1,"requestId":" request-a","type":"DESCRIBE","payload":{"clientProtocolVersions":[1],"clientIrSchemaVersions":[1]}}"#.to_owned(),
            format!(r#"{{"protocolVersion":1,"requestId":"{over_utf16}","type":"DESCRIBE","payload":{{"clientProtocolVersions":[1],"clientIrSchemaVersions":[1]}}}}"#),
        ] {
            let input = format!("{invalid_id}\n");
            let (exit, output, diagnostics) = run(input.as_bytes());
            assert_eq!(exit, ExitCode::from(2));
            assert!(output.is_empty());
            assert!(!diagnostics.is_empty());
        }
    }

    #[test]
    fn negotiation_reports_protocol_before_ir_incompatibility() {
        let cases = [
            (
                br#"{"protocolVersion":1,"requestId":"request-a","type":"DESCRIBE","payload":{"clientProtocolVersions":[2],"clientIrSchemaVersions":[2]}}
"#
                .as_slice(),
                "INCOMPATIBLE_PROTOCOL_VERSION",
            ),
            (
                br#"{"protocolVersion":1,"requestId":"request-a","type":"DESCRIBE","payload":{"clientProtocolVersions":[1],"clientIrSchemaVersions":[2]}}
"#
                .as_slice(),
                "INCOMPATIBLE_IR_SCHEMA_VERSION",
            ),
        ];

        for (input, expected_code) in cases {
            let (exit, output, diagnostics) = run(input);
            assert_eq!(exit, ExitCode::SUCCESS);
            assert!(diagnostics.is_empty());
            let event: Value = serde_json::from_slice(&output).unwrap();
            assert_eq!(event["payload"]["error"]["code"], expected_code);
        }
    }

    #[test]
    fn output_failure_is_returned_to_the_process_boundary() {
        struct FailingWriter;

        impl std::io::Write for FailingWriter {
            fn write(&mut self, _buffer: &[u8]) -> std::io::Result<usize> {
                Err(std::io::Error::other("injected output failure"))
            }

            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }

        let mut output = FailingWriter;
        let mut diagnostics = Vec::new();
        let result = serve_once(
            &mut br#"{"protocolVersion":1,"requestId":"request-a","type":"DESCRIBE","payload":{"clientProtocolVersions":[1],"clientIrSchemaVersions":[1]}}
"#
            .as_slice(),
            &mut output,
            &mut diagnostics,
        );
        assert!(result.is_err());
    }
}
