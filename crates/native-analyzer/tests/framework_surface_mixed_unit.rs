//! One fixed mixed library observation; never CLI, legacy source batch or qualification.
use codeatlas_native_analyzer::{
    framework_surface::{decode_framework_surface_request, write_framework_surface_observation},
    syntax::SyntaxWalkControl,
};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
fn save_new(path: &Path, bytes: &[u8]) {
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .unwrap();
    file.write_all(bytes).unwrap();
    file.flush().unwrap();
}
#[test]
#[ignore = "local fixed mixed Java/Python input; exact approved integration target only"]
fn mixed_java_python_emits_one_complete_observation() {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let evidence = repo.join(".superpowers/sdd/2026-11-05-current13-mixed-entry");
    let input: Value =
        serde_json::from_slice(&fs::read(evidence.join("unit-input.json")).unwrap()).unwrap();
    let manual: Value =
        serde_json::from_slice(&fs::read(evidence.join("manual-expectations.json")).unwrap())
            .unwrap();
    assert_eq!(input["kind"], "FIXED_CURRENT13_MIXED_LIBRARY_INPUT");
    assert_eq!(input["schemaVersion"], 1);
    let mut request_value = input["request"].clone();
    assert_eq!(request_value["protocolVersion"], 8);
    assert_eq!(
        request_value["payload"]["resourceBudget"],
        manual["resourceBudget"]
    );
    let files = request_value["payload"]["sourceFiles"].as_array().unwrap();
    assert_eq!(files.len(), 2);
    assert_eq!(manual["sources"].as_array().unwrap().len(), 2);
    let original_owner_binding = request_value["payload"]["ownerBinding"].clone();
    let original_owners = request_value["payload"]["owners"].clone();
    assert!(!original_owners.as_array().unwrap().is_empty());
    let output = evidence.join("library-output");
    fs::create_dir(&output).expect("exclusive output root; preserve old output on failure");
    let name = format!(
        "codeatlas-mixed-unit-library-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let root = std::env::temp_dir().join(&name);
    fs::create_dir(&root).unwrap();
    let temp = std::env::temp_dir().canonicalize().unwrap();
    assert_eq!(root.canonicalize().unwrap().parent().unwrap(), temp);
    println!("OWNED_SOURCE_ROOT {}", root.display());
    let mut ids = Vec::new();
    for relative in [
        "spring/source-adequacy/SpringSource.java",
        "fastapi/source-adequacy/routes.py",
    ] {
        let expected = manual["sources"]
            .as_array()
            .unwrap()
            .iter()
            .find(|s| s["path"] == relative)
            .unwrap();
        let file = files.iter().find(|s| s["path"] == relative).unwrap();
        let bytes = fs::read(repo.join("fixtures/phase1").join(relative)).unwrap();
        let hash = format!("{:x}", Sha256::digest(&bytes));
        assert_eq!(expected["fileSha256"], hash);
        assert_eq!(file["contentFingerprint"], format!("sha256:{hash}"));
        let target = root.join(relative);
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        save_new(&target, &bytes);
        assert_eq!(fs::read(&target).unwrap(), bytes);
        ids.push(file["id"].clone());
        println!("SOURCE {relative} SHA256 {hash}");
    }
    request_value["payload"]["repository"]["rootPath"] =
        Value::String(root.to_str().unwrap().replace('\\', "/"));
    let mut serialized = serde_json::to_vec(&request_value).unwrap();
    serialized.push(b'\n');
    save_new(&output.join("mixed.request.jsonl"), &serialized);
    let request = decode_framework_surface_request(&serialized).unwrap();
    assert_eq!(
        request.header()["payload"]["ownerBinding"],
        original_owner_binding
    );
    assert_eq!(request.header()["payload"]["owners"], original_owners);
    let budget = &request.header()["payload"]["resourceBudget"];
    assert!(request.header()["payload"]["deadlineEpochMs"].is_null());
    let cancelled = AtomicBool::new(false);
    let control = SyntaxWalkControl {
        deadline: Instant::now() + Duration::from_millis(budget["maxDurationMs"].as_u64().unwrap()),
        cancelled: &cancelled,
        max_source_bytes: budget["maxInputBytes"].as_u64().unwrap() as usize,
        max_items: budget["maxItems"].as_u64().unwrap() as usize,
        max_depth: budget["maxDepth"].as_u64().unwrap() as usize,
        max_result_bytes: budget["maxOutputBytes"].as_u64().unwrap() as usize,
    };
    let raw_path = output.join("mixed.output.jsonl");
    let mut stream = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&raw_path)
        .unwrap();
    let result = write_framework_surface_observation(&request, &control, &mut stream);
    stream.flush().unwrap();
    drop(stream);
    result.unwrap();
    let raw = fs::read(&raw_path).unwrap();
    let events: Vec<Value> = raw
        .split(|b| *b == b'\n')
        .filter(|l| !l.is_empty())
        .map(|l| serde_json::from_slice(l).unwrap())
        .collect();
    assert_eq!(
        events
            .iter()
            .filter(|e| e["type"] == "OBSERVATION_COMPLETED")
            .count(),
        1
    );
    let terminal = events.last().unwrap();
    assert_eq!(terminal["type"], "OBSERVATION_COMPLETED", "{terminal}");
    for (key, value) in [
        ("outcome", "SUCCEEDED"),
        ("codeOutcome", "COMPLETE"),
        ("syntaxOutcome", "COMPLETE"),
    ] {
        assert_eq!(terminal["payload"][key], value);
    }
    for id in &ids {
        let syntax: Vec<_> = events
            .iter()
            .filter(|e| e["type"] == "SYNTAX_COVERAGE" && e["payload"]["sourceFileId"] == *id)
            .collect();
        assert_eq!(syntax.len(), 1);
        assert_eq!(syntax[0]["payload"]["status"], "COMPLETE");
        let file = request.header()["payload"]["sourceFiles"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| f["id"] == *id)
            .unwrap();
        assert_eq!(
            syntax[0]["payload"]["sourceFingerprint"],
            file["contentFingerprint"]
        );
    }
    let nodes: Vec<_> = events.iter().filter(|e| e["type"] == "NODE").collect();
    assert!(!nodes.is_empty());
    assert!(
        nodes
            .iter()
            .all(|e| e["payload"]["sourceRange"]["sourceFileId"] == ids[1])
    );
    let code: Vec<_> = events
        .iter()
        .filter(|e| e["type"] == "CODE_COVERAGE")
        .collect();
    assert!(!code.is_empty());
    assert!(code.iter().all(|e|e["payload"]["sourceFileId"]==ids[1]&&e["payload"]["status"]=="COMPLETE"));
    assert!(events.iter().any(|e| e["type"] == "SYNTAX_OBSERVATION"
        && e["payload"]["sourceRange"]["sourceFileId"] == ids[0]));
    println!(
        "MIXED_LIBRARY_COMPLETE EVENTS {} JAVA_SYNTAX_ONLY PYTHON_CODE_COMPLETE OWNER_BINDING_UNCHANGED",
        events.len()
    );
    // Only successful complete observation permits owned-root cleanup; failures retain raw and root.
    let resolved = root.canonicalize().unwrap();
    assert_eq!(resolved.parent().unwrap(), temp);
    assert_eq!(root.file_name().unwrap().to_str().unwrap(), name);
    assert!(name.starts_with("codeatlas-mixed-unit-library-"));
    fs::remove_dir_all(&resolved).unwrap();
    println!("OWNED_SOURCE_ROOT_REMOVED {}", root.display());
}
