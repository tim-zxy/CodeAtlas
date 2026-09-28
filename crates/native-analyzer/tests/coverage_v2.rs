use std::fs;
use std::io::Write;
use std::process::{Command, Stdio};

use serde_json::{Value, json};
use sha2::{Digest, Sha256};

fn request() -> Value {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/native/java-basic-symbol/source")
        .canonicalize()
        .unwrap();
    let source = include_bytes!("../../../fixtures/native/java-basic-symbol/source/src/Basic.java");
    json!({
        "protocolVersion": 2, "requestId": "coverage-v2", "type": "ANALYZE",
        "payload": {
            "irSchemaVersion": 1, "providerSnapshotId": "snapshot-v2",
            "repository": {"id": "repo-v2", "rootPath": root.to_str().unwrap()},
            "revision": {"id": "rev-v2", "repositoryId": "repo-v2", "kind": "WORKTREE", "contentFingerprint": "sha256:revision-v2", "baseRevisionId": null},
            "sourceFiles": [{"id": "file-v2", "repositoryId": "repo-v2", "revisionId": "rev-v2", "path": "src/Basic.java", "contentFingerprint": format!("sha256:{:x}", Sha256::digest(source)), "classification": {"role": "SOURCE", "provenance": "AUTHORED", "contentKind": "TEXT"}, "languageHint": "java", "sensitivity": "PUBLIC"}],
            "requestedCapabilities": ["SYMBOL", "IMPORT", "CALL"],
            "deadlineEpochMs": null,
            "resourceBudget": {"maxDurationMs": 10000, "maxMemoryBytes": 67108864, "maxEvents": 100}
        }
    })
}

fn run(request: &Value) -> Vec<Value> {
    let mut child = Command::new(env!("CARGO_BIN_EXE_codeatlas-native-analyzer"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = serde_json::to_vec(request).unwrap();
    input.push(b'\n');
    child.stdin.take().unwrap().write_all(&input).unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(output.stderr.is_empty());
    output
        .stdout
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.is_empty())
        .map(|line| serde_json::from_slice(line).unwrap())
        .collect()
}

#[test]
fn v2_emits_measured_file_capability_coverage_and_versioned_terminal() {
    let events = run(&request());
    assert!(events.iter().all(|event| event["protocolVersion"] == 2));
    let coverage: Vec<_> = events
        .iter()
        .filter(|event| event["type"] == "COVERAGE")
        .collect();
    assert_eq!(coverage.len(), 3);
    assert_eq!(coverage[0]["payload"]["capability"], "SYMBOL");
    assert_eq!(coverage[0]["payload"]["statistics"]["coveredSites"], 7);
    assert_eq!(coverage[0]["payload"]["statistics"]["eligibleSites"], 7);
    assert_eq!(
        coverage[0]["payload"]["statistics"]["resolutionCounts"]["EXACT"],
        0
    );
    assert_eq!(events.last().unwrap()["type"], "ANALYSIS_COMPLETED");
}

#[test]
fn v2_refresh_is_explicitly_rejected_without_starting_analysis() {
    let mut invalid = request();
    invalid["type"] = json!("REFRESH");
    let events = run(&invalid);
    assert_eq!(events.len(), 1);
    assert_eq!(events[0]["protocolVersion"], 2);
    assert_eq!(events[0]["type"], "REQUEST_FAILED");
    assert_eq!(events[0]["payload"]["error"]["code"], "INVALID_REQUEST");
}

#[test]
fn v2_failures_keep_distinct_codes_and_never_complete() {
    for (mutation, expected) in [
        ("memory", "RESOURCE_LIMIT_EXCEEDED"),
        ("events", "RESOURCE_LIMIT_EXCEEDED"),
        ("capability", "UNSUPPORTED_CAPABILITY"),
        ("language", "UNSUPPORTED_LANGUAGE"),
        ("deadline", "BUDGET_EXCEEDED"),
    ] {
        let mut input = request();
        match mutation {
            "memory" => input["payload"]["resourceBudget"]["maxMemoryBytes"] = json!(1),
            "events" => input["payload"]["resourceBudget"]["maxEvents"] = json!(2),
            "capability" => {
                input["payload"]["requestedCapabilities"] = json!(["SYMBOL", "UNKNOWN"])
            }
            "language" => input["payload"]["sourceFiles"][0]["languageHint"] = json!("python"),
            "deadline" => input["payload"]["deadlineEpochMs"] = json!(1_000_000),
            _ => unreachable!(),
        }
        let events = run(&input);
        assert!(
            events.iter().all(|event| event["protocolVersion"] == 2),
            "{mutation}"
        );
        assert!(
            !events
                .iter()
                .any(|event| event["type"] == "ANALYSIS_COMPLETED"),
            "{mutation}"
        );
        let terminal = events.last().unwrap();
        assert!(
            terminal["type"] == "REQUEST_FAILED" || terminal["type"] == "ANALYSIS_FAILED",
            "{mutation}"
        );
        assert_eq!(terminal["payload"]["error"]["code"], expected, "{mutation}");
    }
    let mut unsupported_version = request();
    unsupported_version["protocolVersion"] = json!(3);
    let events = run(&unsupported_version);
    assert_eq!(events[0]["type"], "REQUEST_FAILED");
    assert_eq!(
        events[0]["payload"]["error"]["code"],
        "INCOMPATIBLE_PROTOCOL_VERSION"
    );
}

#[test]
fn v2_valid_empty_file_is_measured_zero_while_malformed_file_is_partial() {
    let root = std::env::temp_dir().join(format!("codeatlas-v2-outcomes-{}", std::process::id()));
    fs::create_dir_all(root.join("src")).unwrap();
    let path = root.join("src/Empty.java");
    let mut input = request();
    input["payload"]["repository"]["rootPath"] = json!(root.to_str().unwrap());
    input["payload"]["sourceFiles"][0]["path"] = json!("src/Empty.java");
    for (source, outcome) in [
        (b"// empty".as_slice(), "SUCCEEDED"),
        (b"class {}".as_slice(), "PARTIAL"),
    ] {
        fs::write(&path, source).unwrap();
        input["payload"]["sourceFiles"][0]["contentFingerprint"] =
            json!(format!("sha256:{:x}", Sha256::digest(source)));
        let events = run(&input);
        assert_eq!(events.last().unwrap()["payload"]["outcome"], outcome);
        assert!(
            events
                .iter()
                .filter(|event| event["type"] == "COVERAGE")
                .all(|event| event["payload"]["statistics"]["eligibleSites"] == 0)
        );
        assert_eq!(
            events.iter().any(|event| event["type"] == "DIAGNOSTIC"),
            outcome == "PARTIAL"
        );
    }
    fs::remove_file(path).unwrap();
    fs::remove_dir(root.join("src")).unwrap();
    fs::remove_dir(root).unwrap();
}
