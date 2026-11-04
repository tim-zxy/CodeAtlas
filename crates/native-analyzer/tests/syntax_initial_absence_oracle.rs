//! Owned Source/library-only comparison against independently frozen literal expected output.
use codeatlas_native_analyzer::syntax::{
    SyntaxWalkControl, decode_syntax_request, write_syntax_observation,
};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
fn root(fixture_name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/phase1")
        .join(fixture_name)
}
fn create_owned_directory(nonce: u128) -> std::io::Result<PathBuf> {
    static NEXT_DIRECTORY_ID: AtomicU64 = AtomicU64::new(0);
    let unique = NEXT_DIRECTORY_ID.fetch_add(1, Ordering::Relaxed);
    let folder = std::env::temp_dir().join(format!(
        "codeatlas-initial-oracle-{}-{}-{}",
        std::process::id(),
        nonce,
        unique
    ));
    fs::create_dir(&folder)?;
    Ok(folder)
}
fn clean_owned_folder(folder: PathBuf) {
    let resolved = folder.canonicalize().unwrap();
    assert!(resolved.starts_with(std::env::temp_dir().canonicalize().unwrap()));
    assert!(
        resolved
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("codeatlas-initial-oracle-")
    );
    fs::remove_dir_all(resolved).unwrap();
}
fn run_case(fixture_name: &str, mode: &str, changed: bool) {
    let fixture = root(fixture_name).join(mode);
    let mut request: Value =
        serde_json::from_slice(&fs::read(fixture.join("request.json")).unwrap()).unwrap();
    let folder = create_owned_directory(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
    )
    .unwrap();
    let mut source = fs::read(fixture.join("app.py")).unwrap();
    if changed {
        source.extend_from_slice(b"# changed\n");
    }
    fs::write(folder.join("app.py"), source).unwrap();
    request["payload"]["repository"]["rootPath"] = folder.to_string_lossy().into_owned().into();
    let mut raw = serde_json::to_vec(&request).unwrap();
    raw.push(b'\n');
    let request = decode_syntax_request(&raw).unwrap();
    let cancelled = AtomicBool::new(false);
    let c = SyntaxWalkControl {
        deadline: Instant::now() + Duration::from_secs(10),
        cancelled: &cancelled,
        max_source_bytes: 65536,
        max_items: 1000,
        max_depth: 64,
        max_result_bytes: 65536,
    };
    let mut out = vec![];
    write_syntax_observation(&request, &c, &mut out).unwrap();
    let records: Vec<_> = out.split_inclusive(|b| *b == b'\n').collect();
    let mut actual: Vec<Value> = records
        .iter()
        .map(|b| serde_json::from_slice(b).unwrap())
        .collect();
    if changed {
        assert_eq!(actual.last().unwrap()["type"], "SYNTAX_FAILED");
        assert_eq!(actual.last().unwrap()["payload"]["code"], "SOURCE_CHANGED");
        assert!(!actual.iter().any(|e| e["type"] == "SYNTAX_COMPLETED"));
    } else {
        let mut h = Sha256::new();
        for b in &records[..records.len() - 1] {
            h.update(b);
        }
        assert_eq!(
            actual.last().unwrap()["payload"]["checksum"],
            format!("{:x}", h.finalize())
        );
        println!(
            "CODEATLAS_INITIAL_ORACLE {}",
            serde_json::json!({"fixture":fixture_name,"mode":mode,"request":request.header(),"raw":String::from_utf8(out.clone()).unwrap()})
        );
        let oracle = fs::read(fixture.join("events.jsonl")).unwrap();
        let mut expected: Vec<Value> = oracle
            .split_inclusive(|b| *b == b'\n')
            .map(|b| serde_json::from_slice(b).unwrap())
            .collect();
        assert_eq!(
            actual.len(),
            if fixture_name == "syntax-dynamic-malformed-oracle" {
                9
            } else if fixture_name == "syntax-nested-source-oracle" {
                8
            } else {
                11
            }
        );
        actual.last_mut().unwrap()["payload"]
            .as_object_mut()
            .unwrap()
            .remove("checksum");
        expected.last_mut().unwrap()["payload"]
            .as_object_mut()
            .unwrap()
            .remove("checksum");
        assert_eq!(
            actual, expected,
            "{mode}: entire stream must match frozen literal oracle"
        );
    }
    clean_owned_folder(folder);
}
#[test]
fn calibration_full_literal_oracle() {
    run_case("syntax-initial-absence-oracle", "calibration", false);
}
#[test]
fn holdout_full_literal_oracle() {
    run_case("syntax-initial-absence-oracle", "holdout", false);
}
#[test]
fn changed_source_cannot_publish_initial_result() {
    run_case("syntax-initial-absence-oracle", "calibration", true);
}

