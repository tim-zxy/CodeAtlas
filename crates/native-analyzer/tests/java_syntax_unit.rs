//! Literal grammar/owner-map unit tests, not actual observer/profile evidence.
use codeatlas_native_analyzer::{
    java::JavaAnalyzer,
    java_syntax::JavaSyntaxAnalyzer,
    syntax::{SyntaxWalkControl, decode_syntax_request},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::AtomicBool,
    time::{Duration, Instant},
};
const SOURCE:&[u8]=b"package sample; class Handler { @Route(path=\"/items\", tags={\"one\",\"two\"}) void handle() { client.send(\"topic\"); } @Route(path=PREFIX+\"/dynamic\") void dynamic() {} }";
fn request() -> codeatlas_native_analyzer::syntax::SyntaxRequest {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/phase1/syntax-budget-contract");
    let mut r: Value =
        serde_json::from_slice(&fs::read(root.join("inputs/java-request.jsonl")).unwrap()).unwrap();
    let no = AtomicBool::new(false);
    let symbols = JavaAnalyzer::new()
        .unwrap()
        .analyze_until(
            "src/Handler.java",
            SOURCE,
            Instant::now() + Duration::from_secs(10),
            &no,
            65536,
        )
        .unwrap()
        .symbols;
    r["payload"]["owners"]=json!(symbols.iter().filter(|s|s.provider_kind=="java.method").map(|s|json!({"sourceFileId":"file:one","providerNodeRef":{"factType":"NODE","providerId":"native","providerFactId":s.provider_fact_id},"canonicalRef":{"scope":"REPOSITORY","repositoryId":"repo:one","entity":{"kind":"CODE_NODE","id":format!("code:{}",s.name),"revisionId":"revision:worktree"}}})).collect::<Vec<_>>());
    // Independent literal framing of the already documented owner-map digest.
    let p = &r["payload"];
    let b = &p["expectedActivationBasis"];
    let t = &p["targetSource"];
    let mut fields = vec![
        t["repositoryId"].as_str().unwrap().to_string(),
        t["revisionId"].as_str().unwrap().into(),
        t["contentFingerprint"].as_str().unwrap().into(),
        "ACTIVE".into(),
    ];
    for k in [
        "repositoryId",
        "revisionId",
        "contentFingerprint",
        "codeActivationDigest",
    ] {
        fields.push(b[k].as_str().unwrap().into());
    }
    fields.push("ACTIVE_CODE".into());
    fields.push(b["codeActivationDigest"].as_str().unwrap().into());
    fields.push("native".into());
    fields.push("snapshot:one".into());
    fields.push("1".into());
    let f = &p["sourceFiles"][0];
    for k in ["id", "path", "contentFingerprint", "languageHint"] {
        fields.push(f[k].as_str().unwrap().into());
    }
    for k in ["role", "provenance", "contentKind"] {
        fields.push(f["classification"][k].as_str().unwrap().into());
    }
    fields.push(f["sensitivity"].as_str().unwrap().into());
    let mut owners = p["owners"].as_array().unwrap().clone();
    owners.sort_by_key(|o| {
        o["providerNodeRef"]["providerFactId"]
            .as_str()
            .unwrap()
            .to_owned()
    });
    fields.push(owners.len().to_string());
    for o in owners {
        fields.push("file:one".into());
        fields.push("native".into());
        fields.push(
            o["providerNodeRef"]["providerFactId"]
                .as_str()
                .unwrap()
                .into(),
        );
        fields.push("repo:one".into());
        fields.push("CODE_NODE".into());
        fields.push(o["canonicalRef"]["entity"]["id"].as_str().unwrap().into());
        fields.push("revision:worktree".into());
    }
    let mut h = Sha256::new();
    h.update(b"codeatlas-native-syntax-owner-map-v1\0");
    for value in fields {
        h.update(value.len().to_string().as_bytes());
        h.update(b":");
        h.update(value.as_bytes());
    }
    r["payload"]["ownerBinding"]["ownerMapDigest"] = format!("{:x}", h.finalize()).into();
    let mut b = serde_json::to_vec(&r).unwrap();
    b.push(b'\n');
    decode_syntax_request(&b).unwrap()
}
#[test]
fn exact_declaration_owners_literals_and_unknown_dynamic() {
    let r = request();
    let no = AtomicBool::new(false);
    let c = SyntaxWalkControl {
        deadline: Instant::now() + Duration::from_secs(10),
        cancelled: &no,
        max_source_bytes: 65536,
        max_items: 1000,
        max_depth: 64,
        max_result_bytes: 65536,
    };
    let out = JavaSyntaxAnalyzer::new()
        .unwrap()
        .observe(&r, 0, SOURCE, &c)
        .unwrap();
    assert!(out.nodes.is_empty() && out.edges.is_empty());
    let decorations: Vec<_> = out
        .observations
        .iter()
        .filter(|o| o["syntaxKind"] == "DECORATION")
        .collect();
    assert_eq!(decorations.len(), 2);
    let owners = r.header()["payload"]["owners"].as_array().unwrap();
    let expected = owners
        .iter()
        .find(|o| o["canonicalRef"]["entity"]["id"] == "code:handle")
        .unwrap();
    assert_eq!(decorations[0]["owner"], expected["providerNodeRef"]);
    assert_eq!(
        decorations[0]["payload"]["arguments"][0]["value"],
        json!({"kind":"STRING","value":"/items"})
    );
    assert_eq!(
        decorations[1]["payload"]["arguments"][0]["value"]["kind"],
        "UNKNOWN"
    );
    assert_eq!(out.coverage["status"], "PARTIAL");
    assert!(out.observations.iter().any(
        |o| o["syntaxKind"] == "INVOCATION" && o["payload"]["callee"]["name"] == "client.send"
    ));
}
#[test]
fn deadline_refuses_without_partial_result() {
    let r = request();
    let no = AtomicBool::new(false);
    let c = SyntaxWalkControl {
        deadline: Instant::now() - Duration::from_secs(1),
        cancelled: &no,
        max_source_bytes: 65536,
        max_items: 1000,
        max_depth: 64,
        max_result_bytes: 65536,
    };
    assert!(
        JavaSyntaxAnalyzer::new()
            .unwrap()
            .observe(&r, 0, SOURCE, &c)
            .is_err()
    );
}
