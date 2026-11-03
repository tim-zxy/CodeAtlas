//! Controlled library unit: owned temporary Source and in-memory output, no native process/profile.
use codeatlas_native_analyzer::syntax::{decode_syntax_request, write_syntax_observation};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/phase1")
}
fn create_owned_directory(nonce: u128) -> std::io::Result<PathBuf> {
    static NEXT_DIRECTORY_ID: AtomicU64 = AtomicU64::new(0);
    let unique = NEXT_DIRECTORY_ID.fetch_add(1, Ordering::Relaxed);
    let folder = std::env::temp_dir().join(format!(
        "codeatlas-syntax-unit-{}-{nonce}-{unique}",
        std::process::id()
    ));
    fs::create_dir(&folder)?;
    Ok(folder)
}
fn setup(changed_hash: bool) -> (PathBuf, codeatlas_native_analyzer::syntax::SyntaxRequest) {
    let source = fs::read(root().join("native-syntax-unit/inputs/app.py")).unwrap();
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let folder = create_owned_directory(nonce).unwrap();
    fs::write(folder.join("app.py"), &source).unwrap();
    let mut r: Value = serde_json::from_slice(
        &fs::read(root().join("syntax-budget-contract/inputs/python-initial-request.jsonl"))
            .unwrap(),
    )
    .unwrap();
    let p = &mut r["payload"];
    p["repository"]["rootPath"] = folder.to_string_lossy().into_owned().into();
    p["languages"][0]["grammarVersion"] = "0.25.0".into();
    p["languages"][0]["analyzerVersion"] = env!("CARGO_PKG_VERSION").into();
    p["sourceFiles"][0]["path"] = "app.py".into();
    p["resourceBudget"]["maxEvents"] = 1000.into();
    p["resourceBudget"]["maxDurationMs"] = 10000.into();
    let fp = if changed_hash {
        "sha256:".to_owned() + &"0".repeat(64)
    } else {
        format!("sha256:{:x}", Sha256::digest(&source))
    };
    p["sourceFiles"][0]["contentFingerprint"] = fp.into();
    // Independent framed owner digest, zero owners and a single Python file.
    let mut h = Sha256::new();
    h.update(b"codeatlas-native-syntax-owner-map-v1\0");
    let t = &p["targetSource"];
    let f = &p["sourceFiles"][0];
    let mut fields = vec![
        t["repositoryId"].as_str().unwrap().to_string(),
        t["revisionId"].as_str().unwrap().into(),
        t["contentFingerprint"].as_str().unwrap().into(),
        "NONE".into(),
        "PROVISIONAL_CODE".into(),
        "c".repeat(64),
        "native".into(),
        "snapshot:one".into(),
        "1".into(),
    ];
    for k in ["id", "path", "contentFingerprint", "languageHint"] {
        fields.push(f[k].as_str().unwrap().into());
    }
    for k in ["role", "provenance", "contentKind"] {
        fields.push(f["classification"][k].as_str().unwrap().into());
    }
    fields.push(f["sensitivity"].as_str().unwrap().into());
    fields.push("0".into());
    for value in fields {
        h.update(value.len().to_string().as_bytes());
        h.update(b":");
        h.update(value.as_bytes());
    }
    p["ownerBinding"]["ownerMapDigest"] = format!("{:x}", h.finalize()).into();
    let mut b = serde_json::to_vec(&r).unwrap();
    b.push(b'\n');
    (folder, decode_syntax_request(&b).unwrap())
}
fn clean(p: PathBuf) {
    let resolved = p.canonicalize().unwrap();
    assert!(resolved.starts_with(std::env::temp_dir().canonicalize().unwrap()));
    assert!(
        resolved
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("codeatlas-syntax-unit-")
    );
    fs::remove_dir_all(resolved).unwrap();
}
#[test]
fn owned_source_complete_terminal_matches_raw_checksum() {
    let (folder, r) = setup(false);
    let mut out = vec![];
    write_syntax_observation(&r, &control(), &mut out).unwrap();
    let records: Vec<_> = out.split_inclusive(|b| *b == b'\n').collect();
    let events: Vec<Value> = records
        .iter()
        .map(|b| serde_json::from_slice(b).unwrap())
        .collect();
    assert_eq!(events[0]["type"], "SYNTAX_STARTED");
    let terminal = events.last().unwrap();
    assert_eq!(terminal["type"], "SYNTAX_COMPLETED");
    assert_eq!(terminal["payload"]["outcome"], "PARTIAL");
    let mut h = Sha256::new();
    for raw in &records[..records.len() - 1] {
        h.update(raw);
    }
    assert_eq!(
        terminal["payload"]["checksum"],
        format!("{:x}", h.finalize())
    );
    assert_eq!(
        terminal["payload"]["targetSource"],
        r.header()["payload"]["targetSource"]
    );
    assert!(
        events
            .iter()
            .any(|e| e["type"] == "NODE" && e["payload"]["name"] == "endpoint")
    );
    if let Some(path) = std::env::var_os("CODEATLAS_SYNTAX_UNIT_OUTPUT") {
        let path = PathBuf::from(path);
        let mut raw = serde_json::to_vec(r.header()).unwrap();
        raw.push(b'\n');
        fs::write(path.join("request.jsonl"), raw).unwrap();
        fs::write(path.join("events.jsonl"), &out).unwrap();
    }
    clean(folder);
}
#[test]
fn changed_source_has_no_applicable_terminal() {
    let (folder, r) = setup(true);
    let mut out = vec![];
    write_syntax_observation(&r, &control(), &mut out).unwrap();
    let events: Vec<Value> = out
        .split_inclusive(|b| *b == b'\n')
        .map(|b| serde_json::from_slice(b).unwrap())
        .collect();
    assert_eq!(events.last().unwrap()["type"], "SYNTAX_FAILED");
    assert_eq!(events.last().unwrap()["payload"]["code"], "SOURCE_CHANGED");
    assert!(!events.iter().any(|e| e["type"] == "SYNTAX_COMPLETED"));
    clean(folder);
}