#[test]
fn present_calibration_full_literal_oracle() {
    run_case("syntax-present-activation-oracle", "calibration", false);
}
#[test]
fn present_holdout_full_literal_oracle() {
    run_case("syntax-present-activation-oracle", "holdout", false);
}
#[test]
fn present_changed_source_cannot_complete() {
    run_case("syntax-present-activation-oracle", "calibration", true);
}

#[test]
fn same_clock_tick_allocations_do_not_collide() {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let first = create_owned_directory(nonce).unwrap();
    let second = create_owned_directory(nonce);
    clean_owned_folder(first.clone());
    if let Ok(ref p) = second {
        clean_owned_folder(p.clone());
    }
    assert!(
        second.is_ok(),
        "second exclusive owned directory at the same clock tick must succeed: {second:?}"
    );
    assert_ne!(first, second.unwrap());
}

fn run_java_case(mode: &str, variant: &str) {
    let fixture_name = "syntax-java-owner-oracle";
    let fixture = root(fixture_name).join(mode);
    let request_file = match variant {
        "missing" => "request-no-method.json",
        "foreign" => "request-foreign-owner.json",
        _ => "request.json",
    };
    let mut v: Value =
        serde_json::from_slice(&fs::read(fixture.join(request_file)).unwrap()).unwrap();
    let folder = create_owned_directory(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
    )
    .unwrap();
    let mut source = fs::read(fixture.join("Endpoint.java")).unwrap();
    if variant == "changed" {
        source.extend_from_slice(b"// changed\n");
    }
    fs::write(folder.join("Endpoint.java"), &source).unwrap();
    v["payload"]["repository"]["rootPath"] = folder.to_string_lossy().into_owned().into();
    let mut raw = serde_json::to_vec(&v).unwrap();
    raw.push(b'\n');
    let request = decode_syntax_request(&raw).unwrap();
    let cancelled = AtomicBool::new(false);
    let c = SyntaxWalkControl {
        deadline: Instant::now() + Duration::from_secs(10),
        cancelled: &cancelled,
        max_source_bytes: 65536,
        max_items: 1000,
        max_depth: 64,
        max_result_bytes: 65536,
    };
    if variant == "normal" {
        let symbols = codeatlas_native_analyzer::java::JavaAnalyzer::new()
            .unwrap()
            .analyze_until(
                "Endpoint.java",
                &source,
                c.deadline,
                &cancelled,
                c.max_result_bytes,
            )
            .unwrap()
            .symbols;
        let actual:Vec<Value>=symbols.iter().map(|s|serde_json::json!({"providerFactId":s.provider_fact_id,"providerKind":s.provider_kind,"name":s.name,"qualifiedName":s.qualified_name,"signature":s.signature,"isStatic":s.is_static,"span":{"startLine":s.span.start_line,"startColumn":s.span.start_column,"endLine":s.span.end_line,"endColumn":s.span.end_column}})).collect();
        let expected: Value =
            serde_json::from_slice(&fs::read(fixture.join("symbols.json")).unwrap()).unwrap();
        assert_eq!(serde_json::json!(actual), expected);
        println!(
            "CODEATLAS_JAVA_SYMBOLS {}",
            serde_json::json!({"mode":mode,"symbols":actual})
        );
    }
    let mut out = vec![];
    write_syntax_observation(&request, &c, &mut out).unwrap();
    let records: Vec<_> = out.split_inclusive(|b| *b == b'\n').collect();
    let mut actual: Vec<Value> = records
        .iter()
        .map(|b| serde_json::from_slice(b).unwrap())
        .collect();
    if variant == "foreign" || variant == "changed" {
        assert_eq!(actual.last().unwrap()["type"], "SYNTAX_FAILED");
        assert_eq!(
            actual.last().unwrap()["payload"]["code"],
            if variant == "foreign" {
                "INVALID_REQUEST"
            } else {
                "SOURCE_CHANGED"
            }
        );
        assert!(!actual.iter().any(|e| e["type"] == "SYNTAX_COMPLETED"));
    } else {
        let mut h = Sha256::new();
        for b in &records[..records.len() - 1] {
            h.update(b);
        }
        assert_eq!(
            actual.last().unwrap()["payload"]["checksum"],
            format!("{:x}", h.finalize())
        );
        println!(
            "CODEATLAS_JAVA_ORACLE {}",
            serde_json::json!({"mode":mode,"variant":variant,"request":request.header(),"raw":String::from_utf8(out.clone()).unwrap()})
        );
        let expected_file = if variant == "missing" {
            "events-no-method.jsonl"
        } else {
            "events.jsonl"
        };
        let expected_bytes = fs::read(fixture.join(expected_file)).unwrap();
        let mut expected: Vec<Value> = expected_bytes
            .split_inclusive(|b| *b == b'\n')
            .map(|b| serde_json::from_slice(b).unwrap())
            .collect();
        assert_eq!(actual.len(), 5);
        actual.last_mut().unwrap()["payload"]
            .as_object_mut()
            .unwrap()
            .remove("checksum");
        expected.last_mut().unwrap()["payload"]
            .as_object_mut()
            .unwrap()
            .remove("checksum");
        assert_eq!(actual, expected, "{mode}/{variant}:complete Java oracle");
    }
    clean_owned_folder(folder);
}
#[test]
fn java_calibration_exact_owner_oracle() {
    run_java_case("calibration", "normal");
}
#[test]
fn java_holdout_exact_owner_oracle() {
    run_java_case("holdout", "normal");
}
#[test]
fn java_calibration_missing_method_never_falls_back() {
    run_java_case("calibration", "missing");
}
#[test]
fn java_holdout_missing_method_never_falls_back() {
    run_java_case("holdout", "missing");
}
#[test]
fn java_foreign_owner_cannot_complete() {
    run_java_case("calibration", "foreign");
}
#[test]
fn java_changed_source_cannot_complete() {
    run_java_case("calibration", "changed");
}

