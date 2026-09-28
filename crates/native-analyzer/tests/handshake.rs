use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::{Value, json};

fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("fixtures/ipc/handshake-v1")
}

fn resolve_fixture_path(root: &Path, relative: &str) -> PathBuf {
    let path = Path::new(relative);
    assert!(!path.is_absolute(), "fixture path must be relative");
    assert!(
        path.components()
            .all(|component| matches!(component, Component::Normal(_))),
        "fixture path must contain normal components only"
    );
    root.join(path)
}

#[test]
fn executable_matches_handshake_fixture() {
    let root = fixture_root();
    let manifest: Value =
        serde_json::from_slice(&fs::read(root.join("cases.json")).unwrap()).unwrap();
    assert_eq!(manifest["schemaVersion"], 1);
    assert_eq!(manifest["id"], "p0-native-ipc-handshake-v1");
    assert_eq!(manifest["task"], "P0-W3-003");
    assert_eq!(
        manifest["governingSpec"],
        "docs/handoff/specs/NATIVE_IPC.md"
    );
    assert_eq!(
        manifest["acceptance"],
        "Rust and TypeScript negotiate the Native IPC v1 DESCRIBE handshake and explicit rejection paths"
    );

    let cases = manifest["cases"].as_array().unwrap();
    assert_eq!(
        cases.iter().map(|case| &case["id"]).collect::<Vec<_>>(),
        [
            "describe-v1",
            "incompatible-protocol-v1",
            "incompatible-ir-v1",
            "invalid-describe-v1",
            "malformed-request-v1"
        ]
    );

    for case in cases {
        let request_path = resolve_fixture_path(&root, case["requestFile"].as_str().unwrap());
        let request = fs::read(request_path).unwrap();
        assert_eq!(request.len() as u64, case["requestBytes"].as_u64().unwrap());
        let request_value = serde_json::from_slice::<Value>(&request).ok();

        let mut child = Command::new(env!("CARGO_BIN_EXE_codeatlas-native-analyzer"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("native analyzer should start");
        child.stdin.take().unwrap().write_all(&request).unwrap();
        let output = child.wait_with_output().unwrap();

        assert_eq!(
            output.status.code(),
            case["expected"]["exitCode"]
                .as_i64()
                .map(|code| code as i32),
            "{}",
            case["id"]
        );
        if case["expected"]["stderr"] == "EMPTY" {
            assert!(output.stderr.is_empty(), "{}", case["id"]);
        } else {
            assert!(!output.stderr.is_empty(), "{}", case["id"]);
        }

        if case["expected"]["eventType"].is_null() {
            assert!(output.stdout.is_empty(), "{}", case["id"]);
            continue;
        }

        assert_eq!(output.stdout.last(), Some(&b'\n'), "{}", case["id"]);
        assert_eq!(
            output.stdout.iter().filter(|byte| **byte == b'\n').count(),
            1,
            "{}",
            case["id"]
        );
        let event: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(event["protocolVersion"], 1);
        assert_eq!(event["sequence"], 0);
        assert_eq!(event["type"], case["expected"]["eventType"]);
        assert_eq!(
            event["requestId"],
            request_value.as_ref().unwrap()["requestId"]
        );

        if let Some(error_code) = case["expected"]["errorCode"].as_str() {
            assert_eq!(event["payload"]["error"]["code"], error_code);
        } else {
            assert_eq!(
                event["payload"],
                json!({
                    "providerId": "native",
                    "providerVersion": env!("CARGO_PKG_VERSION"),
                    "runtimeVersion": env!("CARGO_PKG_VERSION"),
                    "protocolVersions": [1],
                    "irSchemaVersions": [1],
                    "capabilities": ["protocol-handshake", "SYMBOL", "IMPORT", "CALL", "INHERITANCE", "REFERENCE"],
                    "languages": [{
                        "languageId": "java",
                        "grammarVersion": "0.23.5",
                        "analyzerVersion": "0.0.0",
                        "compatibilityVersion": "1"
                    }],
                    "limits": {
                        "maxLineBytes": 1_000_000,
                        "maxEventCount": 10_000,
                        "maxTotalBytes": 10_000_000
                    },
                    "build": {
                        "target": format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS),
                        "profile": "debug"
                    }
                })
            );
        }
    }
}
