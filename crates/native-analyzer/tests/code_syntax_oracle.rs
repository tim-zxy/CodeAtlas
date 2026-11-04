#[path = "support/code_syntax.rs"]
mod support;
use std::{fs, io::Write, path::PathBuf};
use support::*;
fn create_new(path: PathBuf, bytes: &[u8]) {
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .unwrap();
    f.write_all(bytes).unwrap();
}
#[test]
fn all_source_families_match_full_raw_oracles() {
    let cases: serde_json::Value =
        serde_json::from_slice(&fs::read(fixture().join("cases.json")).unwrap()).unwrap();
    for case in cases.as_array().unwrap() {
        let c = Case::new(case["id"].as_str().unwrap());
        let actual = c.emit().unwrap();
        if actual != c.expected {
            let debug = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../.superpowers/sdd/2026-10-24-phase1-code-syntax-producer")
                .join(format!("library-debug-{}", unique_name()));
            fs::create_dir(&debug).unwrap();
            create_new(debug.join("request.jsonl"), &c.raw);
            create_new(debug.join("actual.jsonl"), &actual);
            create_new(debug.join("expected.jsonl"), &c.expected);
            let at = actual
                .iter()
                .zip(&c.expected)
                .position(|(a, b)| a != b)
                .unwrap_or(actual.len().min(c.expected.len()));
            panic!(
                "{} raw mismatch at byte{};debug {}",
                c.id,
                at,
                debug.display()
            );
        }
        if let Some(root) = std::env::var_os("CODEATLAS_CODE_SYNTAX_LIBRARY_OUTPUT_ROOT") {
            let root = PathBuf::from(root).canonicalize().unwrap();
            let allowed = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join(
                    "../../.superpowers/sdd/2026-10-24-phase1-code-syntax-producer/library-output",
                )
                .canonicalize()
                .unwrap();
            assert!(root.starts_with(&allowed) && root != allowed);
            let dir = root.join(&c.id);
            fs::create_dir(&dir).unwrap();
            for (name, b) in [
                ("request.jsonl", &c.raw),
                ("events.jsonl", &actual),
                ("expected.jsonl", &c.expected),
            ] {
                create_new(dir.join(name), b);
            }
            let manifest = serde_json::json!({"schemaVersion":1,"executionKind":"RUST_LIBRARY_TEST_ONLY","measurementEligible":false,"caseId":c.id,"requestFile":"request.jsonl","eventsFile":"events.jsonl","expectedFile":"expected.jsonl","requestSha256":sha(&c.raw),"eventsSha256":sha(&actual),"expectedSha256":sha(&c.expected)});
            create_new(
                dir.join("manifest.json"),
                &serde_json::to_vec_pretty(&manifest).unwrap(),
            );
        }
    }
}
