//! Strict request-only tests; no actual observer/profile claim.
use codeatlas_native_analyzer::syntax::decode_syntax_request;
use serde_json::Value;
use std::{fs, path::PathBuf};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/phase1/syntax-budget-contract")
}
fn bytes(name: &str) -> Vec<u8> {
    fs::read(root().join(format!("inputs/{name}-request.jsonl"))).unwrap()
}
#[test]
fn shared_current_owner_requests() {
    let expected: Value =
        serde_json::from_slice(&fs::read(root().join("expected/outcomes.json")).unwrap()).unwrap();
    for name in ["java", "python", "java-provisional", "python-initial"] {
        let raw = bytes(name);
        let parsed = decode_syntax_request(&raw).unwrap();
        assert_eq!(
            parsed.header()["payload"]["ownerBinding"]["ownerMapDigest"],
            expected[name]["ownerMapDigest"]
        );
    }
}
#[test]
fn strict_request_refusals() {
    for change in [
        "stage",
        "owner",
        "source",
        "snapshot",
        "extra",
        "legacy",
        "protocol",
        "sequence",
        "null-active",
        "target",
        "budget",
    ] {
        let mut r: Value = serde_json::from_slice(&bytes("java-provisional")).unwrap();
        match change {
            "stage" => r["payload"]["ownerBinding"]["stageDigest"] = "d".repeat(64).into(),
            "owner" => r["payload"]["owners"][0]["canonicalRef"]["entity"]["id"] = "other".into(),
            "source" => r["payload"]["sourceFiles"][0]["contentFingerprint"] = "changed".into(),
            "snapshot" => r["payload"]["providerSnapshotId"] = "changed".into(),
            "extra" => r["payload"]["databasePath"] = "forbidden".into(),
            "legacy" => {
                let p = r["payload"].as_object_mut().unwrap();
                let b = p.remove("expectedActivationBasis").unwrap();
                p.insert("basis".into(), b);
            }
            "protocol" => r["protocolVersion"] = 3.into(),
            "sequence" => r["sequence"] = 1.into(),
            "null-active" => {
                r["payload"]["expectedActivationBasis"] = Value::Null;
                r["payload"]["ownerBinding"]["kind"] = "ACTIVE_CODE".into();
            }
            "target" => r["payload"]["targetSource"]["revisionId"] = "other".into(),
            "budget" => r["payload"]["resourceBudget"]["maxEvents"] = 0.into(),
            _ => unreachable!(),
        }
        let mut b = serde_json::to_vec(&r).unwrap();
        b.push(b'\n');
        assert!(decode_syntax_request(&b).is_err(), "{change}");
    }
}
#[test]
fn strict_raw_framing_and_caps() {
    let raw = bytes("java");
    let mut missing = raw.clone();
    missing.pop();
    assert!(decode_syntax_request(&missing).is_err());
    let mut multiple = raw.clone();
    multiple.extend_from_slice(&raw);
    assert!(decode_syntax_request(&multiple).is_err());
    let mut bom = vec![239, 187, 191];
    bom.extend_from_slice(&raw);
    assert!(decode_syntax_request(&bom).is_err());
    let mut crlf = raw.clone();
    crlf.insert(crlf.len() - 1, b'\r');
    assert!(decode_syntax_request(&crlf).is_err());
    assert!(decode_syntax_request(&vec![b' '; 1_000_001]).is_err());
}

#[test]
fn traversal_budget_is_required_and_independent() {
    let raw = bytes("python-initial");
    assert!(decode_syntax_request(&raw).is_ok());
    for value in [
        Value::Null,
        serde_json::json!(0),
        serde_json::json!(-1),
        serde_json::json!(1.5),
        serde_json::json!(9007199254740992_u64),
    ] {
        let mut r: Value = serde_json::from_slice(&raw).unwrap();
        if value.is_null() {
            r["payload"]["resourceBudget"]
                .as_object_mut()
                .unwrap()
                .remove("maxItems");
        } else {
            r["payload"]["resourceBudget"]["maxItems"] = value;
        }
        let mut b = serde_json::to_vec(&r).unwrap();
        b.push(b'\n');
        assert!(decode_syntax_request(&b).is_err());
    }
}
