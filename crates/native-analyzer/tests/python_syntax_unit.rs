//! Bounded literal-input parser unit tests only. No process/profile or activation claim.
use codeatlas_native_analyzer::{
    python::{PythonSyntaxAnalyzer, SyntaxWalkControl},
    syntax::decode_syntax_request,
};
use serde_json::Value;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::AtomicBool,
    time::{Duration, Instant},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/phase1")
}
fn request() -> codeatlas_native_analyzer::syntax::SyntaxRequest {
    let b = fs::read(root().join("syntax-budget-contract/inputs/python-initial-request.jsonl"))
        .unwrap();
    let mut r: Value = serde_json::from_slice(&b).unwrap();
    r["payload"]["languages"][0]["grammarVersion"] = "0.25.0".into();
    r["payload"]["languages"][0]["analyzerVersion"] = env!("CARGO_PKG_VERSION").into();
    let mut bytes = serde_json::to_vec(&r).unwrap();
    bytes.push(b'\n');
    decode_syntax_request(&bytes).unwrap()
}

#[test]
fn literals_aliases_functions_and_honest_dynamic_values() {
    let source = fs::read(root().join("python-syntax-unit/inputs/app.py")).unwrap();
    let expected: Value = serde_json::from_slice(
        &fs::read(root().join("python-syntax-unit/expected/probes.json")).unwrap(),
    )
    .unwrap();
    let cancelled = AtomicBool::new(false);
    let control = SyntaxWalkControl {
        deadline: Instant::now() + Duration::from_secs(10),
        cancelled: &cancelled,
        max_source_bytes: 65536,
        max_items: 1000,
        max_depth: 64,
        max_result_bytes: 65536,
    };
    let out = PythonSyntaxAnalyzer::new()
        .unwrap()
        .observe(&request(), 0, &source, &control)
        .unwrap();
    let names: Vec<_> = out
        .nodes
        .iter()
        .filter(|n| n["providerKind"] == "python.symbol")
        .map(|n| n["name"].clone())
        .collect();
    assert_eq!(serde_json::json!(names), expected["functions"]);
    let decorators: Vec<_> = out
        .observations
        .iter()
        .filter(|n| n["syntaxKind"] == "DECORATION")
        .collect();
    assert_eq!(decorators.len(), 2);
    assert_eq!(
        decorators[0]["payload"]["callee"]["name"],
        expected["decorators"][0]
    );
    assert_eq!(
        decorators[0]["payload"]["arguments"][0]["value"]["value"],
        expected["literalPath"]
    );
    assert_eq!(
        decorators[1]["payload"]["arguments"][0]["value"]["reason"],
        expected["dynamicReason"]
    );
    for d in decorators {
        assert_eq!(d["owner"]["factType"], "NODE");
        let id = &d["owner"]["providerFactId"];
        assert!(out.nodes.iter().any(|n| n["providerFactId"] == *id));
    }
    assert!(
        out.edges
            .iter()
            .any(|e| e["providerKind"] == "python.import"
                && e["target"]["originalHint"] == expected["importHint"])
    );
    assert!(out.observations.iter().any(
        |o| o["syntaxKind"] == "ASSIGNMENT" && o["payload"]["targetName"] == expected["alias"]
    ));
    assert_eq!(out.coverage["status"], expected["coverage"]);
}
#[test]
fn explicit_budgets_cancel_and_deadline_refuse_without_partial_result() {
    let source = b"def hello():\n    return 1\n";
    let cancelled = AtomicBool::new(true);
    let mut c = SyntaxWalkControl {
        deadline: Instant::now() + Duration::from_secs(10),
        cancelled: &cancelled,
        max_source_bytes: 65536,
        max_items: 100,
        max_depth: 32,
        max_result_bytes: 65536,
    };
    let mut a = PythonSyntaxAnalyzer::new().unwrap();
    assert!(a.observe(&request(), 0, source, &c).is_err());
    let no = AtomicBool::new(false);
    c.cancelled = &no;
    c.deadline = Instant::now() - Duration::from_secs(1);
    assert!(a.observe(&request(), 0, source, &c).is_err());
    c.deadline = Instant::now() + Duration::from_secs(10);
    c.max_items = 1;
    assert!(a.observe(&request(), 0, source, &c).is_err());
    c.max_items = 100;
    c.max_source_bytes = 1;
    assert!(a.observe(&request(), 0, source, &c).is_err());
}
#[test]
fn identical_literal_input_is_deterministic_after_new_parser() {
    let source = b"def function():\n    return 1\n";
    let no = AtomicBool::new(false);
    let c = SyntaxWalkControl {
        deadline: Instant::now() + Duration::from_secs(10),
        cancelled: &no,
        max_source_bytes: 65536,
        max_items: 100,
        max_depth: 32,
        max_result_bytes: 65536,
    };
    let r = request();
    let a = PythonSyntaxAnalyzer::new()
        .unwrap()
        .observe(&r, 0, source, &c)
        .unwrap();
    let b = PythonSyntaxAnalyzer::new()
        .unwrap()
        .observe(&r, 0, source, &c)
        .unwrap();
    assert_eq!(a, b);
}

#[test]
fn unrepresentable_dictionary_keys_remain_unknown() {
    let no = AtomicBool::new(false);
    let c = SyntaxWalkControl {
        deadline: Instant::now() + Duration::from_secs(10),
        cancelled: &no,
        max_source_bytes: 65536,
        max_items: 1000,
        max_depth: 64,
        max_result_bytes: 65536,
    };
    for source in [
        "mapping = {\"\": 1, \" padded \": 2}\n",
        "mapping = {\"\u{feff}key\": 1}\n",
    ] {
        let out = PythonSyntaxAnalyzer::new()
            .unwrap()
            .observe(&request(), 0, source.as_bytes(), &c)
            .unwrap();
        let assignment = out
            .observations
            .iter()
            .find(|o| o["syntaxKind"] == "ASSIGNMENT")
            .unwrap();
        assert_eq!(assignment["payload"]["value"]["kind"], "UNKNOWN");
    }
}
#[test]
fn declared_grammar_mismatch_is_not_accepted() {
    let no = AtomicBool::new(false);
    let c = SyntaxWalkControl {
        deadline: Instant::now() + Duration::from_secs(10),
        cancelled: &no,
        max_source_bytes: 65536,
        max_items: 1000,
        max_depth: 64,
        max_result_bytes: 65536,
    };
    let mut r = request().header().clone();
    r["payload"]["languages"][0]["grammarVersion"] = "other".into();
    let mut b = serde_json::to_vec(&r).unwrap();
    b.push(b'\n');
    let request = decode_syntax_request(&b).unwrap();
    assert!(
        PythonSyntaxAnalyzer::new()
            .unwrap()
            .observe(&request, 0, b"value = 1\n", &c)
            .is_err()
    );
}
