use codeatlas_native_analyzer::analysis_state::validate_analysis_state;
use codeatlas_native_analyzer::request_v3::decode_request_v3;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/ipc/protocol-v3")
}

#[test]
fn parser_representation_limits_keep_contract_priority() {
    for (name, expected) in [
        ("number-overflow.jsonl", "INVALID_REQUEST"),
        ("deep-unknown.jsonl", "INVALID_REQUEST"),
        (
            "deep-unknown-protocol.jsonl",
            "INCOMPATIBLE_PROTOCOL_VERSION",
        ),
    ] {
        assert_eq!(
            decode_request_v3(&read(name)).unwrap_err().code(),
            expected,
            "{name}"
        );
    }
}
#[test]
fn surrogate_request_ids_remain_distinct_before_scalar_rejection() {
    assert_eq!(
        decode_request_v3(&read("surrogate-id-drift.jsonl"))
            .unwrap_err()
            .code(),
        "PROTOCOL_CORRUPTION"
    );
}

#[test]
fn deeply_nested_unknown_json_is_bounded_and_still_syntax_checked() {
    let first = String::from_utf8(read("valid-full.jsonl"))
        .unwrap()
        .lines()
        .next()
        .unwrap()
        .to_owned();
    let nested = format!("{}0{}", "[".repeat(100_000), "]".repeat(100_000));
    let prefix = format!(
        "{}\n",
        first.replace(
            "\"baselineState\":null",
            &format!("\"baselineState\":null,\"unknown\":{nested}")
        )
    );
    let terminal = json!({"protocolVersion":3,"requestId":"req","sequence":1,"type":"REQUEST_COMPLETED","payload":{"summaryRecords":0,"integrityChecksum":format!("{:x}",Sha256::digest(prefix.as_bytes()))}});
    let raw = format!("{prefix}{terminal}\n");
    assert_eq!(
        decode_request_v3(raw.as_bytes()).unwrap_err().code(),
        "INVALID_REQUEST"
    );
    let broken = raw.replacen("]", "", 1);
    assert_eq!(
        decode_request_v3(broken.as_bytes()).unwrap_err().code(),
        "PROTOCOL_CORRUPTION"
    );
}
fn read(name: &str) -> Vec<u8> {
    fs::read(root().join(name)).unwrap()
}
fn hex_bytes(s: &str) -> Vec<u8> {
    assert_eq!(s.len() % 2, 0);
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}
#[test]
fn shared_request_corpus_has_identical_closed_classifications() {
    let manifest: Value = serde_json::from_slice(&read("cases.json")).unwrap();
    for case in manifest["cases"].as_array().unwrap() {
        let mut bytes = if let Some(hex) = case["bytesHex"].as_str() {
            hex_bytes(hex)
        } else {
            let name = case["input"].as_str().unwrap();
            assert!(!name.contains('/') && !name.contains('\\') && !name.contains(".."));
            read(name)
        };
        if let Some(count) = case["repeat"].as_u64() {
            assert!((1..=1_000_001).contains(&count));
            assert_eq!(bytes.len(), 1);
            bytes = vec![bytes[0]; count as usize];
        }
        let result = decode_request_v3(&bytes);
        if case["expected"].is_null() {
            let valid = result.unwrap_or_else(|e| panic!("{}: {e}", case["id"]));
            assert_eq!(valid.header()["protocolVersion"], 3);
            if let Some(n) = case["maxEvents"].as_f64() {
                assert_eq!(
                    valid.header()["payload"]["resourceBudget"]["maxEvents"].as_f64(),
                    Some(n)
                );
            }
        } else {
            let e = result.expect_err(case["id"].as_str().unwrap());
            assert_eq!(
                e.code(),
                case["expected"].as_str().unwrap(),
                "{}",
                case["id"]
            );
            assert_eq!(e.to_string(), format!("Native v3 contract: {}", e.code()));
        }
    }
}
#[test]
fn analysis_state_validates_all_retained_fields_and_context() {
    let valid = decode_request_v3(&read("valid-refresh.jsonl")).unwrap();
    let baseline = valid.baseline().unwrap();
    validate_analysis_state(baseline).unwrap();
    for field in ["repositoryId", "revisionId", "summaryDigest"] {
        let mut b = baseline.clone();
        b["header"][field] = json!("wrong");
        assert!(validate_analysis_state(&b).is_err());
    }
    let mut b = baseline.clone();
    b["summaries"][0]["source"] = json!("secret");
    assert!(validate_analysis_state(&b).is_err());
    let mut b = baseline.clone();
    b["summaries"]
        .as_array_mut()
        .unwrap()
        .push(baseline["summaries"][0].clone());
    assert!(validate_analysis_state(&b).is_err());
}
#[test]
fn aggregate_byte_cap_counts_multibyte_and_final_lf() {
    let mut header: Value = serde_json::from_slice(
        read("valid-full.jsonl")
            .split(|b| *b == b'\n')
            .next()
            .unwrap(),
    )
    .unwrap();
    header["payload"]["repository"]["rootPath"] = json!(format!("/{}", "源".repeat(200000)));
    let mut first = serde_json::to_vec(&header).unwrap();
    first.push(b'\n');
    let mut terminal = json!({"protocolVersion":3,"requestId":"req","sequence":1,"type":"REQUEST_COMPLETED","payload":{"summaryRecords":0,"integrityChecksum":"0".repeat(64)}});
    let tail_len = serde_json::to_vec(&terminal).unwrap().len() + 1;
    let mut prefix = vec![b' '; 1_000_000 - first.len() - tail_len];
    prefix.extend(first);
    terminal["payload"]["integrityChecksum"] = json!(format!("{:x}", Sha256::digest(&prefix)));
    prefix.extend(serde_json::to_vec(&terminal).unwrap());
    prefix.push(b'\n');
    assert_eq!(prefix.len(), 1_000_000);
    decode_request_v3(&prefix).unwrap();
    prefix.push(b' ');
    assert_eq!(
        decode_request_v3(&prefix).unwrap_err().code(),
        "RESOURCE_LIMIT_EXCEEDED"
    );
}