fn run_mixed_case(mode: &str, variant: &str) {
    let fixture = root("syntax-mixed-provisional-oracle").join(mode);
    let mut value: Value =
        serde_json::from_slice(&fs::read(fixture.join("request.json")).unwrap()).unwrap();
    if variant == "reverse" {
        value["payload"]["sourceFiles"]
            .as_array_mut()
            .unwrap()
            .reverse();
    }
    let folder = create_owned_directory(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
    )
    .unwrap();
    for name in ["Endpoint.java", "app.py"] {
        let mut source = fs::read(fixture.join(name)).unwrap();
        if variant == "changed" && name == "app.py" {
            source.extend_from_slice(b"# changed\n");
        }
        fs::write(folder.join(name), source).unwrap();
    }
    value["payload"]["repository"]["rootPath"] = folder.to_string_lossy().into_owned().into();
    let mut raw = serde_json::to_vec(&value).unwrap();
    raw.push(b'\n');
    let request = decode_syntax_request(&raw).unwrap();
    let no = AtomicBool::new(false);
    let control = SyntaxWalkControl {
        deadline: Instant::now() + Duration::from_secs(10),
        cancelled: &no,
        max_source_bytes: 65536,
        max_items: 1000,
        max_depth: 64,
        max_result_bytes: 65536,
    };
    if variant == "normal" {
        let source = fs::read(fixture.join("Endpoint.java")).unwrap();
        let symbols = codeatlas_native_analyzer::java::JavaAnalyzer::new()
            .unwrap()
            .analyze_until(
                "Endpoint.java",
                &source,
                control.deadline,
                &no,
                control.max_result_bytes,
            )
            .unwrap()
            .symbols;
        let actual:Vec<Value>=symbols.iter().map(|s|serde_json::json!({"providerFactId":s.provider_fact_id,"providerKind":s.provider_kind,"name":s.name,"qualifiedName":s.qualified_name,"signature":s.signature,"isStatic":s.is_static,"span":{"startLine":s.span.start_line,"startColumn":s.span.start_column,"endLine":s.span.end_line,"endColumn":s.span.end_column}})).collect();
        let expected: Value =
            serde_json::from_slice(&fs::read(fixture.join("java-symbols.json")).unwrap()).unwrap();
        assert_eq!(serde_json::json!(actual), expected);
        println!(
            "CODEATLAS_MIXED_SYMBOLS {}",
            serde_json::json!({"mode":mode,"symbols":actual})
        );
    }
    let mut out = vec![];
    write_syntax_observation(&request, &control, &mut out).unwrap();
    let records: Vec<_> = out.split_inclusive(|b| *b == b'\n').collect();
    let mut actual: Vec<Value> = records
        .iter()
        .map(|b| serde_json::from_slice(b).unwrap())
        .collect();
    let expected_file = if variant == "changed" {
        "events-changed-python.jsonl"
    } else {
        "events.jsonl"
    };
    let expected_bytes = fs::read(fixture.join(expected_file)).unwrap();
    let mut expected: Vec<Value> = expected_bytes
        .split_inclusive(|b| *b == b'\n')
        .map(|b| serde_json::from_slice(b).unwrap())
        .collect();
    if variant == "changed" {
        assert_eq!(actual.last().unwrap()["payload"]["code"], "SOURCE_CHANGED");
        assert!(
            actual
                .iter()
                .any(|e| e["type"] == "COVERAGE" && e["payload"]["sourceFileId"] == "file:one")
        );
        assert!(!actual.iter().any(|e| e["type"] == "SYNTAX_COMPLETED"));
    } else {
        let mut h = Sha256::new();
        for b in &records[..records.len() - 1] {
            h.update(b);
        }
        assert_eq!(
            actual.last().unwrap()["payload"]["checksum"],
            format!("{:x}", h.finalize())
        );
        assert_eq!(actual.len(), 14);
        actual.last_mut().unwrap()["payload"]
            .as_object_mut()
            .unwrap()
            .remove("checksum");
        expected.last_mut().unwrap()["payload"]
            .as_object_mut()
            .unwrap()
            .remove("checksum");
    }
    assert_eq!(
        actual, expected,
        "{mode}/{variant}:complete mixed reference"
    );
    println!(
        "CODEATLAS_MIXED_ORACLE {}",
        serde_json::json!({"mode":mode,"variant":variant,"request":request.header(),"raw":String::from_utf8(out).unwrap()})
    );
    clean_owned_folder(folder);
}
#[test]
fn mixed_calibration_full_reference() {
    run_mixed_case("calibration", "normal");
}
#[test]
fn mixed_holdout_full_reference() {
    run_mixed_case("holdout", "normal");
}
#[test]
fn mixed_calibration_reversed_inventory() {
    run_mixed_case("calibration", "reverse");
}
#[test]
fn mixed_holdout_reversed_inventory() {
    run_mixed_case("holdout", "reverse");
}
#[test]
fn mixed_second_file_changed_cannot_complete() {
    run_mixed_case("calibration", "changed");
}

