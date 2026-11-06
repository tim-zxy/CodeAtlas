//! Local fixed-input library evidence only; never Native CLI or production qualification.
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
#[ignore = "local fixed-input GET/POST library evidence; run only by exact approved integration target"]
fn modified_get_to_post_emits_independent_observation() {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let evidence = repo.join(".superpowers/sdd/2026-11-05-modified-unit-library-positive");
    let pack: Value =
        serde_json::from_slice(&fs::read(evidence.join("unit-input.json")).unwrap()).unwrap();
    let expected: Value =
        serde_json::from_slice(&fs::read(evidence.join("manual-expectations.json")).unwrap())
            .unwrap();
    assert_eq!(pack["kind"], "FIXED_MODIFIED_UNIT_LIBRARY_INPUT");
    assert_eq!(pack["schemaVersion"], 1);
    let relative = "fastapi/source-adequacy/routes.py";
    assert_eq!(expected["sourcePath"], relative);
    let output = evidence.join("library-output");
    fs::create_dir(&output).expect("new exclusive output directory; no retry or overwrite");
    let temp = std::env::temp_dir().canonicalize().unwrap();
    let mut owned = Vec::new();
    for (label, source) in [
        (
            "before",
            "fixtures/phase1/fastapi/source-adequacy/routes.py",
        ),
        (
            "after",
            "packages/source/test/fixtures/current13-same-path-after.py",
        ),
    ] {
        let bytes = fs::read(repo.join(source)).unwrap();
        let digest = format!("{:x}", Sha256::digest(&bytes));
        assert_eq!(expected[label]["fileSha256"].as_str().unwrap(), digest);
        let name = format!(
            "codeatlas-modified-unit-library-{label}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        // Use ordinary absolute temp paths for the request; canonical paths validate ownership.
        let root = std::env::temp_dir().join(&name);
        fs::create_dir(&root).unwrap();
        let resolved = root.canonicalize().unwrap();
        assert_eq!(resolved.parent().unwrap(), temp);
        assert!(name.starts_with("codeatlas-modified-unit-library-"));
        println!("OWNED_SOURCE_ROOT {}", root.display());
        let file = root.join(relative);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        save_new(&file, &bytes);
        assert_eq!(fs::read(&file).unwrap(), bytes);
        owned.push((root.clone(), name));
        let mut request_value = pack[label].clone();
        assert_eq!(request_value["protocolVersion"], 8);
        assert_eq!(
            request_value["payload"]["sourceFiles"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(request_value["payload"]["sourceFiles"][0]["path"], relative);
        assert_eq!(
            request_value["payload"]["sourceFiles"][0]["contentFingerprint"],
            format!("sha256:{digest}")
        );
        request_value["payload"]["repository"]["rootPath"] =
            Value::String(root.to_str().unwrap().replace('\\', "/"));
        let mut serialized = serde_json::to_vec(&request_value).unwrap();
        serialized.push(b'\n');
        save_new(&output.join(format!("{label}.request.jsonl")), &serialized);
        let request = decode_framework_surface_request(&serialized).unwrap();
        let budget = &request.header()["payload"]["resourceBudget"];
        for (key, value) in [
            ("maxDurationMs", 1000),
            ("maxItems", 1000),
            ("maxDepth", 64),
            ("maxMemoryBytes", 65536),
            ("maxInputBytes", 65536),
            ("maxOutputBytes", 65536),
            ("maxEvents", 10000),
        ] {
            assert_eq!(budget[key].as_u64().unwrap(), value);
        }
        assert!(request.header()["payload"]["deadlineEpochMs"].is_null());
        let cancelled = AtomicBool::new(false);
        let control = SyntaxWalkControl {
            deadline: Instant::now()
                + Duration::from_millis(budget["maxDurationMs"].as_u64().unwrap()),
            cancelled: &cancelled,
            max_source_bytes: budget["maxInputBytes"].as_u64().unwrap() as usize,
            max_items: budget["maxItems"].as_u64().unwrap() as usize,
            max_depth: budget["maxDepth"].as_u64().unwrap() as usize,
            max_result_bytes: budget["maxOutputBytes"].as_u64().unwrap() as usize,
        };
        let raw_path = output.join(format!("{label}.output.jsonl"));
        let mut raw = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&raw_path)
            .unwrap();
        let result = write_framework_surface_observation(&request, &control, &mut raw);
        raw.flush().unwrap();
        drop(raw);
        result.unwrap();
        let raw_bytes = fs::read(&raw_path).unwrap();
        let events: Vec<Value> = raw_bytes
            .split(|b| *b == b'\n')
            .filter(|line| !line.is_empty())
            .map(|line| serde_json::from_slice(line).unwrap())
            .collect();
        let terminal = events.last().unwrap();
        assert_eq!(
            terminal["type"], "OBSERVATION_COMPLETED",
            "{label}: {terminal}"
        );
        assert_eq!(terminal["payload"]["outcome"], "SUCCEEDED");
        assert_eq!(terminal["payload"]["codeOutcome"], "COMPLETE");
        assert_eq!(terminal["payload"]["syntaxOutcome"], "COMPLETE");
        for kind in ["CODE_COVERAGE", "SYNTAX_COVERAGE"] {
            let coverage: Vec<_> = events.iter().filter(|e| e["type"] == kind).collect();
            assert!(!coverage.is_empty());
            assert!(
                coverage
                    .iter()
                    .all(|e| e["payload"]["status"] == "COMPLETE")
            );
        }
        assert!(events.iter().any(|e| e["type"] == "SYNTAX_OBSERVATION"
            && e["payload"]["syntaxKind"] == "DECORATION"
            && e["payload"]["payload"]["callee"]["name"] == expected[label]["decoration"]));
        for event in &events {
            if let Some(fingerprint) = event["payload"].get("sourceFingerprint") {
                assert_eq!(fingerprint, &Value::String(format!("sha256:{digest}")));
            }
        }
        println!(
            "LIBRARY_CASE {label} SOURCE_SHA256 {digest} EVENTS {} CODE_COMPLETE SYNTAX_COMPLETE",
            events.len()
        );
    }
    // Cleanup only after both cases pass; a failing observation leaves original raw evidence and roots.
    for (root, name) in owned {
        let resolved = root.canonicalize().unwrap();
        assert_eq!(resolved.parent().unwrap(), temp);
        assert_eq!(root.file_name().unwrap().to_str().unwrap(), name);
        assert!(name.starts_with("codeatlas-modified-unit-library-"));
        fs::remove_dir_all(&resolved).unwrap();
        println!("OWNED_SOURCE_ROOT_REMOVED {}", root.display());
    }
}
