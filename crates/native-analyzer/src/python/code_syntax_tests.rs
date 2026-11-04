use super::*;
use crate::code_syntax::decode_code_syntax_request;
use std::{
    path::PathBuf,
    sync::atomic::AtomicBool,
    time::{Duration, Instant},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/phase1/code-syntax-producer-oracle")
}
fn observe(id: &str) -> crate::code_syntax::CodeSyntaxFileObservation {
    let base = root().join("cases").join(id);
    let raw = std::fs::read(base.join("request.template.jsonl")).unwrap();
    let r = decode_code_syntax_request(&raw).unwrap();
    let p = &r.header()["payload"];
    let index = p["sourceFiles"]
        .as_array()
        .unwrap()
        .iter()
        .position(|f| f["languageHint"] == "python")
        .unwrap();
    let source = std::fs::read(
        base.join("sources")
            .join(p["sourceFiles"][index]["path"].as_str().unwrap()),
    )
    .unwrap();
    let cancel = AtomicBool::new(false);
    let b = &p["resourceBudget"];
    let control = SyntaxWalkControl {
        deadline: Instant::now() + Duration::from_millis(b["maxDurationMs"].as_u64().unwrap()),
        cancelled: &cancel,
        max_source_bytes: b["maxInputBytes"].as_u64().unwrap() as usize,
        max_items: b["maxItems"].as_u64().unwrap() as usize,
        max_depth: b["maxDepth"].as_u64().unwrap() as usize,
        max_result_bytes: b["maxOutputBytes"].as_u64().unwrap() as usize,
    };
    PythonSyntaxAnalyzer::new()
        .unwrap()
        .observe_code_syntax(p, index, &source, &control)
        .unwrap()
}
fn expected(id: &str, kind: &str) -> Vec<Value> {
    std::fs::read_to_string(root().join("cases").join(id).join("events.template.jsonl"))
        .unwrap()
        .lines()
        .map(|l| serde_json::from_str::<Value>(l).unwrap())
        .filter(|v| v["type"] == kind)
        .map(|v| v["payload"].clone())
        .collect()
}
#[test]
fn wildcard_is_an_unsupported_import_unit() {
    let r = observe("wildcard-python");
    assert_eq!(
        r.code_coverage,
        expected("wildcard-python", "CODE_COVERAGE")
    );
    assert_eq!(r.syntax.coverage["status"], "PARTIAL");
}
#[test]
fn class_never_proves_complete_function_scope() {
    let r = observe("class-python");
    assert_eq!(r.code_coverage, expected("class-python", "CODE_COVERAGE"));
}
#[test]
fn nested_async_declarations_keep_ids_and_owners() {
    for id in ["nested-python", "async-python"] {
        let r = observe(id);
        assert_eq!(r.syntax.nodes, expected(id, "NODE"));
        assert_eq!(r.syntax.observations, expected(id, "SYNTAX_OBSERVATION"));
    }
}
#[test]
fn repeated_values_have_distinct_occurrences() {
    let r = observe("nested-repeated-values");
    assert_eq!(r.syntax.edges, expected("nested-repeated-values", "EDGE"));
    assert_eq!(
        r.code_coverage,
        expected("nested-repeated-values", "CODE_COVERAGE")
    );
}
#[test]
fn discarded_dictionary_has_no_orphan_edges() {
    let r = observe("discarded-dictionary");
    assert_eq!(r.syntax.edges.len(), 0);
    assert_eq!(
        r.code_coverage,
        expected("discarded-dictionary", "CODE_COVERAGE")
    );
}
#[test]
fn all_python_code_units_match_frozen_source_oracles() {
    for id in [
        "empty-python",
        "comment-python",
        "malformed-python",
        "dynamic-python",
        "alias-reference-python",
        "multi-import-from",
        "class-owner-gap",
        "unicode-control",
    ] {
        let r = observe(id);
        assert_eq!(r.code_coverage, expected(id, "CODE_COVERAGE"), "{id}");
        assert_eq!(
            r.syntax.observations,
            expected(id, "SYNTAX_OBSERVATION"),
            "{id}"
        );
    }
}
#[test]
fn legacy_dictionary_retains_old_behavior() {
    let raw = std::fs::read(root().join("legacy-v4/request.template.jsonl")).unwrap();
    let r = crate::syntax::decode_syntax_request(&raw).unwrap();
    let source = std::fs::read(root().join("cases/discarded-dictionary/sources/app.py")).unwrap();
    let cancel = AtomicBool::new(false);
    let c = SyntaxWalkControl {
        deadline: Instant::now() + Duration::from_secs(1),
        cancelled: &cancel,
        max_source_bytes: 65536,
        max_items: 1000,
        max_depth: 64,
        max_result_bytes: 65536,
    };
    let r = PythonSyntaxAnalyzer::new()
        .unwrap()
        .observe(&r, 0, &source, &c)
        .unwrap();
    assert_eq!(r.edges.len(), 1);
    assert_eq!(r.coverage["status"], "PARTIAL");
}
