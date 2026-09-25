use std::fs;
use std::io::Write;
use std::process::{Command, Stdio};

use serde_json::{Value, json};
use sha2::{Digest, Sha256};

fn request(source: &[u8]) -> Value {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/native/java-basic-symbol/source")
        .canonicalize()
        .unwrap();
    json!({
        "protocolVersion": 1,
        "requestId": "request-java",
        "type": "ANALYZE",
        "payload": {
            "irSchemaVersion": 1,
            "providerSnapshotId": "snapshot-fixture",
            "repository": {"id": "repo-fixture", "rootPath": root.to_str().unwrap()},
            "requestedCapabilities": ["SYMBOL"],
            "deadlineEpochMs": null,
            "resourceBudget": {"maxDurationMs": 10000, "maxMemoryBytes": 67108864, "maxEvents": 100},
            "revision": {"id": "rev-fixture", "repositoryId": "repo-fixture", "contentFingerprint": "sha256:revision-fixture", "kind": "WORKTREE", "baseRevisionId": null},
            "sourceFiles": [{
                "id": "file-basic", "repositoryId": "repo-fixture", "revisionId": "rev-fixture",
                "path": "src/Basic.java", "contentFingerprint": format!("sha256:{:x}", Sha256::digest(source)),
                "classification": {"role": "SOURCE", "provenance": "AUTHORED", "contentKind": "TEXT"},
                "languageHint": "java", "sensitivity": "PUBLIC"
            }]
        }
    })
}

fn run_analyzer(request: &Value) -> (i32, Vec<Value>, String, Vec<u8>) {
    run_analyzer_with_args(request, &[])
}

fn run_analyzer_with_args(
    request: &Value,
    arguments: &[&str],
) -> (i32, Vec<Value>, String, Vec<u8>) {
    let mut child = Command::new(env!("CARGO_BIN_EXE_codeatlas-native-analyzer"))
        .args(arguments)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = serde_json::to_vec(request).unwrap();
    input.push(b'\n');
    child.stdin.take().unwrap().write_all(&input).unwrap();
    let output = child.wait_with_output().unwrap();
    let events = output
        .stdout
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.is_empty())
        .map(|line| serde_json::from_slice(line).unwrap())
        .collect();
    (
        output.status.code().unwrap(),
        events,
        String::from_utf8(output.stderr).unwrap(),
        output.stdout,
    )
}

#[test]
fn relation_full_analysis_resolves_later_file_and_preserves_worker_order_and_checksum() {
    let root = std::env::temp_dir().join(format!("codeatlas-relations-{}", std::process::id()));
    fs::create_dir_all(root.join("src")).unwrap();
    let first = b"package demo; class A { void go() { B.run(); } }";
    let second = b"package demo; class B { static void run() {} }";
    fs::write(root.join("src/A.java"), first).unwrap();
    fs::write(root.join("src/B.java"), second).unwrap();
    let mut relation_request = request(first);
    relation_request["payload"]["repository"]["rootPath"] = json!(root.to_str().unwrap());
    relation_request["payload"]["sourceFiles"][0]["path"] = json!("src/A.java");
    relation_request["payload"]["sourceFiles"][0]["id"] = json!("file-a");
    relation_request["payload"]["requestedCapabilities"] =
        json!(["SYMBOL", "IMPORT", "CALL", "INHERITANCE", "REFERENCE"]);
    let mut later = relation_request["payload"]["sourceFiles"][0].clone();
    later["path"] = json!("src/B.java");
    later["id"] = json!("file-b");
    later["contentFingerprint"] = json!(format!("sha256:{:x}", Sha256::digest(second)));
    relation_request["payload"]["sourceFiles"]
        .as_array_mut()
        .unwrap()
        .push(later);
    let one = run_analyzer_with_args(&relation_request, &["--parse-workers", "1"]);
    let two = run_analyzer_with_args(&relation_request, &["--parse-workers", "2"]);
    assert_eq!(one.0, 0);
    assert!(one.2.is_empty());
    assert_eq!(one.1, two.1);
    assert_eq!(one.3, two.3);
    let edge = one
        .1
        .iter()
        .find(|event| event["type"] == "EDGE" && event["payload"]["providerKind"] == "java.call")
        .unwrap();
    let target = one
        .1
        .iter()
        .find(|event| {
            event["type"] == "NODE"
                && event["payload"]["providerKind"] == "java.method"
                && event["payload"]["name"] == "run"
        })
        .unwrap();
    assert_eq!(edge["payload"]["target"]["state"], "RESOLVED");
    assert_eq!(
        edge["payload"]["target"]["target"]["providerFactId"],
        target["payload"]["providerFactId"]
    );
    assert_eq!(one.1.last().unwrap()["payload"]["counts"]["edges"], 1);
    assert_eq!(one.1.last().unwrap()["payload"]["counts"]["coverage"], 10);
    let lines: Vec<_> = one.3.split_inclusive(|byte| *byte == b'\n').collect();
    assert_eq!(
        one.1.last().unwrap()["payload"]["integrityChecksum"],
        format!(
            "sha256:{:x}",
            Sha256::digest(lines[..lines.len() - 1].concat())
        )
    );
    fs::remove_file(root.join("src/A.java")).unwrap();
    fs::remove_file(root.join("src/B.java")).unwrap();
    fs::remove_dir(root.join("src")).unwrap();
    fs::remove_dir(root).unwrap();
}

