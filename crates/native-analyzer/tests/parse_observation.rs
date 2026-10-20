use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::process::{Command, Stdio};

fn header() -> Value {
    let raw = include_str!("../../../fixtures/ipc/protocol-v3/valid-full.jsonl");
    let mut h: Value = serde_json::from_str(raw.lines().next().unwrap()).unwrap();
    h["payload"]["repository"]["rootPath"] = json!(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/native/java-basic-symbol/source")
            .canonicalize()
            .unwrap()
    );
    h["payload"]["resourceBudget"]["maxMemoryBytes"] = json!(128 * 1024 * 1024);
    h["payload"]["resourceBudget"]["maxDurationMs"] = json!(10000);
    h["payload"]["resourceBudget"]["maxEvents"] = json!(10000);
    h
}

fn file() -> Value {
    let bytes = include_bytes!("../../../fixtures/native/java-basic-symbol/source/src/Basic.java");
    json!({"id":"private-source-id","repositoryId":"r","revisionId":"rev",
        "path":"src/Basic.java","contentFingerprint":format!("sha256:{:x}",Sha256::digest(bytes)),
        "classification":{"role":"SOURCE","provenance":"AUTHORED","contentKind":"TEXT"},
        "languageHint":"java","sensitivity":"PUBLIC"})
}

fn run(h: Value, workers: &str) -> (Vec<Value>, Vec<Value>) {
    let prefix = format!("{h}\n");
    let completion = json!({"protocolVersion":3,"requestId":h["requestId"],"sequence":1,
        "type":"REQUEST_COMPLETED","payload":{"summaryRecords":0,
        "integrityChecksum":format!("{:x}",Sha256::digest(prefix.as_bytes()))}});
    let mut child = Command::new(env!("CARGO_BIN_EXE_codeatlas-native-analyzer"))
        .args(["--parse-workers", workers])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(format!("{prefix}{completion}\n").as_bytes())
        .unwrap();
    let out = child.wait_with_output().unwrap();
    assert!(out.status.success());
    let lines = |bytes: &[u8]| {
        bytes
            .split(|b| *b == b'\n')
            .filter(|x| !x.is_empty())
            .map(|x| serde_json::from_slice::<Value>(x).unwrap())
            .collect::<Vec<_>>()
    };
    (lines(&out.stdout), lines(&out.stderr))
}

fn assert_trace(trace: &[Value], operation: &str, count: usize, workers: u64) {
    assert_eq!(
        trace.len(),
        2 + 2 * count,
        "real parser diagnostics missing or deduplicated"
    );
    let request_ref = format!(
        "{:x}",
        Sha256::digest(b"codeatlas-parse-request-v1\x003\x00req")
    );
    for (index, event) in trace.iter().enumerate() {
        assert_eq!(event["diagnosticSchema"], 1);
        assert_eq!(event["kind"], "NATIVE_PARSE_OBSERVATION");
        assert_eq!(event["requestRefSha256"], request_ref);
        assert_eq!(event["ordinal"], index);
        assert!(!event.to_string().contains("private-source-id"));
        assert!(!event.to_string().contains("Basic.java"));
    }
    assert_eq!(trace[0]["event"], "BEGIN");
    assert_eq!(trace[0]["operation"], operation);
    assert_eq!(trace[0]["workerLimit"], workers);
    let end = trace.last().unwrap();
    assert_eq!(end["event"], "END");
    assert_eq!(end["started"], count);
    assert_eq!(end["finished"], count);
    assert_eq!(end["complete"], true);
    assert!(end["reason"].is_null());
    let expected: Value = serde_json::from_str(include_str!(
        "../../../fixtures/evaluation/native-parse-observation/expected/results.json"
    ))
    .unwrap();
    assert_eq!(trace[0]["requestRefSha256"], expected["requestRefSha256"]);
}

