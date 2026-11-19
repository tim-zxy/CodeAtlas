//! Owned local framing driver for the production Rust library. Never part of CLI dispatch.
use codeatlas_native_analyzer::{
    fixed_commit, framework_surface::decode_framework_surface_request, syntax::SyntaxWalkControl,
};
use serde_json::Value;
use std::{
    fs::OpenOptions,
    io::{Read, Write},
    num::NonZeroUsize,
    sync::atomic::AtomicBool,
    time::{Duration, Instant},
};

#[test]
#[ignore = "requires an owned Source-authorized packet on stdin"]
fn emit_owned_packet() {
    let mut input = std::io::stdin().lock();
    let mut length = [0; 4];
    input.read_exact(&mut length).unwrap();
    let length = u32::from_be_bytes(length) as usize;
    assert!(length <= 262144);
    let mut header = vec![0; length];
    input.read_exact(&mut header).unwrap();
    let header: Value = serde_json::from_slice(&header).unwrap();
    let raw = header["request"].as_str().unwrap().as_bytes();
    let request: Value = serde_json::from_slice(raw).unwrap();
    let meta = &header["metadata"];
    let mut blobs = vec![];
    let budget = &request["payload"]["resourceBudget"];
    let mut remaining = (if request["protocolVersion"] == 2 {
        budget["maxMemoryBytes"].as_u64().unwrap()
    } else {
        budget["maxInputBytes"]
            .as_u64()
            .unwrap()
            .saturating_sub(raw.len() as u64)
    })
    .min(10_000_000) as usize;
    for row in meta["files"].as_array().unwrap() {
        let len = usize::try_from(row["sizeBytes"].as_u64().unwrap()).unwrap();
        assert!(len <= remaining);
        remaining -= len;
        let mut bytes = vec![0; len];
        input.read_exact(&mut bytes).unwrap();
        blobs.push(bytes);
    }
    assert_eq!(input.read(&mut [0]).unwrap(), 0);
    let mut out = vec![];
    if request["protocolVersion"] == 2 {
        let exit =
            fixed_commit::write_java(&request, meta, blobs, NonZeroUsize::MIN, &mut out).unwrap();
        assert_eq!(exit, std::process::ExitCode::SUCCESS);
    } else {
        let req = decode_framework_surface_request(raw).unwrap();
        let limits = SyntaxWalkControl {
            deadline: Instant::now() + Duration::from_secs(30),
            cancelled: &AtomicBool::new(false),
            max_source_bytes: 10_000_000,
            max_depth: 256,
            max_items: 100_000,
            max_result_bytes: 10_000_000,
        };
        fixed_commit::write_framework(&req, meta, blobs, &limits, &mut out).unwrap();
    }
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(std::env::var_os("P109_OUTPUT").unwrap())
        .unwrap()
        .write_all(&out)
        .unwrap();
}
