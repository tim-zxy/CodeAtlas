use codeatlas_native_analyzer::{
    code_syntax::decode_code_syntax_request, syntax::decode_syntax_request,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
fn bytes() -> Vec<u8> {
    std::fs::read(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/phase1/code-syntax-producer-oracle/cases/alias-reference-python/request.template.jsonl")).unwrap()
}
fn raw() -> Vec<u8> {
    String::from_utf8(bytes())
        .unwrap()
        .replace("\"__OWNED_ROOT__\"", "\"/fixture/producer\"")
        .into_bytes()
}
fn encoded(v: &Value) -> Vec<u8> {
    let mut b = serde_json::to_vec(v).unwrap();
    b.push(b'\n');
    b
}
#[test]
fn v5_raw_request_checksum_includes_lf_and_whitespace() {
    let mut b = raw();
    b.insert(0, b' ');
    let r = decode_code_syntax_request(&b).expect("frozen valid v5 request");
    assert_eq!(r.request_checksum(), format!("{:x}", Sha256::digest(&b)));
    assert_eq!(r.header()["protocolVersion"], 5);
    assert_eq!(
        decode_syntax_request(&b).unwrap_err().code(),
        "INCOMPATIBLE_PROTOCOL_VERSION"
    );
}
#[test]
fn old_versions_do_not_fall_back() {
    let mut v: Value = serde_json::from_slice(&raw()).unwrap();
    for n in [1, 2, 3, 4, 6] {
        v["protocolVersion"] = json!(n);
        assert_eq!(
            decode_code_syntax_request(&encoded(&v)).unwrap_err().code(),
            "INCOMPATIBLE_PROTOCOL_VERSION"
        );
    }
}
#[test]
fn strict_fields_and_context_match_ts() {
    for key in ["contract", "authority", "repo", "digest", "secret"] {
        let mut v: Value = serde_json::from_slice(&raw()).unwrap();
        match key {
            "contract" => v["payload"]["codeContract"] = json!("OTHER"),
            "authority" => v["ready"] = json!(true),
            "repo" => v["payload"]["repository"]["id"] = json!("other"),
            "digest" => v["payload"]["ownerBinding"]["ownerMapDigest"] = json!("0".repeat(64)),
            _ => v["payload"]["sourceFiles"][0]["sensitivity"] = json!("SECRET"),
        };
        assert_eq!(
            decode_code_syntax_request(&encoded(&v)).unwrap_err().code(),
            "INVALID_REQUEST",
            "{key}"
        );
    }
}
#[test]
fn malformed_raw_request_refuses() {
    let b = raw();
    for bad in [
        b[..b.len() - 1].to_vec(),
        [vec![239, 187, 191], b.clone()].concat(),
        [b.clone(), vec![10]].concat(),
        String::from_utf8(b.clone())
            .unwrap()
            .replace('\n', "\r\n")
            .into_bytes(),
    ] {
        assert_eq!(
            decode_code_syntax_request(&bad).unwrap_err().code(),
            "INVALID_REQUEST"
        );
    }
}
#[test]
fn all_independent_request_templates_are_valid() {
    let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/phase1/code-syntax-producer-oracle");
    let cases: Value =
        serde_json::from_slice(&std::fs::read(base.join("cases.json")).unwrap()).unwrap();
    for c in cases.as_array().unwrap() {
        let b = std::fs::read_to_string(base.join(c["request"].as_str().unwrap()))
            .unwrap()
            .replace("\"__OWNED_ROOT__\"", "\"/fixture/producer\"");
        decode_code_syntax_request(b.as_bytes())
            .unwrap_or_else(|e| panic!("{}: {}", c["id"], e.code()));
    }
}
#[test]
fn request_rejects_source_inventory_and_scalar_corruption() {
    for which in [
        "source_revision",
        "duplicate_id",
        "duplicate_path",
        "removed_overlap",
        "binary",
        "other_role",
        "unknown_language",
        "source_snapshot",
        "unsafe_number",
        "negative_zero",
    ] {
        let mut v: Value = serde_json::from_slice(&raw()).unwrap();
        match which {
            "source_revision" => v["payload"]["sourceFiles"][0]["revisionId"] = json!("other"),
            "duplicate_id" | "duplicate_path" => {
                let mut f = v["payload"]["sourceFiles"][0].clone();
                if which == "duplicate_id" {
                    f["path"] = json!("other.py");
                } else {
                    f["id"] = json!("other");
                }
                v["payload"]["sourceFiles"].as_array_mut().unwrap().push(f);
            }
            "removed_overlap" => {
                let f = &v["payload"]["sourceFiles"][0];
                v["payload"]["removedSourceFiles"] =
                    json!([{"id":f["id"],"path":f["path"],"previousContentFingerprint":"old"}]);
            }
            "binary" => {
                v["payload"]["sourceFiles"][0]["classification"]["contentKind"] = json!("BINARY")
            }
            "other_role" => {
                v["payload"]["sourceFiles"][0]["classification"]["role"] = json!("OTHER")
            }
            "unknown_language" => v["payload"]["sourceFiles"][0]["languageHint"] = json!("ruby"),
            "source_snapshot" => {
                v["payload"]["owners"] = json!([{"sourceFileId":"foreign","providerNodeRef":{"factType":"NODE","providerId":"native","providerFactId":"foreign"},"canonicalRef":{}}])
            }
            "unsafe_number" => {
                v["payload"]["resourceBudget"]["maxItems"] = json!(9007199254740992u64)
            }
            _ => v["payload"]["resourceBudget"]["maxItems"] = json!(-0.0),
        };
        assert_eq!(
            decode_code_syntax_request(&encoded(&v)).unwrap_err().code(),
            "INVALID_REQUEST",
            "{which}"
        );
    }
}
#[test]
fn request_bytes_and_depth_have_exact_bounds() {
    let mut v: Value = serde_json::from_slice(&raw()).unwrap();
    loop {
        let len = encoded(&v).len();
        v["payload"]["resourceBudget"]["maxInputBytes"] = len.into();
        if encoded(&v).len() == len {
            break;
        }
    }
    assert!(decode_code_syntax_request(&encoded(&v)).is_ok());
    let len = encoded(&v).len();
    v["payload"]["resourceBudget"]["maxInputBytes"] = (len - 1).into();
    assert_eq!(
        decode_code_syntax_request(&encoded(&v)).unwrap_err().code(),
        "RESOURCE_LIMIT_EXCEEDED"
    );
    v["payload"]["resourceBudget"]["maxInputBytes"] = 65536.into();
    fn depth(v: &Value) -> usize {
        match v {
            Value::Array(a) => 1 + a.iter().map(depth).max().unwrap_or(0),
            Value::Object(o) => 1 + o.values().map(depth).max().unwrap_or(0),
            _ => 0,
        }
    }
    let required = depth(&v);
    v["payload"]["resourceBudget"]["maxDepth"] = required.into();
    assert!(decode_code_syntax_request(&encoded(&v)).is_ok());
    v["payload"]["resourceBudget"]["maxDepth"] = (required - 1).into();
    assert_eq!(
        decode_code_syntax_request(&encoded(&v)).unwrap_err().code(),
        "RESOURCE_LIMIT_EXCEEDED"
    );
}
