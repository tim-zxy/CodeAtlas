//! Fixed v6 library boundary; no production dispatch.
use crate::{
    code_syntax::{CodeSyntaxRequest, decode_code_syntax_request_core},
    syntax::{SyntaxRequestError, SyntaxWalkControl},
};
use serde_json::Value;
use std::io::{self, Write};
#[derive(Debug)]
pub struct BindingSyntaxRequest(CodeSyntaxRequest);
impl BindingSyntaxRequest {
    pub fn header(&self) -> &Value {
        self.0.header()
    }
    pub fn request_checksum(&self) -> &str {
        self.0.request_checksum()
    }
}
pub fn decode_binding_syntax_request(
    bytes: &[u8],
) -> Result<BindingSyntaxRequest, SyntaxRequestError> {
    decode_code_syntax_request_core(bytes, true).map(BindingSyntaxRequest)
}
pub fn write_binding_syntax_observation(
    request: &BindingSyntaxRequest,
    control: &SyntaxWalkControl<'_>,
    output: &mut impl Write,
) -> io::Result<()> {
    crate::code_syntax_producer::write_code_syntax_observation_core(
        &request.0, control, output, true,
    )
}
pub fn serve_binding_syntax_request(
    bytes: &[u8],
    control: &SyntaxWalkControl<'_>,
    output: &mut impl Write,
) -> io::Result<()> {
    match decode_binding_syntax_request(bytes) {
        Ok(request) => write_binding_syntax_observation(&request, control, output),
        Err(error) => {
            if bytes.len() > crate::syntax::SYNTAX_MAX_REQUEST_BYTES {
                return Err(io::Error::other("Invalid binding request framing"));
            }
            let first = bytes.split(|b| *b == b'\n').next().unwrap_or_default();
            let value: Value = serde_json::from_slice(first)?;
            let id = value["requestId"]
                .as_str()
                .filter(|s| !s.is_empty() && s.trim_matches(crate::syntax::trim) == *s)
                .ok_or_else(|| io::Error::other("Invalid binding request identity"))?;
            let mut record = serde_json::to_vec(
                &serde_json::json!({"protocolVersion":6,"requestId":id,"sequence":0,"type":"REQUEST_FAILED","payload":{"code":error.code(),"message":"Invalid binding observation request","retryable":false}}),
            )?;
            record.push(b'\n');
            if record.len() > crate::syntax::SYNTAX_MAX_REQUEST_BYTES {
                return Err(io::Error::other("Binding response limit"));
            }
            output.write_all(&record)?;
            output.flush()
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        code_syntax::decode_code_syntax_request,
        syntax::{SyntaxWalkControl, owner_map_digest},
    };
    use serde_json::{Value, json};
    use sha2::{Digest, Sha256};
    use std::{
        io::Write,
        path::{Path, PathBuf},
        sync::atomic::AtomicBool,
        time::{Duration, Instant},
    };

    fn fixture_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/phase1/syntax-contract/binding-observation")
    }
    fn workspace() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
    }
    fn request(name: &str) -> Vec<u8> {
        let input: Value =
            serde_json::from_slice(&std::fs::read(fixture_root().join("inputs.json")).unwrap())
                .unwrap();
        let mut r = input["requestTemplate"].clone();
        let source = std::fs::read(fixture_root().join("sources").join(name)).unwrap();
        let root = fixture_root()
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .trim_start_matches(r"\\?\")
            .replace('\\', "/");
        r["requestId"] = json!(format!("binding:{name}"));
        r["payload"]["repository"]["rootPath"] = json!(root);
        r["payload"]["sourceFiles"][0]["path"] = json!(format!("sources/{name}"));
        r["payload"]["sourceFiles"][0]["contentFingerprint"] =
            json!(format!("sha256:{:x}", Sha256::digest(&source)));
        r["payload"]["owners"] = json!([]);
        // Reuse the existing writer event ceiling for multi-site AST cases.
        r["payload"]["resourceBudget"]["maxEvents"] = json!(10_000);
        if name.ends_with(".java") {
            use crate::language::LanguageAnalyzer;
            let java: Value = serde_json::from_slice(
                &std::fs::read(
                    workspace().join("fixtures/phase1/syntax-contract/inputs/java-request.json"),
                )
                .unwrap(),
            )
            .unwrap();
            r["payload"]["languages"] = java["payload"]["languages"].clone();
            r["payload"]["sourceFiles"][0]["languageHint"] = json!("java");
            let result = crate::java::JavaAnalyzer::new()
                .unwrap()
                .analyze(&format!("sources/{name}"), &source)
                .unwrap();
            r["payload"]["owners"] = Value::Array(result.symbols.iter().map(|s| json!({
                "sourceFileId":r["payload"]["sourceFiles"][0]["id"],
                "providerNodeRef":{"factType":"NODE","providerId":r["payload"]["providerId"],"providerFactId":s.provider_fact_id},
                "canonicalRef":{"scope":"REPOSITORY","repositoryId":r["payload"]["targetSource"]["repositoryId"],
                    "entity":{"kind":"CODE_NODE","id":format!("code:{}",s.provider_fact_id),"revisionId":r["payload"]["targetSource"]["revisionId"]}}
            })).collect());
        }
        r["payload"]["ownerBinding"]["ownerMapDigest"] =
            json!(owner_map_digest(&r["payload"]).unwrap());
        let mut raw = serde_json::to_vec(&r).unwrap();
        raw.push(b'\n');
        raw
    }
    fn observe_bytes(raw: &[u8]) -> (Vec<Value>, Vec<u8>) {
        let parsed = decode_binding_syntax_request(raw).unwrap();
        let b = &parsed.header()["payload"]["resourceBudget"];
        let cancelled = AtomicBool::new(false);
        let control = SyntaxWalkControl {
            deadline: Instant::now() + Duration::from_millis(b["maxDurationMs"].as_u64().unwrap()),
            cancelled: &cancelled,
            max_source_bytes: b["maxInputBytes"].as_u64().unwrap() as usize,
            max_items: b["maxItems"].as_u64().unwrap() as usize,
            max_depth: b["maxDepth"].as_u64().unwrap() as usize,
            max_result_bytes: b["maxOutputBytes"].as_u64().unwrap() as usize,
        };
        let mut out = vec![];
        write_binding_syntax_observation(&parsed, &control, &mut out).unwrap();
        let events: Vec<Value> = out
            .split(|b| *b == b'\n')
            .filter(|b| !b.is_empty())
            .map(|b| serde_json::from_slice(b).unwrap())
            .collect();
        assert_eq!(
            events.last().unwrap()["type"],
            "OBSERVATION_COMPLETED",
            "{events:?}"
        );
        assert!(events.iter().all(|e| e["protocolVersion"] == 6));
        assert_eq!(
            events[0]["payload"]["requestChecksum"],
            format!("{:x}", Sha256::digest(raw))
        );
        assert_eq!(events[0]["payload"]["syntaxContract"], "SYNTAX_BINDING_V2");
        let last = out[..out.len() - 1]
            .iter()
            .rposition(|b| *b == b'\n')
            .map(|i| i + 1)
            .unwrap();
        assert_eq!(
            events.last().unwrap()["payload"]["checksum"],
            format!("{:x}", Sha256::digest(&out[..last]))
        );
        for (i, e) in events.iter().enumerate() {
            assert_eq!(e["sequence"], i);
        }

        (events, out)
    }
    fn observe(raw: &[u8]) -> Vec<Value> {
        observe_bytes(raw).0
    }
    fn syntax(events: &[Value]) -> Vec<&Value> {
        events
            .iter()
            .filter(|e| e["type"] == "SYNTAX_OBSERVATION")
            .map(|e| &e["payload"])
            .collect()
    }
    #[test]
    fn binding_v6_request_and_direct_assignment() {
        let bytes = request("python-direct.py");
        assert!(decode_code_syntax_request(&bytes).is_err());
        let events = observe(&bytes);
        let obs = syntax(&events);
        let app = obs
            .iter()
            .find(|s| s["syntaxKind"] == "ASSIGNMENT" && s["payload"]["targetName"] == "app")
            .unwrap();
        assert_eq!(app["payload"]["assignmentForm"], "DIRECT_VALUE");
        assert_eq!(app["payload"]["value"]["reason"], "CALL_RESULT");
        let call = obs
            .iter()
            .find(|s| {
                s["syntaxKind"] == "INVOCATION" && s["payload"]["callee"]["name"] == "FastAPI"
            })
            .unwrap();
        assert_eq!(app["payload"]["valueRange"], call["sourceRange"]);
        assert_eq!(app["lexicalScope"], call["lexicalScope"]);
        assert!(!app["lexicalScope"].is_null());
        let decorator = obs
            .iter()
            .find(|s| s["syntaxKind"] == "DECORATION")
            .unwrap();
        assert_eq!(decorator["lexicalScope"], app["lexicalScope"]);
        assert_ne!(decorator["owner"], decorator["lexicalScope"]);
    }
    #[test]
    fn binding_v6_nested_scope_and_unknown_forms() {
        let events = observe(&request("python-nested.py"));
        let obs = syntax(&events);
        let app = obs
            .iter()
            .find(|s| s["syntaxKind"] == "ASSIGNMENT" && s["payload"]["targetName"] == "app")
            .unwrap();
        let wrap = obs
            .iter()
            .find(|s| s["syntaxKind"] == "INVOCATION" && s["payload"]["callee"]["name"] == "wrap")
            .unwrap();
        assert_eq!(app["payload"]["valueRange"], wrap["sourceRange"]);
        let inner = obs
            .iter()
            .find(|s| {
                s["syntaxKind"] == "INVOCATION"
                    && s["payload"]["callee"]["name"] == "FastAPI"
                    && s["sourceRange"]["startLine"] == 1
            })
            .unwrap();
        assert_ne!(app["payload"]["valueRange"], inner["sourceRange"]);
        for name in ["conditional", "bracketed"] {
            let assignment = obs
                .iter()
                .find(|s| s["syntaxKind"] == "ASSIGNMENT" && s["payload"]["targetName"] == name)
                .unwrap();
            let call = obs
                .iter()
                .find(|s| {
                    s["syntaxKind"] == "INVOCATION"
                        && s["sourceRange"]["startLine"] == assignment["sourceRange"]["startLine"]
                })
                .unwrap();
            assert_ne!(assignment["payload"]["valueRange"], call["sourceRange"]);
        }
        let events = observe(&request("python-scopes.py"));
        let obs = syntax(&events);
        let module = events
            .iter()
            .find(|e| e["type"] == "NODE" && e["payload"]["providerKind"] == "python.module")
            .unwrap()["payload"]["providerFactId"]
            .clone();
        let outer = events
            .iter()
            .find(|e| e["type"] == "NODE" && e["payload"]["name"] == "outer")
            .unwrap()["payload"]["providerFactId"]
            .clone();
        let default = obs
            .iter()
            .find(|s| s["syntaxKind"] == "INVOCATION" && s["sourceRange"]["startLine"] == 2)
            .unwrap();
        assert_eq!(default["lexicalScope"]["providerFactId"], module);
        let decorator = obs
            .iter()
            .find(|s| s["syntaxKind"] == "DECORATION")
            .unwrap();
        assert_eq!(decorator["lexicalScope"]["providerFactId"], outer);
        for line in [8, 9, 10] {
            for s in obs.iter().filter(|s| {
                s["syntaxKind"] == "INVOCATION" && s["sourceRange"]["startLine"] == line
            }) {
                assert!(s["lexicalScope"].is_null(), "{s}");
            }
        }
    }
    #[test]
    fn binding_v6_java_declaration_is_not_return_type() {
        let events = observe(&request("java-typed.java"));
        let obs = syntax(&events);
        for name in ["template", "local"] {
            let d = obs
                .iter()
                .find(|s| s["syntaxKind"] == "DECLARATION" && s["payload"]["declaredName"] == name)
                .unwrap();
            assert_eq!(d["payload"]["declarationForm"], "TYPED_BINDING");
            assert_eq!(d["payload"]["declaredType"], "MongoTemplate");
            assert!(!d["lexicalScope"].is_null());
        }
        let d = obs
            .iter()
            .find(|s| {
                s["syntaxKind"] == "DECLARATION" && s["payload"]["declaredName"] == "getTemplate"
            })
            .unwrap();
        assert_eq!(d["payload"]["declarationForm"], "CALLABLE");
        let scopes = observe(&request("java-scopes.java"));
        for s in syntax(&scopes).iter().filter(|s| {
            s["syntaxKind"] == "INVOCATION"
                && s["sourceRange"]["startLine"] == 2
                && s["sourceRange"]["startColumn"].as_u64().unwrap() >= 60
        }) {
            assert!(s["lexicalScope"].is_null());
        }
    }
    #[test]
    fn binding_v6_budget_and_cancel_keep_terminal_failure() {
        let mut request: Value = serde_json::from_slice(&request("python-scopes.py")).unwrap();
        request["payload"]["resourceBudget"]["maxEvents"] = json!(20);
        let mut raw = serde_json::to_vec(&request).unwrap();
        raw.push(b'\n');
        let parsed = decode_binding_syntax_request(&raw).unwrap();
        for (cancel, items) in [(false, 1000), (false, 1), (true, 1000)] {
            let flag = AtomicBool::new(cancel);
            let control = SyntaxWalkControl {
                deadline: Instant::now() + Duration::from_secs(1),
                cancelled: &flag,
                max_source_bytes: 65536,
                max_items: items,
                max_depth: 64,
                max_result_bytes: 65536,
            };
            let mut output = vec![];
            write_binding_syntax_observation(&parsed, &control, &mut output).unwrap();
            let events: Vec<Value> = output
                .split(|b| *b == b'\n')
                .filter(|b| !b.is_empty())
                .map(|b| serde_json::from_slice(b).unwrap())
                .collect();
            let end = events.last().unwrap();
            assert!(end["type"] == "OBSERVATION_FAILED" || end["type"] == "REQUEST_FAILED");
            assert_eq!(
                end["payload"]["code"],
                if cancel {
                    "CANCELLED"
                } else {
                    "RESOURCE_LIMIT_EXCEEDED"
                }
            );
            assert!(events.len() <= 20);
        }
        let mut bad = raw.clone();
        bad.insert(0, 239);
        assert!(decode_binding_syntax_request(&bad).is_err());
        assert!(decode_binding_syntax_request(&raw[..raw.len() - 1]).is_err());
    }
    fn coverage_root() -> PathBuf {
        workspace().join("fixtures/phase1/syntax-contract/call-result-coverage")
    }
    fn coverage_request(name: &str, version: u64) -> Vec<u8> {
        let mut r: Value = serde_json::from_slice(&request("python-direct.py")).unwrap();
        let root = coverage_root();
        let source = std::fs::read(root.join(name)).unwrap();
        r["requestId"] = json!(format!("coverage:{version}:{name}"));
        r["protocolVersion"] = json!(version);
        if version == 5 {
            r["payload"]
                .as_object_mut()
                .unwrap()
                .remove("syntaxContract");
        }
        r["payload"]["repository"]["rootPath"] = json!(
            root.canonicalize()
                .unwrap()
                .to_string_lossy()
                .trim_start_matches(r"\\?\")
                .replace('\\', "/")
        );
        r["payload"]["sourceFiles"][0]["path"] = json!(name);
        r["payload"]["sourceFiles"][0]["contentFingerprint"] =
            json!(format!("sha256:{:x}", Sha256::digest(&source)));
        r["payload"]["ownerBinding"]["ownerMapDigest"] =
            json!(owner_map_digest(&r["payload"]).unwrap());
        let mut raw = serde_json::to_vec(&r).unwrap();
        raw.push(b'\n');
        raw
    }
    #[test]
    fn binding_v6_call_result_observation_completeness() {
        let inputs: Value =
            serde_json::from_slice(&std::fs::read(coverage_root().join("inputs.json")).unwrap())
                .unwrap();
        let expected: Value =
            serde_json::from_slice(&std::fs::read(coverage_root().join("expected.json")).unwrap())
                .unwrap();
        for case in inputs["cases"].as_array().unwrap() {
            let name = case["path"].as_str().unwrap();
            let wanted = &expected["cases"][case["id"].as_str().unwrap()];
            for version in [6, 5] {
                let raw = coverage_request(name, version);
                let flag = AtomicBool::new(false);
                let value: Value = serde_json::from_slice(&raw).unwrap();
                let b = &value["payload"]["resourceBudget"];
                let control = SyntaxWalkControl {
                    deadline: Instant::now()
                        + Duration::from_millis(b["maxDurationMs"].as_u64().unwrap()),
                    cancelled: &flag,
                    max_source_bytes: b["maxInputBytes"].as_u64().unwrap() as usize,
                    max_items: b["maxItems"].as_u64().unwrap() as usize,
                    max_depth: b["maxDepth"].as_u64().unwrap() as usize,
                    max_result_bytes: b["maxOutputBytes"].as_u64().unwrap() as usize,
                };
                let mut output = vec![];
                if version == 6 {
                    write_binding_syntax_observation(
                        &decode_binding_syntax_request(&raw).unwrap(),
                        &control,
                        &mut output,
                    )
                    .unwrap();
                } else {
                    crate::code_syntax::write_code_syntax_observation(
                        &decode_code_syntax_request(&raw).unwrap(),
                        &control,
                        &mut output,
                    )
                    .unwrap();
                }
                let events: Vec<Value> = output
                    .split(|b| *b == b'\n')
                    .filter(|b| !b.is_empty())
                    .map(|b| serde_json::from_slice(b).unwrap())
                    .collect();
                let terminal = events.last().unwrap();
                let want = if version == 6 {
                    &wanted["v6"]
                } else {
                    &wanted["legacy"]
                };
                if want == "NOT_SUCCEEDED" {
                    assert_ne!(
                        terminal["payload"]["outcome"], "SUCCEEDED",
                        "{name} v{version}"
                    );
                } else {
                    assert_eq!(terminal["payload"]["outcome"], *want, "{name} v{version}");
                }
                if version == 6 && want == "SUCCEEDED" {
                    assert_eq!(terminal["payload"]["syntaxOutcome"], "COMPLETE");
                    assert_eq!(terminal["payload"]["codeOutcome"], "COMPLETE");
                    assert!(
                        syntax(&events)
                            .iter()
                            .any(|v| v["payload"]["value"]["kind"] == "UNKNOWN"
                                && v["payload"]["value"]["reason"] == "CALL_RESULT")
                    );
                    if case["id"] == "wrapped" {
                        let obs = syntax(&events);
                        let assignment = obs
                            .iter()
                            .find(|s| s["syntaxKind"] == "ASSIGNMENT")
                            .unwrap();
                        let direct: Vec<_> = obs
                            .iter()
                            .filter(|s| {
                                s["syntaxKind"] == "INVOCATION"
                                    && s["sourceRange"] == assignment["payload"]["valueRange"]
                            })
                            .collect();
                        assert_eq!(direct.len(), 1);
                        assert_eq!(direct[0]["payload"]["callee"]["name"], "wrap");
                    }
                }
                if version == 5 && name == "direct.py" {
                    assert_eq!(terminal["payload"]["syntaxOutcome"], "PARTIAL");
                    // The same Source through the old v4 collector stays partial too.
                    let mut v4 = value.clone();
                    v4["protocolVersion"] = json!(4);
                    v4["type"] = json!("OBSERVE_SYNTAX");
                    v4["payload"]
                        .as_object_mut()
                        .unwrap()
                        .remove("codeContract");
                    let mut bytes = serde_json::to_vec(&v4).unwrap();
                    bytes.push(b'\n');
                    let parsed = crate::syntax::decode_syntax_request(&bytes).unwrap();
                    let source = std::fs::read(coverage_root().join(name)).unwrap();
                    let result = crate::python::PythonSyntaxAnalyzer::new()
                        .unwrap()
                        .observe(&parsed, 0, &source, &control)
                        .unwrap();
                    assert_eq!(result.coverage["status"], "PARTIAL");
                }
            }
        }
    }
    #[test]
    fn binding_v6_call_result_coverage_capture() {
        let expected: Value =
            serde_json::from_slice(&std::fs::read(coverage_root().join("expected.json")).unwrap())
                .unwrap();
        for name in ["python-direct.py", "python-nested.py"] {
            let raw = request(name);
            let (events, output) = observe_bytes(&raw);
            let terminal = &events.last().unwrap()["payload"];
            for key in ["outcome", "codeOutcome", "syntaxOutcome"] {
                assert_eq!(
                    terminal[key], expected["capture"][name][key],
                    "{name} {key}"
                );
            }
            if let Ok(root) = std::env::var("CODEATLAS_CALL_RESULT_CAPTURE_ROOT") {
                let owned = workspace()
                    .join(".superpowers/sdd/2026-10-30-phase1-call-result-coverage/library-output");
                save_capture_under(
                    Path::new(&root),
                    &owned,
                    &format!("{name}.request.jsonl"),
                    &raw,
                );
                save_capture_under(
                    Path::new(&root),
                    &owned,
                    &format!("{name}.output.jsonl"),
                    &output,
                );
            }
        }
    }
    fn save_capture(root: &Path, name: &str, bytes: &[u8]) {
        let owned = workspace()
            .join(".superpowers/sdd/2026-10-30-phase1-binding-observation/library-output");
        save_capture_under(root, &owned, name, bytes);
    }
    fn save_capture_under(root: &Path, owned: &Path, name: &str, bytes: &[u8]) {
        std::fs::create_dir_all(owned).unwrap();
        assert!(!root.components().any(|c| matches!(
            c,
            std::path::Component::ParentDir | std::path::Component::CurDir
        )));
        let parent = root.parent().unwrap().canonicalize().unwrap();
        assert!(parent.starts_with(owned.canonicalize().unwrap()));
        std::fs::create_dir_all(root).unwrap();
        assert!(
            root.canonicalize()
                .unwrap()
                .starts_with(owned.canonicalize().unwrap())
        );
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(root.join(name))
            .unwrap();
        f.write_all(bytes).unwrap();
    }
    #[test]
    fn binding_v6_actual_capture() {
        for name in ["python-direct.py", "python-nested.py"] {
            let bytes = request(name);
            let (_, output) = observe_bytes(&bytes);
            if let Ok(root) = std::env::var("CODEATLAS_BINDING_CAPTURE_ROOT") {
                let root = Path::new(&root);
                save_capture(root, &format!("{name}.request.jsonl"), &bytes);
                save_capture(root, &format!("{name}.output.jsonl"), &output);
            }
        }
    }
}
