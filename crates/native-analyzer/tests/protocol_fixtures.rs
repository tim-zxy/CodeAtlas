use std::fs;
use std::path::{Component, Path, PathBuf};

use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Classification {
    Valid,
    MalformedJson,
    InvalidEvent,
    IncompatibleProtocol,
    OversizeLine,
    OutOfOrder,
    PrematureEof,
}

const REQUEST_TYPES: [&str; 4] = ["DESCRIBE", "ANALYZE", "REFRESH", "CANCEL"];
const EVENT_TYPES: [&str; 18] = [
    "DESCRIBE_COMPLETED",
    "ANALYSIS_STARTED",
    "SOURCE_FILE",
    "NODE",
    "EDGE",
    "COVERAGE",
    "DIAGNOSTIC",
    "ANALYSIS_COMPLETED",
    "ANALYSIS_FAILED",
    "REFRESH_STARTED",
    "UPSERT_NODE",
    "REMOVE_NODE",
    "UPSERT_EDGE",
    "REMOVE_EDGE",
    "REFRESH_COMPLETED",
    "REFRESH_FAILED",
    "CANCEL_ACCEPTED",
    "REQUEST_FAILED",
];
const TERMINAL_EVENT_TYPES: [&str; 7] = [
    "DESCRIBE_COMPLETED",
    "ANALYSIS_COMPLETED",
    "ANALYSIS_FAILED",
    "REFRESH_COMPLETED",
    "REFRESH_FAILED",
    "CANCEL_ACCEPTED",
    "REQUEST_FAILED",
];

fn is_exact_string(value: &str) -> bool {
    !value.is_empty() && value.trim() == value
}

fn string_field<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

fn is_closed_object(value: &Value, fields: &[&str]) -> bool {
    value.as_object().is_some_and(|object| {
        object.len() == fields.len() && fields.iter().all(|key| object.contains_key(*key))
    })
}

fn expected_classification(value: &str) -> Classification {
    match value {
        "VALID" => Classification::Valid,
        "MALFORMED_JSON" => Classification::MalformedJson,
        "INVALID_EVENT" => Classification::InvalidEvent,
        "INCOMPATIBLE_PROTOCOL" => Classification::IncompatibleProtocol,
        "OVERSIZE_LINE" => Classification::OversizeLine,
        "OUT_OF_ORDER" => Classification::OutOfOrder,
        "PREMATURE_EOF" => Classification::PrematureEof,
        unexpected => panic!("unknown fixture classification: {unexpected}"),
    }
}

fn resolve_fixture_path(root: &Path, relative: &str) -> PathBuf {
    let path = Path::new(relative);
    assert!(!path.is_absolute(), "fixture path must be relative");
    assert!(
        path.components()
            .all(|component| matches!(component, Component::Normal(_))),
        "fixture path must contain normal components only"
    );
    root.join(path)
}

fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("fixtures/ipc/protocol-v1")
}

fn decode_lines(bytes: &[u8], max_line_bytes: usize) -> Result<Vec<&str>, Classification> {
    if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
        return Err(Classification::MalformedJson);
    }
    let mut raw_lines = bytes.split(|byte| *byte == b'\n').collect::<Vec<_>>();
    if raw_lines.last().is_some_and(|line| line.is_empty()) {
        raw_lines.pop();
    }
    if raw_lines.is_empty() || raw_lines.iter().any(|line| line.is_empty()) {
        return Err(Classification::MalformedJson);
    }
    raw_lines
        .into_iter()
        .map(|line| {
            if line.len() > max_line_bytes {
                return Err(Classification::OversizeLine);
            }
            if line.last() == Some(&b'\r') {
                return Err(Classification::MalformedJson);
            }
            std::str::from_utf8(line).map_err(|_| Classification::MalformedJson)
        })
        .collect()
}

fn parse_lines(lines: &[&str]) -> Result<Vec<Value>, Classification> {
    lines
        .iter()
        .map(|line| serde_json::from_str(line).map_err(|_| Classification::MalformedJson))
        .collect()
}

fn is_request_envelope(value: &Value) -> bool {
    is_closed_object(value, &["protocolVersion", "requestId", "type", "payload"])
        && string_field(value, "requestId").is_some_and(is_exact_string)
        && string_field(value, "type").is_some_and(|kind| REQUEST_TYPES.contains(&kind))
        && value.get("payload").is_some_and(Value::is_object)
}

fn is_event_envelope(value: &Value) -> bool {
    is_closed_object(
        value,
        &[
            "protocolVersion",
            "requestId",
            "sequence",
            "type",
            "payload",
        ],
    ) && string_field(value, "requestId").is_some_and(is_exact_string)
        && string_field(value, "type").is_some_and(|kind| EVENT_TYPES.contains(&kind))
        && value.get("sequence").and_then(Value::as_u64).is_some()
        && value.get("payload").is_some_and(Value::is_object)
}