#[test]
fn relation_index_budget_failure_has_typed_terminal_and_no_completion() {
    let source = fs::read(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/native/java-basic-symbol/source/src/Basic.java"),
    )
    .unwrap();
    let mut request = request(&source);
    request["payload"]["requestedCapabilities"] = json!(["SYMBOL", "CALL"]);
    request["payload"]["resourceBudget"]["maxMemoryBytes"] = json!(16 * 1024 * 1024);
    let (_, events, _, _) = run_analyzer_with_args(&request, &["--parse-workers", "1"]);
    assert_eq!(events.last().unwrap()["type"], "ANALYSIS_FAILED");
    assert_eq!(
        events.last().unwrap()["payload"]["error"]["code"],
        "RESOURCE_LIMIT_EXCEEDED"
    );
    assert!(
        !events
            .iter()
            .any(|event| event["type"] == "ANALYSIS_COMPLETED")
    );
}

#[test]
fn relation_zero_fact_and_syntax_partial_have_distinct_success_outcomes() {
    let root =
        std::env::temp_dir().join(format!("codeatlas-relations-empty-{}", std::process::id()));
    fs::create_dir_all(root.join("src")).unwrap();
    let source = b"class Empty {}";
    fs::write(root.join("src/Empty.java"), source).unwrap();
    let mut request = request(source);
    request["payload"]["repository"]["rootPath"] = json!(root.to_str().unwrap());
    request["payload"]["sourceFiles"][0]["path"] = json!("src/Empty.java");
    request["payload"]["requestedCapabilities"] = json!(["SYMBOL", "CALL"]);
    let (_, empty, _, _) = run_analyzer(&request);
    assert_eq!(empty.last().unwrap()["payload"]["outcome"], "SUCCEEDED");
    assert_eq!(empty.last().unwrap()["payload"]["counts"]["edges"], 0);
    assert_eq!(empty.last().unwrap()["payload"]["counts"]["coverage"], 2);
    let broken = b"class Broken { void run( }";
    fs::write(root.join("src/Empty.java"), broken).unwrap();
    request["payload"]["sourceFiles"][0]["contentFingerprint"] =
        json!(format!("sha256:{:x}", Sha256::digest(broken)));
    let (_, partial, _, _) = run_analyzer(&request);
    assert_eq!(partial.last().unwrap()["payload"]["outcome"], "PARTIAL");
    assert!(partial.iter().any(|event| event["type"] == "DIAGNOSTIC"));
    fs::remove_file(root.join("src/Empty.java")).unwrap();
    fs::remove_dir(root.join("src")).unwrap();
    fs::remove_dir(root).unwrap();
}

#[test]
fn relation_event_limit_fails_without_a_success_terminal() {
    let source = fs::read(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/native/java-basic-symbol/source/src/Basic.java"),
    )
    .unwrap();
    let mut request = request(&source);
    request["payload"]["requestedCapabilities"] = json!(["SYMBOL", "CALL"]);
    request["payload"]["resourceBudget"]["maxEvents"] = json!(3);
    let (_, events, _, _) = run_analyzer(&request);
    assert_eq!(events.last().unwrap()["type"], "ANALYSIS_FAILED");
    assert_eq!(
        events.last().unwrap()["payload"]["error"]["code"],
        "RESOURCE_LIMIT_EXCEEDED"
    );
    assert!(
        !events
            .iter()
            .any(|event| event["type"] == "ANALYSIS_COMPLETED")
    );
}

