//! Explicit library settlement only. No executable, Source reads, profile or state authority.
use codeatlas_native_analyzer::syntax::{SyntaxWalkControl, serve_syntax_request};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    sync::atomic::AtomicBool,
    time::{Duration, Instant},
};
fn limits() -> SyntaxWalkControl<'static> {
    static CANCELLED: AtomicBool = AtomicBool::new(false);
    SyntaxWalkControl {
        deadline: Instant::now() + Duration::from_secs(10),
        cancelled: &CANCELLED,
        max_source_bytes: 65536,
        max_items: 1000,
        max_depth: 64,
        max_result_bytes: 65536,
    }
}
fn request() -> Value {
    let mut r: Value = serde_json::from_str(include_str!(
        "../../../fixtures/phase1/syntax-budget-contract/inputs/python-initial-request.jsonl"
    ))
    .unwrap();
    let p = &mut r["payload"];
    p["sourceFiles"] = json!([]);
    let t = &p["targetSource"];
    let fields = [
        t["repositoryId"].as_str().unwrap(),
        t["revisionId"].as_str().unwrap(),
        t["contentFingerprint"].as_str().unwrap(),
        "NONE",
        "PROVISIONAL_CODE",
        p["ownerBinding"]["stageDigest"].as_str().unwrap(),
        p["providerId"].as_str().unwrap(),
        p["providerSnapshotId"].as_str().unwrap(),
        "0",
        "0",
    ];
    let mut h = Sha256::new();
    h.update(b"codeatlas-native-syntax-owner-map-v1\0");
    for v in fields {
        h.update(v.len().to_string());
        h.update(b":");
        h.update(v);
    }
    p["ownerBinding"]["ownerMapDigest"] = format!("{:x}", h.finalize()).into();
    r
}
fn bytes(r: &Value) -> Vec<u8> {
    let mut b = serde_json::to_vec(r).unwrap();
    b.push(b'\n');
    b
}
fn events(b: &[u8]) -> Vec<Value> {
    b.split_inclusive(|x| *x == b'\n')
        .map(|v| serde_json::from_slice(v).unwrap())
        .collect()
}
#[test]
fn explicit_zero_source_request_settles_one_complete_stream() {
    let mut output = vec![];
    serve_syntax_request(&bytes(&request()), &limits(), &mut output).unwrap();
    let es = events(&output);
    assert_eq!(es.len(), 2);
    assert_eq!(es[0]["type"], "SYNTAX_STARTED");
    assert_eq!(es[1]["type"], "SYNTAX_COMPLETED");
    assert_eq!(
        es[1]["payload"]["counts"],
        json!({"nodes":0,"edges":0,"syntax":0,"coverage":0,"diagnostics":0})
    );
}
#[test]
fn recoverable_failures_use_direct_v4_error_and_never_analyze() {
    for (r, code) in [
        (
            json!({"protocolVersion":4,"requestId":"unit:request","type":"ANALYZE"}),
            "INVALID_REQUEST",
        ),
        (
            json!({"protocolVersion":1,"requestId":"unit:request","type":"OBSERVE_SYNTAX"}),
            "INCOMPATIBLE_PROTOCOL_VERSION",
        ),
    ] {
        let mut output = vec![];
        serve_syntax_request(&bytes(&r), &limits(), &mut output).unwrap();
        let es = events(&output);
        assert_eq!(es.len(), 1);
        assert_eq!(es[0]["protocolVersion"], 4);
        assert_eq!(es[0]["type"], "REQUEST_FAILED");
        assert_eq!(es[0]["payload"]["code"], code);
        assert!(es[0]["payload"].get("error").is_none());
    }
}
#[test]
fn invalid_framing_does_not_allow_a_valid_first_record_to_publish() {
    let mut input = bytes(&request());
    input.extend(b"{}\n");
    let mut output = vec![];
    serve_syntax_request(&input, &limits(), &mut output).unwrap();
    assert_eq!(events(&output)[0]["type"], "REQUEST_FAILED");
}
#[test]
fn malformed_or_untrusted_id_never_gets_a_fabricated_response() {
    for input in [
        b"not-json\n".to_vec(),
        bytes(&json!({"protocolVersion":4,"requestId":" padded "})),
        bytes(&json!({"protocolVersion":4,"requestId":null})),
    ] {
        let mut output = vec![];
        assert_eq!(
            serve_syntax_request(&input, &limits(), &mut output)
                .unwrap_err()
                .kind(),
            std::io::ErrorKind::InvalidData
        );
        assert!(output.is_empty());
    }
}
#[test]
fn oversize_raw_request_is_bounded_before_header_decode() {
    let mut output = vec![];
    assert_eq!(
        serve_syntax_request(&vec![b' '; 1_000_001], &limits(), &mut output)
            .unwrap_err()
            .kind(),
        std::io::ErrorKind::InvalidData
    );
    assert!(output.is_empty());
}
#[test]
fn failed_error_write_preserves_broken_pipe() {
    struct Sink;
    impl std::io::Write for Sink {
        fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
            Err(std::io::Error::from(std::io::ErrorKind::BrokenPipe))
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let r = json!({"protocolVersion":4,"requestId":"unit:request"});
    assert_eq!(
        serve_syntax_request(&bytes(&r), &limits(), &mut Sink)
            .unwrap_err()
            .kind(),
        std::io::ErrorKind::BrokenPipe
    );
}

#[test]
fn wire_budget_entry_preserves_pre_cancellation() {
    let cancelled = AtomicBool::new(true);
    let mut out = vec![];
    codeatlas_native_analyzer::syntax::serve_syntax_request_from_budget(
        &bytes(&request()),
        &cancelled,
        &mut out,
    )
    .unwrap();
    let es = events(&out);
    assert_eq!(es.len(), 1);
    assert_eq!(es[0]["type"], "REQUEST_FAILED");
    assert_eq!(es[0]["payload"]["code"], "CANCELLED");
}
