use std::process::Command;

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
    assert_eq!(
        output.stderr,
        b"codeatlas native analyzer behavior is not implemented in P0-W0-001\n"
    );
}