fn legal_event_type(request_type: &str, event_type: &str) -> bool {
    match request_type {
        "DESCRIBE" => matches!(event_type, "DESCRIBE_COMPLETED" | "REQUEST_FAILED"),
        "ANALYZE" => matches!(
            event_type,
            "ANALYSIS_STARTED"
                | "SOURCE_FILE"
                | "NODE"
                | "EDGE"
                | "COVERAGE"
                | "DIAGNOSTIC"
                | "ANALYSIS_COMPLETED"
                | "ANALYSIS_FAILED"
                | "REQUEST_FAILED"
        ),
        "REFRESH" => matches!(
            event_type,
            "REFRESH_STARTED"
                | "SOURCE_FILE"
                | "UPSERT_NODE"
                | "REMOVE_NODE"
                | "UPSERT_EDGE"
                | "REMOVE_EDGE"
                | "COVERAGE"
                | "DIAGNOSTIC"
                | "REFRESH_COMPLETED"
                | "REFRESH_FAILED"
                | "REQUEST_FAILED"
        ),
        "CANCEL" => matches!(event_type, "CANCEL_ACCEPTED" | "REQUEST_FAILED"),
        _ => false,
    }
}

fn classify_transcript(
    request_bytes: &[u8],
    event_bytes: &[u8],
    max_line_bytes: usize,
) -> Classification {
    let request_lines = match decode_lines(request_bytes, max_line_bytes) {
        Ok(lines) => lines,
        Err(classification) => return classification,
    };
    let event_lines = match decode_lines(event_bytes, max_line_bytes) {
        Ok(lines) => lines,
        Err(classification) => return classification,
    };
    if request_lines.len() != 1 {
        return Classification::InvalidEvent;
    }
    let requests = match parse_lines(&request_lines) {
        Ok(values) => values,
        Err(classification) => return classification,
    };
    let events = match parse_lines(&event_lines) {
        Ok(values) => values,
        Err(classification) => return classification,
    };
    let request = &requests[0];
    if std::iter::once(request)
        .chain(events.iter())
        .any(|value| value.get("protocolVersion").and_then(Value::as_u64) != Some(1))
    {
        return Classification::IncompatibleProtocol;
    }
    if !is_request_envelope(request) || events.iter().any(|event| !is_event_envelope(event)) {
        return Classification::InvalidEvent;
    }

    let request_id = string_field(request, "requestId").expect("validated request ID");
    let request_type = string_field(request, "type").expect("validated request type");
    for (index, event) in events.iter().enumerate() {
        if string_field(event, "requestId") != Some(request_id) {
            return Classification::InvalidEvent;
        }
        if event.get("sequence").and_then(Value::as_u64) != Some(index as u64) {
            return Classification::OutOfOrder;
        }
        let event_type = string_field(event, "type").expect("validated event type");
        if !legal_event_type(request_type, event_type)
            || (event_type == "REQUEST_FAILED" && index != 0)
        {
            return Classification::InvalidEvent;
        }
    }

    let first_type = events.first().and_then(|event| string_field(event, "type"));
    if (request_type == "ANALYZE"
        && !matches!(first_type, Some("ANALYSIS_STARTED" | "REQUEST_FAILED")))
        || (request_type == "REFRESH"
            && !matches!(first_type, Some("REFRESH_STARTED" | "REQUEST_FAILED")))
    {
        return Classification::InvalidEvent;
    }

    let terminal_indexes = events
        .iter()
        .enumerate()
        .filter_map(|(index, event)| {
            string_field(event, "type")
                .filter(|kind| TERMINAL_EVENT_TYPES.contains(kind))
                .map(|_| index)
        })
        .collect::<Vec<_>>();
    if terminal_indexes.is_empty() {
        return Classification::PrematureEof;
    }
    if terminal_indexes.len() != 1 || terminal_indexes[0] + 1 != events.len() {
        return Classification::InvalidEvent;
    }
    Classification::Valid
}

