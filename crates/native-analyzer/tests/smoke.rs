use std::io::Write;
use std::process::{Command, Stdio};

#[test]
fn explicit_smoke_mode_starts_without_polluting_protocol_stdout() {
    let output = Command::new(env!("CARGO_BIN_EXE_codeatlas-native-analyzer"))
        .arg("--smoke")
        .output()
        .expect("native analyzer smoke process should start");

    assert!(output.status.success());
    assert!(output.stdout.is_empty());
    assert_eq!(output.stderr, b"codeatlas-native-analyzer:ready\n");
}

#[test]
fn unsupported_invocation_fails_without_polluting_protocol_stdout() {
    let output = Command::new(env!("CARGO_BIN_EXE_codeatlas-native-analyzer"))
        .output()
        .expect("native analyzer process should start");

    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    assert_eq!(output.stderr, b"invalid JSONL request framing\n");
}

#[test]
fn unsupported_arguments_fail_without_polluting_protocol_stdout() {
    for arguments in [["--unknown"].as_slice(), ["--smoke", "extra"].as_slice()] {
        let output = Command::new(env!("CARGO_BIN_EXE_codeatlas-native-analyzer"))
            .args(arguments)
            .output()
            .expect("native analyzer process should start");

        assert_eq!(output.status.code(), Some(2));
        assert!(output.stdout.is_empty());
        assert_eq!(
            output.stderr,
            b"codeatlas-native-analyzer: unsupported arguments\n"
        );
    }
}

#[test]
fn a_second_request_is_rejected_as_unrecoverable_framing() {
    let request = b"{\"protocolVersion\":1,\"requestId\":\"request-a\",\"type\":\"DESCRIBE\",\"payload\":{\"clientProtocolVersions\":[1],\"clientIrSchemaVersions\":[1]}}\n";
    let mut child = Command::new(env!("CARGO_BIN_EXE_codeatlas-native-analyzer"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("native analyzer process should start");
    let input = child.stdin.as_mut().unwrap();
    input.write_all(request).unwrap();
    input.write_all(request).unwrap();
    let output = child.wait_with_output().unwrap();

    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    assert_eq!(output.stderr, b"invalid JSONL request framing\n");
}

#[test]
fn exact_maximum_request_size_reaches_schema_validation() {
    let prefix =
        b"{\"protocolVersion\":1,\"requestId\":\"request-a\",\"type\":\"DESCRIBE\",\"extra\":\"";
    let suffix =
        b"\",\"payload\":{\"clientProtocolVersions\":[1],\"clientIrSchemaVersions\":[1]}}\n";
    let mut request = Vec::with_capacity(1_000_000);
    request.extend_from_slice(prefix);
    request.resize(1_000_000 - suffix.len(), b'a');
    request.extend_from_slice(suffix);
    assert_eq!(request.len(), 1_000_000);

    let mut child = Command::new(env!("CARGO_BIN_EXE_codeatlas-native-analyzer"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("native analyzer process should start");
    child.stdin.take().unwrap().write_all(&request).unwrap();
    let output = child.wait_with_output().unwrap();

    assert!(output.status.success());
    assert!(output.stderr.is_empty());
    let event: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(event["type"], "REQUEST_FAILED");
    assert_eq!(event["payload"]["error"]["code"], "INVALID_REQUEST");
}