#[test]
fn dynamic_calibration_full_literal_oracle() {
    run_case("syntax-dynamic-malformed-oracle", "calibration", false);
}
#[test]
fn dynamic_holdout_full_literal_oracle() {
    run_case("syntax-dynamic-malformed-oracle", "holdout", false);
}
#[test]
fn dynamic_changed_source_cannot_complete() {
    run_case("syntax-dynamic-malformed-oracle", "calibration", true);
}

#[test]
fn nested_calibration_full_literal_oracle() {
    run_case("syntax-nested-source-oracle", "calibration", false);
}
#[test]
fn nested_holdout_full_literal_oracle() {
    run_case("syntax-nested-source-oracle", "holdout", false);
}
#[test]
fn nested_changed_source_cannot_complete() {
    run_case("syntax-nested-source-oracle", "calibration", true);
}

fn run_bounded_case(mode: &str, variant: &str) {
    let fixture = root("syntax-bounded-output-oracle").join(mode);
    let full = fs::read(fixture.join("events.jsonl")).unwrap();
    let mut value: Value =
        serde_json::from_slice(&fs::read(fixture.join("request.json")).unwrap()).unwrap();
    match variant {
        "events-exact" => value["payload"]["resourceBudget"]["maxEvents"] = 68.into(),
        "events-short" => value["payload"]["resourceBudget"]["maxEvents"] = 67.into(),
        "bytes-exact" => value["payload"]["resourceBudget"]["maxOutputBytes"] = full.len().into(),
        "bytes-short" => {
            value["payload"]["resourceBudget"]["maxOutputBytes"] = (full.len() - 1).into()
        }
        _ => {}
    }
    let folder = create_owned_directory(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
    )
    .unwrap();
    let mut source = fs::read(fixture.join("app.py")).unwrap();
    if variant == "changed-source" {
        source.extend_from_slice(b"# changed\n");
    }
    fs::write(folder.join("app.py"), source).unwrap();
    value["payload"]["repository"]["rootPath"] = folder.to_string_lossy().into_owned().into();
    let mut raw = serde_json::to_vec(&value).unwrap();
    raw.push(b'\n');
    let request = decode_syntax_request(&raw).unwrap();
    let no = AtomicBool::new(false);
    let control = SyntaxWalkControl {
        deadline: Instant::now() + Duration::from_secs(10),
        cancelled: &no,
        max_source_bytes: 65536,
        max_items: 1000,
        max_depth: 64,
        max_result_bytes: 65536,
    };
    let mut out = vec![];
    write_syntax_observation(&request, &control, &mut out).unwrap();
    let records: Vec<_> = out.split_inclusive(|b| *b == b'\n').collect();
    let mut actual: Vec<Value> = records
        .iter()
        .map(|b| serde_json::from_slice(b).unwrap())
        .collect();
    let failure = matches!(variant, "events-short" | "bytes-short" | "changed-source");
    let expected_bytes = if failure {
        fs::read(fixture.join(format!("events-{variant}.jsonl"))).unwrap()
    } else {
        full.clone()
    };
    let mut expected: Vec<Value> = expected_bytes
        .split_inclusive(|b| *b == b'\n')
        .map(|b| serde_json::from_slice(b).unwrap())
        .collect();
    if failure {
        assert!(!actual.iter().any(|e| e["type"] == "SYNTAX_COMPLETED"));
        assert_eq!(
            actual.last().unwrap()["payload"]["code"],
            if variant == "changed-source" {
                "SOURCE_CHANGED"
            } else {
                "RESOURCE_LIMIT_EXCEEDED"
            }
        );
    } else {
        assert_eq!(actual.len(), 68);
        assert_eq!(out.len(), full.len());
        let mut h = Sha256::new();
        for b in &records[..records.len() - 1] {
            h.update(b);
        }
        assert_eq!(
            actual.last().unwrap()["payload"]["checksum"],
            format!("{:x}", h.finalize())
        );
        actual.last_mut().unwrap()["payload"]
            .as_object_mut()
            .unwrap()
            .remove("checksum");
        expected.last_mut().unwrap()["payload"]
            .as_object_mut()
            .unwrap()
            .remove("checksum");
    }
    assert_eq!(actual, expected, "{mode}/{variant}:entire bounded stream");
    println!(
        "CODEATLAS_BOUNDED_ORACLE {}",
        serde_json::json!({"mode":mode,"variant":variant,"request":request.header(),"raw":String::from_utf8(out).unwrap()})
    );
    clean_owned_folder(folder);
}
#[test]
fn bounded_calibration_full_reference() {
    run_bounded_case("calibration", "normal");
}
#[test]
fn bounded_holdout_full_reference() {
    run_bounded_case("holdout", "normal");
}
#[test]
fn bounded_exact_event_allowance() {
    run_bounded_case("calibration", "events-exact");
}
#[test]
fn bounded_one_below_event_allowance() {
    run_bounded_case("calibration", "events-short");
}
#[test]
fn bounded_exact_byte_allowance() {
    run_bounded_case("calibration", "bytes-exact");
}
#[test]
fn bounded_one_below_byte_allowance() {
    run_bounded_case("calibration", "bytes-short");
}
#[test]
fn bounded_changed_source_refuses() {
    run_bounded_case("calibration", "changed-source");
}