fn fixture_case(id: &str) -> (Vec<u8>, Vec<u8>, usize) {
    let root = fixture_root();
    let manifest: Value =
        serde_json::from_slice(&fs::read(root.join("cases.json")).unwrap()).unwrap();
    let fixture = manifest["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|fixture| fixture["id"] == id)
        .expect("fixture case");
    let request = fs::read(resolve_fixture_path(
        &root,
        fixture["requestFile"].as_str().unwrap(),
    ))
    .unwrap();
    let events = fs::read(resolve_fixture_path(
        &root,
        fixture["eventsFile"].as_str().unwrap(),
    ))
    .unwrap();
    (
        request,
        events,
        fixture["maxLineBytes"].as_u64().unwrap() as usize,
    )
}

#[test]
fn shared_manifest_and_raw_corpus_match_declared_classifications() {
    let root = fixture_root();
    let manifest: Value = serde_json::from_slice(
        &fs::read(root.join("cases.json")).expect("read shared protocol fixture manifest"),
    )
    .expect("parse shared protocol fixture manifest");

    assert_eq!(manifest["schemaVersion"], 1);
    assert_eq!(manifest["id"], "p0-native-ipc-protocol-bytes-v1");
    assert_eq!(manifest["task"], "P0-W3-002");
    assert_eq!(
        manifest["governingSpec"],
        "docs/handoff/specs/NATIVE_IPC.md"
    );
    assert_eq!(
        manifest["acceptance"],
        "TypeScript and Rust consume the same Native IPC v1 request and event bytes"
    );
    let cases = manifest["cases"].as_array().expect("cases array");
    let expected_ids = [
        "describe-v1",
        "analyze-java-basic-v1",
        "refresh-modified-file-v1",
        "refresh-delete-file-v1",
        "partial-analysis-v1",
        "cancellation-v1",
        "malformed-json-v1",
        "invalid-event-v1",
        "incompatible-protocol-v1",
        "oversize-line-v1",
        "out-of-order-v1",
        "premature-eof-v1",
    ];
    assert_eq!(
        cases
            .iter()
            .map(|case| case["id"].as_str().expect("case id"))
            .collect::<Vec<_>>(),
        expected_ids
    );

    for case in cases {
        let request = fs::read(resolve_fixture_path(
            &root,
            case["requestFile"].as_str().expect("request file"),
        ))
        .expect("read request bytes");
        let events = fs::read(resolve_fixture_path(
            &root,
            case["eventsFile"].as_str().expect("events file"),
        ))
        .expect("read event bytes");
        assert_eq!(request.len() as u64, case["requestBytes"].as_u64().unwrap());
        assert_eq!(events.len() as u64, case["eventsBytes"].as_u64().unwrap());
        assert_eq!(
            classify_transcript(
                &request,
                &events,
                case["maxLineBytes"].as_u64().unwrap() as usize
            ),
            expected_classification(case["expected"].as_str().expect("classification"))
        );
    }
}

#[test]
fn fixture_paths_reject_absolute_and_parent_components() {
    let root = fixture_root();
    assert!(std::panic::catch_unwind(|| resolve_fixture_path(&root, "/absolute.jsonl")).is_err());
    assert!(std::panic::catch_unwind(|| resolve_fixture_path(&root, "../escape.jsonl")).is_err());
}

#[test]
fn raw_framing_rejects_bom_invalid_utf8_blank_lines_and_crlf() {
    let (request, events, max_line_bytes) = fixture_case("describe-v1");
    let mut bom = vec![0xef, 0xbb, 0xbf];
    bom.extend_from_slice(&request);
    assert_eq!(
        classify_transcript(&bom, &events, max_line_bytes),
        Classification::MalformedJson
    );
    assert_eq!(
        classify_transcript(&[0xff], &events, max_line_bytes),
        Classification::MalformedJson
    );
    let mut blank_line = request.clone();
    blank_line.push(b'\n');
    assert_eq!(
        classify_transcript(&blank_line, &events, max_line_bytes),
        Classification::MalformedJson
    );
    let crlf = String::from_utf8(events.clone())
        .unwrap()
        .replace('\n', "\r\n")
        .into_bytes();
    assert_eq!(
        classify_transcript(&request, &crlf, max_line_bytes),
        Classification::MalformedJson
    );
}

#[test]
fn classification_precedence_and_stream_failures_are_deterministic() {
    let (describe_request, describe_events, _) = fixture_case("describe-v1");
    let (analyze_request, analyze_events, max_line_bytes) = fixture_case("analyze-java-basic-v1");
    assert_eq!(
        decode_lines("界".as_bytes(), 2),
        Err(Classification::OversizeLine)
    );
    let request_line_bytes = describe_request.len() - 1;
    let malformed_oversize = format!("{{\"broken\":\"{}", "x".repeat(request_line_bytes));
    assert_eq!(
        classify_transcript(
            &describe_request,
            malformed_oversize.as_bytes(),
            request_line_bytes
        ),
        Classification::OversizeLine
    );
    assert_eq!(
        classify_transcript(&describe_request, b"{\"broken\":\n", request_line_bytes),
        Classification::MalformedJson
    );

    let mismatch = String::from_utf8(describe_events.clone())
        .unwrap()
        .replace("request-describe", "request-mismatch")
        .into_bytes();
    assert_eq!(
        classify_transcript(&describe_request, &mismatch, max_line_bytes),
        Classification::InvalidEvent
    );
    let illegal = String::from_utf8(describe_events)
        .unwrap()
        .replace("DESCRIBE_COMPLETED", "CANCEL_ACCEPTED")
        .into_bytes();
    assert_eq!(
        classify_transcript(&describe_request, &illegal, max_line_bytes),
        Classification::InvalidEvent
    );
    let sequence_gap = String::from_utf8(analyze_events.clone())
        .unwrap()
        .replacen("\"sequence\":1", "\"sequence\":9", 1)
        .into_bytes();
    assert_eq!(
        classify_transcript(&analyze_request, &sequence_gap, max_line_bytes),
        Classification::OutOfOrder
    );
    let first_event_end = analyze_events
        .iter()
        .position(|byte| *byte == b'\n')
        .unwrap()
        + 1;
    assert_eq!(
        classify_transcript(
            &analyze_request,
            &analyze_events[..first_event_end],
            max_line_bytes
        ),
        Classification::PrematureEof
    );
}
