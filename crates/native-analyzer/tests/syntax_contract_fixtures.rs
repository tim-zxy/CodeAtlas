//! Shared P1-03 byte-oracle entry point, not a native v4 parser/producer.
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, path::PathBuf};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/phase1/syntax-contract")
}
fn check_shared(language: &str) {
    let root = root();
    let request_bytes = fs::read(root.join(format!("inputs/{language}-request.jsonl"))).unwrap();
    assert_eq!(request_bytes.last(), Some(&b'\n'));
    assert_eq!(request_bytes.iter().filter(|b| **b == b'\n').count(), 1);
    assert!(!request_bytes.contains(&b'\r'));
    assert!(!request_bytes.starts_with(&[239, 187, 191]));
    let request: Value = serde_json::from_slice(&request_bytes).unwrap();
    assert_eq!(request["protocolVersion"], 4);
    assert_eq!(request["type"], "OBSERVE_SYNTAX");
    assert_eq!(request["sequence"], 0);
    assert_eq!(request["payload"]["irSchemaVersion"], 1);
    let raw = fs::read(root.join(format!("inputs/{language}-events.jsonl"))).unwrap();
    assert_eq!(raw.last(), Some(&b'\n'));
    assert!(!raw.contains(&b'\r'));
    assert!(!raw.starts_with(&[239, 187, 191]));
    let lines: Vec<&[u8]> = raw.split_inclusive(|b| *b == b'\n').collect();
    let events: Vec<Value> = lines
        .iter()
        .map(|b| serde_json::from_slice(b).unwrap())
        .collect();
    assert_eq!(events[0]["type"], "SYNTAX_STARTED");
    assert_eq!(events.last().unwrap()["type"], "SYNTAX_COMPLETED");
    let mut hash = Sha256::new();
    let mut counts = BTreeMap::from([
        ("nodes", 0),
        ("edges", 0),
        ("syntax", 0),
        ("coverage", 0),
        ("diagnostics", 0),
    ]);
    for (i, event) in events.iter().enumerate() {
        assert_eq!(event["protocolVersion"], 4);
        assert_eq!(event["requestId"], request["requestId"]);
        assert_eq!(event["sequence"], i);
        if i + 1 < events.len() {
            hash.update(lines[i]);
        }
        let key = match event["type"].as_str().unwrap() {
            "NODE" => Some("nodes"),
            "EDGE" => Some("edges"),
            "SYNTAX_OBSERVATION" => Some("syntax"),
            "COVERAGE" => Some("coverage"),
            "DIAGNOSTIC" => Some("diagnostics"),
            "SYNTAX_STARTED" | "SYNTAX_COMPLETED" => None,
            other => panic!("unexpected shared-fixture event {other}"),
        };
        if let Some(key) = key {
            *counts.get_mut(key).unwrap() += 1;
        }
    }
    let expected: Value =
        serde_json::from_slice(&fs::read(root.join("expected/outcomes.json")).unwrap()).unwrap();
    let terminal = &events.last().unwrap()["payload"];
    let checksum = format!("{:x}", hash.finalize());
    assert_eq!(terminal["checksum"], checksum);
    assert_eq!(terminal["checksum"], expected[language]["checksum"]);
    assert_eq!(terminal["outcome"], expected[language]["outcome"]);
    assert_eq!(terminal["counts"], serde_json::to_value(counts).unwrap());
    assert_eq!(terminal["counts"], expected[language]["counts"]);
    assert_eq!(terminal["basis"], request["payload"]["basis"]);
    assert_eq!(
        terminal["extractorVersion"],
        request["payload"]["extractorVersion"]
    );
}
#[test]
fn shared_java_raw_bytes_and_terminal_oracle() {
    check_shared("java");
}
#[test]
fn shared_python_raw_bytes_and_terminal_oracle() {
    check_shared("python");
}