fn run_changed_only_case(mode: &str, variant: &str) {
    let fixture = root("syntax-changed-only-oracle").join(mode);
    let mut value: Value =
        serde_json::from_slice(&fs::read(fixture.join("request.json")).unwrap()).unwrap();
    let folder = create_owned_directory(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
    )
    .unwrap();
    let mut source = fs::read(fixture.join("app.py")).unwrap();
    if variant == "changed-source" {
        source.extend_from_slice(b"# changed\n");
    }
    fs::write(folder.join("app.py"), source).unwrap();
    if variant == "poison" || variant == "reconstruct" {
        for name in ["removed.py", "retained.py"] {
            fs::create_dir(folder.join(name)).unwrap();
        }
    }
    value["payload"]["repository"]["rootPath"] = folder.to_string_lossy().into_owned().into();
    let no = AtomicBool::new(false);
    let control = SyntaxWalkControl {
        deadline: Instant::now() + Duration::from_secs(10),
        cancelled: &no,
        max_source_bytes: 65536,
        max_items: 1000,
        max_depth: 64,
        max_result_bytes: 65536,
    };
    let mut prior = None;
    for repetition in 0..if variant == "reconstruct" { 2 } else { 1 } {
        let mut raw = serde_json::to_vec(&value).unwrap();
        raw.push(b'\n');
        let request = decode_syntax_request(&raw).unwrap();
        let mut out = vec![];
        write_syntax_observation(&request, &control, &mut out).unwrap();
        let records: Vec<_> = out.split_inclusive(|b| *b == b'\n').collect();
        let mut actual: Vec<Value> = records
            .iter()
            .map(|b| serde_json::from_slice(b).unwrap())
            .collect();
        let expected_file = if variant == "changed-source" {
            "events-changed-source.jsonl"
        } else {
            "events.jsonl"
        };
        let mut expected: Vec<Value> = fs::read(fixture.join(expected_file))
            .unwrap()
            .split_inclusive(|b| *b == b'\n')
            .map(|b| serde_json::from_slice(b).unwrap())
            .collect();
        if variant == "changed-source" {
            assert_eq!(actual.last().unwrap()["payload"]["code"], "SOURCE_CHANGED");
            assert!(!actual.iter().any(|e| e["type"] == "SYNTAX_COMPLETED"));
        } else {
            assert_eq!(actual.len(), 6);
            let mut h = Sha256::new();
            for b in &records[..records.len() - 1] {
                h.update(b);
            }
            assert_eq!(
                actual.last().unwrap()["payload"]["checksum"],
                format!("{:x}", h.finalize())
            );
            actual.last_mut().unwrap()["payload"]
                .as_object_mut()
                .unwrap()
                .remove("checksum");
            expected.last_mut().unwrap()["payload"]
                .as_object_mut()
                .unwrap()
                .remove("checksum");
        }
        assert_eq!(
            actual, expected,
            "{mode}/{variant}:entire changed-only reference"
        );
        if let Some(ref previous) = prior {
            assert_eq!(
                &out, previous,
                "fresh library construction must preserve exact bytes"
            );
        }
        prior = Some(out.clone());
        if variant == "poison" || variant == "reconstruct" {
            for name in ["removed.py", "retained.py"] {
                assert!(folder.join(name).is_dir());
            }
        }
        println!(
            "CODEATLAS_CHANGED_ONLY_ORACLE {}",
            serde_json::json!({"mode":mode,"variant":variant,"repetition":repetition,"request":request.header(),"raw":String::from_utf8(out).unwrap()})
        );
    }
    clean_owned_folder(folder);
}
#[test]
fn changed_only_calibration_full_reference() {
    run_changed_only_case("calibration", "normal");
}
#[test]
fn changed_only_holdout_full_reference() {
    run_changed_only_case("holdout", "normal");
}
#[test]
fn changed_only_calibration_ignores_unrequested_directories() {
    run_changed_only_case("calibration", "poison");
}
#[test]
fn changed_only_holdout_ignores_unrequested_directories() {
    run_changed_only_case("holdout", "poison");
}
#[test]
fn changed_only_same_process_reconstruction_is_deterministic() {
    run_changed_only_case("calibration", "reconstruct");
}
#[test]
fn changed_only_changed_source_refuses() {
    run_changed_only_case("calibration", "changed-source");
}