#[test]
fn bounded_scheduler_preserves_event_order_across_worker_counts() {
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/native");
    let basic = fs::read(fixture.join("java-basic-symbol/source/src/Basic.java")).unwrap();
    let nested = fs::read(fixture.join("java-nested-types/source/src/Outer.java")).unwrap();
    let root = std::env::temp_dir().join(format!("codeatlas-workers-{}", std::process::id()));
    fs::create_dir_all(root.join("src")).unwrap();
    fs::write(root.join("src/Basic.java"), &basic).unwrap();
    fs::write(root.join("src/Outer.java"), &nested).unwrap();
    let mut request = request(&basic);
    request["payload"]["repository"]["rootPath"] = json!(root.to_str().unwrap());
    let mut second = request["payload"]["sourceFiles"][0].clone();
    second["id"] = json!("file-nested");
    second["path"] = json!("src/Outer.java");
    second["contentFingerprint"] = json!(format!("sha256:{:x}", Sha256::digest(&nested)));
    request["payload"]["sourceFiles"]
        .as_array_mut()
        .unwrap()
        .push(second);
    let one = run_analyzer_with_args(&request, &["--parse-workers", "1"]);
    let two = run_analyzer_with_args(&request, &["--parse-workers", "2"]);
    assert_eq!(one.0, 0);
    assert_eq!(two.0, 0);
    assert_eq!(one.1, two.1);
    assert_eq!(one.3, two.3);
    let impossible = run_analyzer_with_args(&request, &["--parse-workers", "5"]);
    assert_eq!(impossible.1[0]["type"], "REQUEST_FAILED");
    assert_eq!(
        impossible.1[0]["payload"]["error"]["code"],
        "RESOURCE_LIMIT_EXCEEDED"
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn streams_exact_java_facts_with_counts_and_checksum() {
    let source = fs::read(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/native/java-basic-symbol/source/src/Basic.java"),
    )
    .unwrap();
    let (exit, events, stderr, stdout) = run_analyzer(&request(&source));
    assert_eq!(exit, 0);
    assert!(stderr.is_empty());
    assert_eq!(events[0]["type"], "ANALYSIS_STARTED");
    assert_eq!(events[0]["sequence"], 0);
    assert_eq!(events.last().unwrap()["type"], "ANALYSIS_COMPLETED");
    for (index, event) in events.iter().enumerate() {
        assert_eq!(event["sequence"], index);
        assert_eq!(event["requestId"], "request-java");
    }
    let nodes: Vec<_> = events
        .iter()
        .filter(|event| event["type"] == "NODE")
        .map(|event| &event["payload"])
        .collect();
    let expected: Vec<Value> = serde_json::from_str(include_str!(
        "../../../fixtures/native/java-basic-symbol/expected/nodes.json"
    ))
    .unwrap();
    assert_eq!(nodes, expected.iter().collect::<Vec<_>>());
    let terminal = events.last().unwrap();
    assert_eq!(terminal["payload"]["counts"]["nodes"], nodes.len());
    assert_eq!(terminal["payload"]["counts"]["sourceFiles"], 1);
    assert_eq!(terminal["payload"]["counts"]["coverage"], 1);
    let lines: Vec<_> = stdout.split_inclusive(|byte| *byte == b'\n').collect();
    let pre_terminal = lines[..lines.len() - 1].concat();
    assert_eq!(
        terminal["payload"]["integrityChecksum"],
        format!("sha256:{:x}", Sha256::digest(&pre_terminal))
    );
}

#[test]
fn malformed_and_stale_requests_never_report_success() {
    let source = fs::read(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/native/java-basic-symbol/source/src/Basic.java"),
    )
    .unwrap();
    let mut invalid = request(&source);
    invalid["payload"]["unknown"] = json!(true);
    let (_, events, _, _) = run_analyzer(&invalid);
    assert_eq!(events.last().unwrap()["type"], "REQUEST_FAILED");

    let mut stale = request(&source);
    stale["payload"]["sourceFiles"][0]["contentFingerprint"] =
        json!(format!("sha256:{}", "0".repeat(64)));
    let (_, events, _, _) = run_analyzer(&stale);
    assert_eq!(events.last().unwrap()["type"], "ANALYSIS_FAILED");
    assert_eq!(
        events.last().unwrap()["payload"]["error"]["code"],
        "SOURCE_CHANGED"
    );
}

#[test]
fn rejects_cross_context_duplicates_and_unsupported_requests() {
    let source = fs::read(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/native/java-basic-symbol/source/src/Basic.java"),
    )
    .unwrap();
    let mut mismatched = request(&source);
    mismatched["payload"]["revision"]["repositoryId"] = json!("another-repo");
    let (_, events, _, _) = run_analyzer(&mismatched);
    assert_eq!(events.last().unwrap()["type"], "REQUEST_FAILED");

    let mut duplicated = request(&source);
    let file = duplicated["payload"]["sourceFiles"][0].clone();
    duplicated["payload"]["sourceFiles"]
        .as_array_mut()
        .unwrap()
        .push(file);
    let (_, events, _, _) = run_analyzer(&duplicated);
    assert_eq!(events.last().unwrap()["type"], "REQUEST_FAILED");

    let mut capability = request(&source);
    capability["payload"]["requestedCapabilities"] = json!(["CALL"]);
    let (_, events, _, _) = run_analyzer(&capability);
    assert_eq!(
        events.last().unwrap()["payload"]["error"]["code"],
        "UNSUPPORTED_CAPABILITY"
    );

    let mut language = request(&source);
    language["payload"]["sourceFiles"][0]["languageHint"] = json!("python");
    let (_, events, _, _) = run_analyzer(&language);
    assert_eq!(
        events.last().unwrap()["payload"]["error"]["code"],
        "UNSUPPORTED_LANGUAGE"
    );

    let mut binary = request(&source);
    binary["payload"]["sourceFiles"][0]["classification"]["contentKind"] = json!("BINARY");
    let (_, events, _, _) = run_analyzer(&binary);
    assert_eq!(events.last().unwrap()["type"], "ANALYSIS_FAILED");
    assert_eq!(
        events.last().unwrap()["payload"]["error"]["code"],
        "INVALID_REQUEST"
    );
}

#[test]
fn expired_deadline_and_event_limit_fail_without_completion() {
    let source = fs::read(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/native/java-basic-symbol/source/src/Basic.java"),
    )
    .unwrap();
    let mut expired = request(&source);
    expired["payload"]["deadlineEpochMs"] = json!(-1);
    let (_, events, _, _) = run_analyzer(&expired);
    assert_eq!(events.last().unwrap()["type"], "ANALYSIS_FAILED");
    assert_eq!(
        events.last().unwrap()["payload"]["error"]["code"],
        "BUDGET_EXCEEDED"
    );

    let mut small = request(&source);
    small["payload"]["resourceBudget"]["maxEvents"] = json!(3);
    let (_, events, _, _) = run_analyzer(&small);
    assert_eq!(events.last().unwrap()["type"], "ANALYSIS_FAILED");
    assert_eq!(
        events.last().unwrap()["payload"]["error"]["code"],
        "RESOURCE_LIMIT_EXCEEDED"
    );
}

#[test]
fn malformed_java_is_partial_and_empty_java_succeeds_without_facts() {
    let root = std::env::temp_dir().join(format!("codeatlas-analyze-{}", std::process::id()));
    fs::create_dir_all(root.join("src")).unwrap();
    for (source, outcome, nodes, diagnostics) in [
        (b"class Broken { void run( }".as_slice(), "PARTIAL", 1, 1),
        (b"".as_slice(), "SUCCEEDED", 0, 0),
    ] {
        fs::write(root.join("src/Basic.java"), source).unwrap();
        let mut request = request(source);
        request["payload"]["repository"]["rootPath"] = json!(root.to_str().unwrap());
        let (_, events, _, _) = run_analyzer(&request);
        let terminal = events.last().unwrap();
        assert_eq!(terminal["type"], "ANALYSIS_COMPLETED");
        assert_eq!(terminal["payload"]["outcome"], outcome);
        assert_eq!(terminal["payload"]["counts"]["nodes"], nodes);
        assert_eq!(terminal["payload"]["counts"]["diagnostics"], diagnostics);
    }
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn large_source_result_budget_has_failed_terminal() {
    let root = std::env::temp_dir().join(format!("codeatlas-result-budget-{}", std::process::id()));
    fs::create_dir_all(root.join("src")).unwrap();
    let mut source = String::from("class Many { ");
    for _ in 0..9_000 {
        source.push_str("int a; ");
    }
    source.push('}');
    fs::write(root.join("src/Basic.java"), &source).unwrap();
    let mut input = request(source.as_bytes());
    input["payload"]["repository"]["rootPath"] = json!(root.to_str().unwrap());
    let (exit, events, _, _) = run_analyzer(&input);
    assert_eq!(exit, 0);
    assert_eq!(events[0]["type"], "ANALYSIS_STARTED");
    assert_eq!(events.last().unwrap()["type"], "ANALYSIS_FAILED");
    assert_eq!(
        events.last().unwrap()["payload"]["error"]["code"],
        "RESOURCE_LIMIT_EXCEEDED"
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn source_above_measured_admission_band_fails_before_parsing() {
    let root = std::env::temp_dir().join(format!("codeatlas-source-cap-{}", std::process::id()));
    fs::create_dir_all(root.join("src")).unwrap();
    let mut source = String::from("class Many { ");
    for index in 0..9_000 {
        source.push_str(&format!("int field{index}; "));
    }
    source.push('}');
    assert!(source.len() > 64 * 1024);
    fs::write(root.join("src/Basic.java"), &source).unwrap();
    let mut input = request(source.as_bytes());
    input["payload"]["repository"]["rootPath"] = json!(root.to_str().unwrap());
    let (exit, events, _, _) = run_analyzer(&input);
    assert_eq!(exit, 0);
    assert_eq!(events.last().unwrap()["type"], "ANALYSIS_FAILED");
    assert_eq!(
        events.last().unwrap()["payload"]["error"]["code"],
        "RESOURCE_LIMIT_EXCEEDED"
    );
    fs::remove_dir_all(root).unwrap();
}