fn control() -> codeatlas_native_analyzer::syntax::SyntaxWalkControl<'static> {
    static CANCELLED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    codeatlas_native_analyzer::syntax::SyntaxWalkControl {
        deadline: std::time::Instant::now() + std::time::Duration::from_secs(10),
        cancelled: &CANCELLED,
        max_source_bytes: 65536,
        max_items: 1000,
        max_depth: 64,
        max_result_bytes: 65536,
    }
}

#[test]
fn expired_library_control_is_request_failure_not_invalid_sequence_zero_syntax_failure() {
    let (folder, r) = setup(false);
    let mut c = control();
    c.deadline = std::time::Instant::now();
    let mut out = vec![];
    write_syntax_observation(&r, &c, &mut out).unwrap();
    let e: Value = serde_json::from_slice(&out).unwrap();
    assert_eq!(e["type"], "REQUEST_FAILED");
    assert_eq!(e["payload"]["code"], "BUDGET_EXCEEDED");
    clean(folder);
}
#[test]
fn aggregate_input_counts_request_and_verified_source() {
    let (folder, r) = setup(false);
    let mut v = r.header().clone();
    for _ in 0..4 {
        let size = serde_json::to_vec(&v).unwrap().len()
            + 1
            + fs::read(folder.join("app.py")).unwrap().len();
        v["payload"]["resourceBudget"]["maxInputBytes"] = (size - 1).into();
    }
    let mut raw = serde_json::to_vec(&v).unwrap();
    raw.push(b'\n');
    let r = decode_syntax_request(&raw).unwrap();
    let mut out = vec![];
    write_syntax_observation(&r, &control(), &mut out).unwrap();
    let es: Vec<Value> = out
        .split_inclusive(|b| *b == b'\n')
        .map(|b| serde_json::from_slice(b).unwrap())
        .collect();
    assert_eq!(es.last().unwrap()["type"], "SYNTAX_FAILED");
    assert_eq!(
        es.last().unwrap()["payload"]["code"],
        "RESOURCE_LIMIT_EXCEEDED"
    );
    clean(folder);
}
#[test]
fn write_failure_is_propagated_without_attempting_a_second_record() {
    struct Sink(usize);
    impl std::io::Write for Sink {
        fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
            self.0 += 1;
            Err(std::io::Error::new(
                std::io::ErrorKind::BrokenPipe,
                "unit sink closed",
            ))
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let (folder, r) = setup(false);
    let mut sink = Sink(0);
    let error = write_syntax_observation(&r, &control(), &mut sink).unwrap_err();
    assert_eq!(error.kind(), std::io::ErrorKind::BrokenPipe);
    assert_eq!(sink.0, 1);
    clean(folder);
}

#[test]
fn cancellation_is_distinct_from_deadline() {
    let (folder, r) = setup(false);
    let cancelled = std::sync::atomic::AtomicBool::new(true);
    let mut c = control();
    c.cancelled = &cancelled;
    let mut out = vec![];
    write_syntax_observation(&r, &c, &mut out).unwrap();
    let e: Value = serde_json::from_slice(&out).unwrap();
    assert_eq!(e["payload"]["code"], "CANCELLED");
    clean(folder);
}
#[test]
fn event_limit_preserves_terminal_slot() {
    let (folder, r) = setup(false);
    let mut v = r.header().clone();
    v["payload"]["resourceBudget"]["maxEvents"] = 2.into();
    let mut raw = serde_json::to_vec(&v).unwrap();
    raw.push(b'\n');
    let r = decode_syntax_request(&raw).unwrap();
    let mut out = vec![];
    write_syntax_observation(&r, &control(), &mut out).unwrap();
    let es: Vec<Value> = out
        .split_inclusive(|b| *b == b'\n')
        .map(|b| serde_json::from_slice(b).unwrap())
        .collect();
    assert_eq!(es.len(), 2);
    assert_eq!(es[1]["type"], "SYNTAX_FAILED");
    assert_eq!(es[1]["payload"]["code"], "RESOURCE_LIMIT_EXCEEDED");
    clean(folder);
}

#[test]
fn event_and_traversal_budgets_are_distinct_on_the_same_owned_source() {
    let (folder, r) = setup(false);
    let mut value = r.header().clone();
    value["payload"]["resourceBudget"]["maxEvents"] = 20.into();
    let mut bytes = serde_json::to_vec(&value).unwrap();
    bytes.push(b'\n');
    let request = decode_syntax_request(&bytes).unwrap();
    let mut complete = vec![];
    write_syntax_observation(&request, &control(), &mut complete).unwrap();
    let events: Vec<Value> = complete
        .split_inclusive(|b| *b == b'\n')
        .map(|b| serde_json::from_slice(b).unwrap())
        .collect();
    assert_eq!(events.len(), 20);
    assert_eq!(events.last().unwrap()["type"], "SYNTAX_COMPLETED");
    let mut tight = control();
    tight.max_items = 20;
    let mut refused = vec![];
    write_syntax_observation(&request, &tight, &mut refused).unwrap();
    let events: Vec<Value> = refused
        .split_inclusive(|b| *b == b'\n')
        .map(|b| serde_json::from_slice(b).unwrap())
        .collect();
    assert_eq!(events.last().unwrap()["type"], "SYNTAX_FAILED");
    assert_eq!(
        events.last().unwrap()["payload"]["code"],
        "RESOURCE_LIMIT_EXCEEDED"
    );
    clean(folder);
}

#[test]
fn traversal_budget_is_aggregate_across_two_owned_sources() {
    aggregate_traversal_case(false);
}
#[test]
fn java_traversal_budget_is_aggregate_across_two_owned_sources() {
    aggregate_traversal_case(true);
}
fn aggregate_traversal_case(java: bool) {
    let (folder, r) = setup(false);
    let source: &[u8] = if java {
        b"class A {}\n"
    } else {
        b"value = 1\n"
    };
    fs::write(folder.join("app.py"), source).unwrap();
    fs::write(folder.join("second.py"), source).unwrap();
    let mut value = r.header().clone();
    let p = &mut value["payload"];
    if java {
        p["languages"][0]["languageId"] = "java".into();
        p["languages"][0]["grammarVersion"] = "0.23.5".into();
        p["sourceFiles"][0]["languageHint"] = "java".into();
    }
    let fingerprint = format!("sha256:{:x}", Sha256::digest(source));
    p["sourceFiles"][0]["contentFingerprint"] = fingerprint.into();
    let mut second = p["sourceFiles"][0].clone();
    second["id"] = "file:two".into();
    second["path"] = "second.py".into();
    p["sourceFiles"].as_array_mut().unwrap().push(second);
    // Literal AST: each source has5 named nodes visited in discovery and syntax passes,
    // plus1 assignment-value conversion.11 ticks per file,22 total;8 wire events.
    let mut h = Sha256::new();
    h.update(b"codeatlas-native-syntax-owner-map-v1\0");
    let t = &p["targetSource"];
    let mut fields = vec![
        t["repositoryId"].as_str().unwrap().to_string(),
        t["revisionId"].as_str().unwrap().into(),
        t["contentFingerprint"].as_str().unwrap().into(),
        "NONE".into(),
        "PROVISIONAL_CODE".into(),
        "c".repeat(64),
        "native".into(),
        "snapshot:one".into(),
        "2".into(),
    ];
    for f in p["sourceFiles"].as_array().unwrap() {
        for k in ["id", "path", "contentFingerprint", "languageHint"] {
            fields.push(f[k].as_str().unwrap().into());
        }
        for k in ["role", "provenance", "contentKind"] {
            fields.push(f["classification"][k].as_str().unwrap().into());
        }
        fields.push(f["sensitivity"].as_str().unwrap().into());
    }
    fields.push("0".into());
    for v in fields {
        h.update(v.len().to_string());
        h.update(b":");
        h.update(v);
    }
    p["ownerBinding"]["ownerMapDigest"] = format!("{:x}", h.finalize()).into();
    // Java class A {} has4 named Syntax nodes per file; reused Code pass is separate.
    let exact = if java { 8 } else { 22 };
    let event_count = if java { 4 } else { 8 };
    p["resourceBudget"]["maxEvents"] = event_count.into();
    for (items, expected) in [(exact, "SYNTAX_COMPLETED"), (exact - 1, "SYNTAX_FAILED")] {
        value["payload"]["resourceBudget"]["maxItems"] = items.into();
        let mut b = serde_json::to_vec(&value).unwrap();
        b.push(b'\n');
        let request = decode_syntax_request(&b).unwrap();
        let mut output = vec![];
        write_syntax_observation(&request, &control(), &mut output).unwrap();
        let es: Vec<Value> = output
            .split_inclusive(|b| *b == b'\n')
            .map(|b| serde_json::from_slice(b).unwrap())
            .collect();
        assert_eq!(es.last().unwrap()["type"], expected, "maxItems={items}");
        if items == exact {
            assert_eq!(es.len(), event_count as usize);
        } else {
            assert_eq!(
                es.last().unwrap()["payload"]["code"],
                "RESOURCE_LIMIT_EXCEEDED"
            );
        }
    }
    clean(folder);
}

#[test]
fn producer_same_clock_tick_directories_do_not_collide() {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let first = create_owned_directory(nonce).unwrap();
    let second = create_owned_directory(nonce);
    clean(first.clone());
    if let Ok(ref p) = second {
        clean(p.clone());
    }
    assert!(
        second.is_ok(),
        "same clock tick must preserve independent owned Source: {second:?}"
    );
    assert_ne!(first, second.unwrap());
}