#[test]
fn observation_full_preserves_both_real_relation_passes() {
    for (caps, count) in [
        (json!(["SYMBOL"]), 1),
        (
            json!(["SYMBOL", "IMPORT", "CALL", "INHERITANCE", "REFERENCE"]),
            2,
        ),
    ] {
        let mut h = header();
        h["payload"]["sourceFiles"] = json!([file()]);
        h["payload"]["requestedCapabilities"] = caps;
        let (events, trace) = run(h, "1");
        assert_eq!(events.last().unwrap()["type"], "ANALYSIS_COMPLETED");
        assert_trace(&trace, "ANALYZE", count, 1);
        let source_ref = format!(
            "{:x}",
            Sha256::digest(b"codeatlas-parse-source-v1\x00private-source-id")
        );
        for entry in &trace[1..trace.len() - 1] {
            assert_eq!(entry["sourceRefSha256"], source_ref);
            assert_eq!(entry["slot"], 0);
        }
    }
}

#[test]
fn observation_empty_refresh_has_no_fabricated_parser_invocation() {
    let raw = include_str!("../../../fixtures/ipc/protocol-v3/valid-empty-refresh.jsonl");
    let mut h: Value = serde_json::from_str(raw.lines().next().unwrap()).unwrap();
    h["payload"]["repository"]["rootPath"] = header()["payload"]["repository"]["rootPath"].clone();
    h["payload"]["resourceBudget"]["maxMemoryBytes"] = json!(128 * 1024 * 1024);
    let (events, trace) = run(h, "2");
    assert_eq!(events.last().unwrap()["type"], "REFRESH_COMPLETED");
    assert_trace(&trace, "REFRESH", 0, 2);
    let vectors: Value = serde_json::from_str(include_str!(
        "../../../fixtures/evaluation/native-parse-observation/inputs/vectors.json"
    ))
    .unwrap();
    assert_eq!(json!(trace), vectors["emptyRefresh"]);
}

#[test]
fn observation_fifty_relation_files_retain_one_hundred_real_parses() {
    let root = std::env::temp_dir().join(format!(
        "codeatlas-observation-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir(&root).unwrap();
    let mut files = Vec::new();
    for index in 0..50 {
        let bytes = format!("class C{index} {{ void m() {{}} }}");
        let name = format!("C{index}.java");
        std::fs::write(root.join(&name), bytes.as_bytes()).unwrap();
        let mut f = file();
        f["id"] = json!(format!("source-{index}"));
        f["path"] = json!(name);
        f["contentFingerprint"] = json!(format!("sha256:{:x}", Sha256::digest(bytes.as_bytes())));
        files.push(f);
    }
    let mut h = header();
    h["payload"]["repository"]["rootPath"] = json!(root);
    h["payload"]["sourceFiles"] = json!(files);
    h["payload"]["requestedCapabilities"] =
        json!(["SYMBOL", "IMPORT", "CALL", "INHERITANCE", "REFERENCE"]);
    let (events, trace) = run(h, "2");
    assert_eq!(events.last().unwrap()["type"], "ANALYSIS_COMPLETED");
    assert_trace(&trace, "ANALYZE", 100, 2);
    for source in files {
        let hash = format!(
            "{:x}",
            Sha256::digest(format!(
                "codeatlas-parse-source-v1\x00{}",
                source["id"].as_str().unwrap()
            ))
        );
        assert_eq!(
            trace
                .iter()
                .filter(|e| e["event"] == "PARSE_STARTED" && e["sourceRefSha256"] == hash)
                .count(),
            2
        );
    }
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn observation_source_refusal_never_fabricates_a_finish() {
    let mut h = header();
    let mut f = file();
    f["contentFingerprint"] = json!(format!("sha256:{}", "0".repeat(64)));
    h["payload"]["sourceFiles"] = json!([f]);
    let (events, trace) = run(h, "1");
    assert_eq!(events.last().unwrap()["type"], "ANALYSIS_FAILED");
    assert_trace(&trace, "ANALYZE", 0, 1);
}
