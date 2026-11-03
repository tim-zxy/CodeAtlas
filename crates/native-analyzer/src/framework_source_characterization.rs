//! Approved test-only characterization. No production reader, policy or coverage changes.
use crate::binding_sufficiency::{
    decode_binding_sufficiency_request, write_binding_sufficiency_observation,
};
use crate::language::LanguageAnalyzer;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    sync::atomic::AtomicBool,
    time::{Duration, Instant},
};

fn save(path: &Path, bytes: &[u8]) {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .unwrap();
    file.write_all(bytes).unwrap();
    file.flush().unwrap();
}

#[test]
#[ignore = "manual Source observation requires an explicitly approved owned output batch"]
fn characterize_six_sources() {
    let repo = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let fixtures = repo.join("fixtures/phase1").canonicalize().unwrap();
    let output = fs::canonicalize(
        std::env::var_os("CODEATLAS_FRAMEWORK_SOURCE_OUTPUT")
            .expect("explicit owned output directory"),
    )
    .unwrap();
    let task = repo.join(".superpowers/sdd/2026-10-31-phase1-b-remaining-execution/framework-source-characterization").canonicalize().unwrap();
    assert_eq!(output.parent(), Some(task.as_path()));
    assert_eq!(
        fs::read_dir(&output).unwrap().count(),
        0,
        "never overwrite a prior capture"
    );
    let template: Value = serde_json::from_slice(
        &fs::read(fixtures.join("syntax-contract/binding-pipeline/inputs.json")).unwrap(),
    )
    .unwrap();
    // Paired role controls first. Each case is one independent bounded request.
    for (id, relative) in [
        (
            "depends-default",
            "fastapi/source-adequacy/depends-default.py",
        ),
        (
            "depends-annotation",
            "fastapi/source-adequacy/depends-annotation.py",
        ),
        ("fastapi-routes", "fastapi/source-adequacy/routes.py"),
        ("kafka", "kafka/source-adequacy/KafkaSource.java"),
        ("mongo", "mongo/source-adequacy/MongoSource.java"),
        ("spring", "spring/source-adequacy/SpringSource.java"),
    ] {
        let path = fixtures.join(relative);
        assert!(
            !fs::symlink_metadata(&path)
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert!(path.canonicalize().unwrap().starts_with(&fixtures));
        let source = fs::read(&path).unwrap();
        let mut request = template["requestTemplate"].clone();
        request["requestId"] = json!(format!("source-characterization:{id}"));
        let p = &mut request["payload"];
        p["repository"]["rootPath"] = json!(
            fixtures
                .to_string_lossy()
                .trim_start_matches(r"\\?\")
                .replace('\\', "/")
        );
        p["providerSnapshotId"] = json!(format!("snapshot:source-characterization:{id}"));
        p["sourceFiles"][0]["path"] = json!(relative);
        p["sourceFiles"][0]["contentFingerprint"] =
            json!(format!("sha256:{:x}", Sha256::digest(&source)));
        p["owners"] = json!([]);
        // This is the existing source-oracle cap, not a new production profile.
        p["resourceBudget"]["maxEvents"] = json!(10_000);
        if relative.ends_with(".java") {
            p["sourceFiles"][0]["languageHint"] = json!("java");
            p["languages"] = json!([{"languageId":"java","grammarVersion":"0.23.5","analyzerVersion":env!("CARGO_PKG_VERSION"),"compatibilityVersion":"syntax-v1"}]);
            let analysis = crate::java::JavaAnalyzer::new()
                .unwrap()
                .analyze(relative, &source)
                .unwrap();
            let mut ids: Vec<_> = analysis
                .symbols
                .iter()
                .map(|s| s.provider_fact_id.clone())
                .collect();
            ids.push(crate::java_relations::compilation_unit_id(relative));
            // Same test-request mapping as the original library oracle. Not Canonical publication proof.
            p["owners"] = Value::Array(ids.iter().map(|id| json!({"sourceFileId":p["sourceFiles"][0]["id"],"providerNodeRef":{"factType":"NODE","providerId":p["providerId"],"providerFactId":id},"canonicalRef":{"scope":"REPOSITORY","repositoryId":p["targetSource"]["repositoryId"],"entity":{"kind":"CODE_NODE","id":format!("code:{id}"),"revisionId":p["targetSource"]["revisionId"]}}})).collect());
        }
        p["ownerBinding"]["ownerMapDigest"] = json!(crate::syntax::owner_map_digest(p).unwrap());
        let mut bytes = serde_json::to_vec(&request).unwrap();
        bytes.push(b'\n');
        save(&output.join(format!("{id}.request.jsonl")), &bytes);
        let parsed = decode_binding_sufficiency_request(&bytes)
            .unwrap_or_else(|e| panic!("{id}: request {e:?}"));
        let b = &request["payload"]["resourceBudget"];
        let cancelled = AtomicBool::new(false);
        let control = crate::syntax::SyntaxWalkControl {
            deadline: Instant::now() + Duration::from_millis(b["maxDurationMs"].as_u64().unwrap()),
            cancelled: &cancelled,
            max_source_bytes: b["maxInputBytes"].as_u64().unwrap() as usize,
            max_items: b["maxItems"].as_u64().unwrap() as usize,
            max_depth: b["maxDepth"].as_u64().unwrap() as usize,
            max_result_bytes: b["maxOutputBytes"].as_u64().unwrap() as usize,
        };
        let output_path = output.join(format!("{id}.output.jsonl"));
        let mut stream = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output_path)
            .unwrap();
        let result = write_binding_sufficiency_observation(&parsed, &control, &mut stream);
        stream.flush().unwrap();
        drop(stream);
        let raw = fs::read(&output_path).unwrap();
        let events: Vec<Value> = raw
            .split(|b| *b == b'\n')
            .filter(|line| !line.is_empty())
            .map(|line| serde_json::from_slice(line).unwrap())
            .collect();
        let terminal = events.last().cloned().unwrap_or(Value::Null);
        save(&output.join(format!("{id}.observation.json")), &serde_json::to_vec_pretty(&json!({"id":id,"source":relative,"sourceSha256":format!("{:x}",Sha256::digest(&source)),"requestSha256":format!("{:x}",Sha256::digest(&bytes)),"outputSha256":format!("{:x}",Sha256::digest(&raw)),"writerError":result.as_ref().err().map(ToString::to_string),"terminal":terminal})).unwrap());
        assert!(
            result.is_ok(),
            "{id}: producer error; raw output retained: {result:?}"
        );
        assert_eq!(
            terminal["type"], "OBSERVATION_COMPLETED",
            "{id}: stop on producer/cap failure, preserving raw terminal"
        );
        assert!(events.iter().all(|e| e["protocolVersion"] == 7));
        // COMPLETE and PARTIAL are both observations; semantic adequacy is reviewed separately.
    }
}

#[test]
#[ignore = "manual Spring diagnostic requires an explicitly approved owned output batch"]
fn diagnose_spring_resource_guards() {
    let repo = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let task = repo
        .join(".superpowers/sdd/2026-10-31-phase1-b-remaining-execution/spring-resource-diagnostic")
        .canonicalize()
        .unwrap();
    let output = fs::canonicalize(
        std::env::var_os("CODEATLAS_FRAMEWORK_SOURCE_OUTPUT").expect("explicit diagnostic output"),
    )
    .unwrap();
    assert_eq!(output.parent(), Some(task.as_path()));
    assert_eq!(output.file_name().unwrap(), "run-01");
    assert_eq!(
        fs::read_dir(&output).unwrap().count(),
        0,
        "never overwrite a prior diagnostic"
    );
    let bytes = fs::read(repo.join(".superpowers/sdd/2026-10-31-phase1-b-remaining-execution/framework-source-characterization/run-01/spring.request.jsonl")).unwrap();
    assert_eq!(
        format!("{:x}", Sha256::digest(&bytes)),
        "cdeec15871d68d771495f69bfd51e12504444a4936fc45145484fc25e1d0bc9e"
    );
    let request = decode_binding_sufficiency_request(&bytes).expect("original Spring request");
    let header: Value = serde_json::from_slice(&bytes).unwrap();
    let p = &header["payload"];
    assert!(p["deadlineEpochMs"].is_null());
    assert_eq!(p["sourceFiles"].as_array().unwrap().len(), 1);
    assert_eq!(
        p["sourceFiles"][0]["path"],
        "spring/source-adequacy/SpringSource.java"
    );
    assert_eq!(
        Path::new(p["repository"]["rootPath"].as_str().unwrap())
            .canonicalize()
            .unwrap(),
        repo.join("fixtures/phase1").canonicalize().unwrap()
    );
    save(&output.join("spring.request.jsonl"), &bytes);
    let b = &p["resourceBudget"];
    let cancelled = AtomicBool::new(false);
    let control = crate::syntax::SyntaxWalkControl {
        deadline: Instant::now() + Duration::from_millis(b["maxDurationMs"].as_u64().unwrap()),
        cancelled: &cancelled,
        max_source_bytes: b["maxInputBytes"].as_u64().unwrap() as usize,
        max_items: b["maxItems"].as_u64().unwrap() as usize,
        max_depth: b["maxDepth"].as_u64().unwrap() as usize,
        max_result_bytes: b["maxOutputBytes"].as_u64().unwrap() as usize,
    };
    let target = output.join("spring.output.jsonl");
    let mut stream = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .unwrap();
    let result = write_binding_sufficiency_observation(&request, &control, &mut stream);
    stream.flush().unwrap();
    drop(stream);
    let raw = fs::read(target).unwrap();
    let events: Vec<Value> = raw
        .split(|b| *b == b'\n')
        .filter(|line| !line.is_empty())
        .map(|line| serde_json::from_slice(line).unwrap())
        .collect();
    let terminal = events.last().cloned().unwrap_or(Value::Null);
    save(&output.join("spring.observation.json"), &serde_json::to_vec_pretty(&json!({"requestSha256":format!("{:x}",Sha256::digest(&bytes)),"outputSha256":format!("{:x}",Sha256::digest(&raw)),"sourceFingerprint":p["sourceFiles"][0]["contentFingerprint"],"resourceBudget":b,"writerError":result.as_ref().err().map(ToString::to_string),"terminal":terminal,"interpretation":"Diagnostic capture only; failure is not product success and completion is not a fix."})).unwrap());
    assert!(result.is_ok(), "writer did not settle: {result:?}");
    assert!(
        terminal["type"] == "OBSERVATION_FAILED" || terminal["type"] == "OBSERVATION_COMPLETED",
        "unexpected terminal retained: {terminal:?}"
    );
}
