# P0-W3-003 Rust DESCRIBE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement and prove the real Rust native-analyzer `DESCRIBE` handshake against the existing TypeScript Native IPC v1 schemas without introducing the production TypeScript client.

**Architecture:** The Rust binary keeps argument dispatch in `main.rs` and delegates one-request JSONL handling to a small synchronous `protocol.rs` module. One new exact-byte handshake Fixture drives a Rust process test and a test-only Node.js verifier; the Node verifier spawns the already-built binary and validates emitted objects with the existing TypeScript schemas. The root verification sequence builds Rust before running the cross-language test.

**Tech Stack:** Rust 1.98.1 standard library, `serde_json` 1.0, Node.js 24 test runner, TypeScript package build output, Zod 4.6.1, JSONL, pnpm 11.19.0.

**Spec:** `docs/superpowers/specs/2026-09-22-p0-w3-003-rust-describe-design.md`

## Global Constraints

- Task ID is exactly `P0-W3-003`; Fixture ID is exactly `p0-native-ipc-handshake-v1`.
- Protocol version and Canonical IR schema version remain exactly `1`.
- No-argument invocation is one-request JSONL protocol mode; `--smoke` retains the existing smoke behavior; every other argument exits `2` with empty stdout.
- Protocol stdout contains JSONL records only; diagnostics use stderr only.
- Input is one UTF-8 JSON request terminated by exactly one LF, with no BOM, CR, blank line, trailing record, or more than 1,000,000 total bytes including LF.
- The `DESCRIBE` request envelope is version `1`; version incompatibility is negotiated through `clientProtocolVersions` and `clientIrSchemaVersions`.
- Descriptor versions come from `CARGO_PKG_VERSION`; versions are `[1]`; capabilities are exactly `["protocol-handshake"]`; Java grammar/analyzer versions are `0.0.0`; `compatibilityVersion` is `"1"`.
- Descriptor limits are `maxLineBytes: 1000000`, `maxEventCount: 10000`, and `maxTotalBytes: 10000000`.
- Recoverable invalid requests emit exactly one sequence-0 `REQUEST_FAILED` event and exit `0`; unrecoverable malformed framing/JSON emits no stdout and exits `2` with a safe deterministic stderr diagnostic.
- The existing `fixtures/ipc/protocol-v1/` corpus and both P0-W3-002 classifiers remain unchanged.
- No production TypeScript source, `ANALYZE`, `REFRESH`, `CANCEL`, parser, `LanguageAnalyzer`, SQLite apply, Canonicalization, Fact Merge, Knowledge, LLM, embedding, network, watcher, daemon, or later-phase behavior is added.
- Windows `link.exe` LNK1105/error 1224 is a completion blocker. Do not skip, replace, weaken, or report the Rust build/real-binary gate as passing when it occurs.

## Review Focus

- A valid request followed by a second line or trailing byte must fail as unrecoverable framing rather than silently processing the first record; Task 1 adds a unit regression.
- A 128-UTF-16-code-unit `requestId` must be accepted while a 129-unit value, including astral Unicode, must emit `INVALID_REQUEST` consistently with Zod; Task 1 adds unit regressions.
- A version-1 envelope with no common client protocol must emit `INCOMPATIBLE_PROTOCOL_VERSION`, while a non-version-1 envelope must emit `INVALID_REQUEST`; Tasks 1 and 2 pin the distinction.
- Integer-valued JSON spellings such as `1.0` must follow the same acceptance as Zod while fractional, non-positive, or unsafe values fail; Task 1 adds unit regressions.
- `CARGO_TARGET_DIR` may be relative or absolute and Windows requires `.exe`; Task 3 tests path resolution without compiling another binary.

---

## File map

- Create `fixtures/ipc/handshake-v1/cases.json`: task metadata, exact request paths/lengths, and expected process outcomes.
- Create `fixtures/ipc/handshake-v1/<case>/request.jsonl`: five exact request byte streams.
- Modify `.gitattributes`: disable newline conversion for the new handshake JSONL files.
- Create `crates/native-analyzer/src/protocol.rs`: one-request framing, strict validation, negotiation, descriptor/event construction, and JSONL serialization.
- Modify `crates/native-analyzer/src/main.rs`: preserve `--smoke`, reject unsupported arguments, and delegate no-argument mode.
- Modify `crates/native-analyzer/Cargo.toml` and `Cargo.lock`: make the existing `serde_json` dependency available to production code.
- Create `crates/native-analyzer/tests/handshake.rs`: consume the task Fixture and prove process stdout, stderr, events, and exit codes.
- Modify `crates/native-analyzer/tests/smoke.rs`: change the no-argument expectation to protocol-mode framing failure while preserving smoke and unsupported-argument assertions.
- Create `packages/providers/test/native-handshake.test.mjs`: spawn the already-built Rust executable and validate real output with the TypeScript request/event/stream schemas.
- Modify `package.json`: add `test:native-handshake` and run it immediately after `cargo build --workspace` in `verify`.
- Modify `scripts/test-workspace-structure.mjs`: prevent removal or misordering of the real-binary handshake gate.
- Modify `docs/handoff/specs/NATIVE_IPC.md`, `docs/handoff/DESIGN_TRACEABILITY.md`, and `docs/handoff/CURRENT_STATUS.md`: synchronize implemented behavior, traceability, and fresh evidence.

### Task 1: Exact handshake Fixture and pure Rust protocol core

**Files:**

- Create: `fixtures/ipc/handshake-v1/cases.json`
- Create: `fixtures/ipc/handshake-v1/{describe-v1,incompatible-protocol-v1,incompatible-ir-v1,invalid-describe-v1,malformed-request-v1}/request.jsonl`
- Modify: `.gitattributes`
- Create: `crates/native-analyzer/src/protocol.rs`
- Modify: `crates/native-analyzer/src/main.rs`
- Modify: `crates/native-analyzer/Cargo.toml`
- Modify: `Cargo.lock`

**Interfaces:**

- Consumes: Native IPC v1 request/descriptor/error shapes from `packages/providers/src/native-ipc.ts` and `CARGO_PKG_VERSION`.
- Produces: `pub(crate) fn serve_once<R: Read, W: Write, E: Write>(input: &mut R, output: &mut W, diagnostics: &mut E) -> io::Result<ExitCode>` and the five-case `p0-native-ipc-handshake-v1` corpus used by Tasks 2 and 3.

- [ ] **Step 0: Restore the pinned workspace dependencies**

Run:

```powershell
pnpm install --frozen-lockfile
```

Expected: install exits `0` without changing `pnpm-lock.yaml`. If registry access is blocked, request the required network approval; do not switch registries or edit the lockfile.

- [ ] **Step 1: Add the Fixture index and exact request bytes**

Create `cases.json` with this exact shape and case order:

```json
{
  "schemaVersion": 1,
  "id": "p0-native-ipc-handshake-v1",
  "task": "P0-W3-003",
  "governingSpec": "docs/handoff/specs/NATIVE_IPC.md",
  "acceptance": "Rust and TypeScript negotiate the Native IPC v1 DESCRIBE handshake and explicit rejection paths",
  "cases": [
    {
      "id": "describe-v1",
      "requestFile": "describe-v1/request.jsonl",
      "requestBytes": 141,
      "expected": { "exitCode": 0, "eventType": "DESCRIBE_COMPLETED", "errorCode": null, "stderr": "EMPTY" }
    },
    {
      "id": "incompatible-protocol-v1",
      "requestFile": "incompatible-protocol-v1/request.jsonl",
      "requestBytes": 154,
      "expected": { "exitCode": 0, "eventType": "REQUEST_FAILED", "errorCode": "INCOMPATIBLE_PROTOCOL_VERSION", "stderr": "EMPTY" }
    },
    {
      "id": "incompatible-ir-v1",
      "requestFile": "incompatible-ir-v1/request.jsonl",
      "requestBytes": 148,
      "expected": { "exitCode": 0, "eventType": "REQUEST_FAILED", "errorCode": "INCOMPATIBLE_IR_SCHEMA_VERSION", "stderr": "EMPTY" }
    },
    {
      "id": "invalid-describe-v1",
      "requestFile": "invalid-describe-v1/request.jsonl",
      "requestBytes": 158,
      "expected": { "exitCode": 0, "eventType": "REQUEST_FAILED", "errorCode": "INVALID_REQUEST", "stderr": "EMPTY" }
    },
    {
      "id": "malformed-request-v1",
      "requestFile": "malformed-request-v1/request.jsonl",
      "requestBytes": 34,
      "expected": { "exitCode": 2, "eventType": null, "errorCode": null, "stderr": "NON_EMPTY" }
    }
  ]
}
```

Write compact UTF-8 JSON with one final LF and no BOM/CR. Use these values:

```text
describe-v1: protocolVersion 1, requestId "request-describe", type DESCRIBE, clientProtocolVersions [1], clientIrSchemaVersions [1]
incompatible-protocol-v1: same envelope, requestId "request-incompatible-protocol", clientProtocolVersions [2], clientIrSchemaVersions [1]
incompatible-ir-v1: same envelope, requestId "request-incompatible-ir", clientProtocolVersions [1], clientIrSchemaVersions [2]
invalid-describe-v1: version-1 DESCRIBE with requestId "request-invalid" and an extra payload key "unexpected": true
malformed-request-v1: `{"protocolVersion":1,"requestId":` followed by LF
```

Add this line without changing the existing protocol-v1 rule:

```gitattributes
fixtures/ipc/handshake-v1/**/*.jsonl -text
```

Verify every committed `requestBytes` value with `Get-Item <path> | Select-Object -ExpandProperty Length`, and assert `git ls-files --eol fixtures/ipc/handshake-v1` reports `attr/-text` after staging.

- [ ] **Step 2: Write failing Rust unit tests for framing and outcomes**

Create `protocol.rs` with test-only calls to the future `serve_once` interface:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn run(input: &[u8]) -> (ExitCode, Vec<u8>, Vec<u8>) {
        let mut output = Vec::new();
        let mut diagnostics = Vec::new();
        let exit = serve_once(&mut input.as_ref(), &mut output, &mut diagnostics).unwrap();
        (exit, output, diagnostics)
    }

    #[test]
    fn compatible_describe_emits_one_descriptor_event() {
        let (exit, output, diagnostics) = run(br#"{"protocolVersion":1,"requestId":"request-a","type":"DESCRIBE","payload":{"clientProtocolVersions":[1],"clientIrSchemaVersions":[1]}}
"#);
        assert_eq!(exit, ExitCode::SUCCESS);
        assert!(diagnostics.is_empty());
        let event: Value = serde_json::from_slice(&output).unwrap();
        assert_eq!(event["type"], "DESCRIBE_COMPLETED");
        assert_eq!(event["payload"]["capabilities"], json!(["protocol-handshake"]));
    }
}
```

Add focused tests for: missing LF, CRLF, BOM, blank line, invalid UTF-8, malformed JSON, input length 1,000,001, a second line, trailing bytes, invalid/non-string/missing/blank/over-128 `requestId`, unknown envelope/payload fields, non-version-1 envelope, non-DESCRIBE type, empty/duplicate/non-positive/fractional/unsafe version lists, integer-valued `1.0` protocol/list entries, incompatible protocol, incompatible IR, and output-writer failure. Use `"😀".repeat(64)` as exactly 128 UTF-16 code units and append `"a"` for the rejection case.

Add `mod protocol;` at the top of `main.rs` without changing dispatch yet, then run:

```powershell
cargo test -p codeatlas-native-analyzer --bin codeatlas-native-analyzer protocol
```

Expected: compilation FAIL because `serve_once` and its supporting protocol types do not exist yet. Keep the module under the existing binary crate; do not create a library target.

- [ ] **Step 3: Move `serde_json` to production dependencies**

Change `Cargo.toml` from:

```toml
[dependencies]

[dev-dependencies]
serde_json = "1.0"
```

to:

```toml
[dependencies]
serde_json = "1.0"
```

Run `cargo check -p codeatlas-native-analyzer` to refresh `Cargo.lock` only if dependency placement changes it; do not add `serde`, a CLI parser, async runtime, or logging crate.

- [ ] **Step 4: Implement strict parsing helpers**

Implement these private types and signatures in `protocol.rs`:

```rust
use std::io::{self, Read, Write};
use std::process::ExitCode;

use serde_json::{json, Map, Value};

const PROTOCOL_VERSION: u64 = 1;
const IR_SCHEMA_VERSION: u64 = 1;
const MAX_LINE_BYTES: usize = 1_000_000;
const MAX_EVENT_COUNT: u64 = 10_000;
const MAX_TOTAL_BYTES: u64 = 10_000_000;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

struct DescribeRequest {
    request_id: String,
    client_protocol_versions: Vec<u64>,
    client_ir_schema_versions: Vec<u64>,
}

enum RequestFailure {
    Recoverable { request_id: String, code: &'static str, message: &'static str },
    Unrecoverable { diagnostic: &'static str },
}

pub(crate) fn serve_once<R: Read, W: Write, E: Write>(
    input: &mut R,
    output: &mut W,
    diagnostics: &mut E,
) -> io::Result<ExitCode>;
```

Use `input.take((MAX_LINE_BYTES + 1) as u64).read_to_end(...)`. Accept only bytes whose total length is at most `MAX_LINE_BYTES`, whose last byte is LF, and whose preceding bytes contain no LF/CR/BOM. Decode with `std::str::from_utf8`, parse one `Value`, recover `requestId` only from a JSON object when it is exact/nonblank and its UTF-16 length is at most 128, then validate exact object keys.

Use one helper that accepts JSON integer values and integer-valued floating spellings exactly as the TypeScript boundary does, then reuse it for unique positive safe-integer arrays:

```rust
fn safe_integer(value: &Value) -> Option<u64> {
    if let Some(value) = value.as_u64() {
        return (value <= MAX_SAFE_INTEGER).then_some(value);
    }
    let value = value.as_f64()?;
    (value.is_finite()
        && value >= 0.0
        && value.fract() == 0.0
        && value <= MAX_SAFE_INTEGER as f64)
        .then_some(value as u64)
}

fn version_list(object: &Map<String, Value>, key: &str) -> Option<Vec<u64>> {
    let values = object.get(key)?.as_array()?;
    if values.is_empty() { return None; }
    let mut seen = std::collections::HashSet::new();
    values.iter().map(|value| {
        let version = safe_integer(value)?;
        (version > 0 && seen.insert(version)).then_some(version)
    }).collect()
}
```

Envelope validation requires exactly `protocolVersion`, `requestId`, `type`, and `payload`; payload validation requires exactly `clientProtocolVersions` and `clientIrSchemaVersions`. A non-version-1 envelope is recoverable `INVALID_REQUEST` only when the request ID was recovered.

- [ ] **Step 5: Implement negotiation and exact events**

For a valid request, check protocol intersection before IR intersection. Emit sequence `0`, protocol version `1`, and the request ID. Use these exact payload values:

```rust
json!({
    "providerId": "native",
    "providerVersion": env!("CARGO_PKG_VERSION"),
    "runtimeVersion": env!("CARGO_PKG_VERSION"),
    "protocolVersions": [1],
    "irSchemaVersions": [1],
    "capabilities": ["protocol-handshake"],
    "languages": [{
        "languageId": "java",
        "grammarVersion": "0.0.0",
        "analyzerVersion": "0.0.0",
        "compatibilityVersion": "1"
    }],
    "limits": {
        "maxLineBytes": MAX_LINE_BYTES,
        "maxEventCount": MAX_EVENT_COUNT,
        "maxTotalBytes": MAX_TOTAL_BYTES
    },
    "build": {
        "target": format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS),
        "profile": if cfg!(debug_assertions) { "debug" } else { "release" }
    }
})
```

`REQUEST_FAILED` uses `{ error: { code, message, retryable: false } }` with fixed messages no longer than 128 characters. Serialize with `serde_json::to_writer`, append exactly one LF, and flush. Write only unrecoverable diagnostics to stderr and return exit `2`; return exit `0` after every successfully flushed event.

- [ ] **Step 6: Run focused GREEN and commit**

Run:

```powershell
cargo fmt --all
cargo test -p codeatlas-native-analyzer --bin codeatlas-native-analyzer protocol
cargo clippy -p codeatlas-native-analyzer --bin codeatlas-native-analyzer -- -D warnings
git diff --check
```

Expected: all protocol unit tests pass and Clippy reports no warnings.

Commit:

```powershell
git add .gitattributes fixtures/ipc/handshake-v1 crates/native-analyzer/src/protocol.rs crates/native-analyzer/src/main.rs crates/native-analyzer/Cargo.toml Cargo.lock
git commit -m "feat(native): implement DESCRIBE protocol core"
```

### Task 2: Binary dispatch and Rust process-level Fixture verification

**Files:**

- Modify: `crates/native-analyzer/src/main.rs`
- Modify: `crates/native-analyzer/tests/smoke.rs`
- Create: `crates/native-analyzer/tests/handshake.rs`

**Interfaces:**

- Consumes: Task 1 `protocol::serve_once` and `fixtures/ipc/handshake-v1/cases.json`.
- Produces: no-argument executable behavior and a Rust process test that proves every declared Fixture outcome.

- [ ] **Step 1: Write the failing process tests**

In `handshake.rs`, parse the manifest with `serde_json::Value`, assert exact metadata and the five ordered IDs, resolve only relative paths whose `Path::components()` are all `Component::Normal`, assert declared byte lengths, then run:

```rust
let mut child = Command::new(env!("CARGO_BIN_EXE_codeatlas-native-analyzer"))
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .expect("native analyzer should start");
child.stdin.take().unwrap().write_all(&request).unwrap();
let output = child.wait_with_output().unwrap();
```

Assert exit code, stderr policy, one final-LF stdout record for recoverable cases, empty stdout for `malformed-request-v1`, event type/error code, sequence `0`, protocol `1`, and matching request ID. For `describe-v1`, assert the complete literal descriptor including `env!("CARGO_PKG_VERSION")`, `ARCH-OS`, and debug profile.

Update `smoke.rs` first so no arguments with empty stdin expects exit `2`, empty stdout, and the chosen safe framing diagnostic. Keep `--smoke` unchanged and add an unsupported-argument case such as `--unknown`.

Run:

```powershell
cargo test -p codeatlas-native-analyzer --test smoke --test handshake
```

Expected: FAIL because `main.rs` still rejects no-argument protocol mode before reading stdin.

- [ ] **Step 2: Make `main.rs` dispatch only**

Use this control shape:

```rust
mod protocol;

use std::ffi::OsStr;
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut arguments = std::env::args_os().skip(1);
    match (arguments.next(), arguments.next()) {
        (None, None) => protocol::serve_once(
            &mut std::io::stdin().lock(),
            &mut std::io::stdout().lock(),
            &mut std::io::stderr().lock(),
        )
        .unwrap_or_else(|_| ExitCode::from(2)),
        (Some(argument), None) if argument == OsStr::new("--smoke") => {
            eprintln!("codeatlas-native-analyzer:ready");
            ExitCode::SUCCESS
        }
        _ => {
            eprintln!("codeatlas-native-analyzer: unsupported arguments");
            ExitCode::from(2)
        }
    }
}
```

If protocol output or diagnostic I/O fails, return exit `2` without writing a human message to stdout. Do not add argument aliases, help output, a loop, or a second request.

- [ ] **Step 3: Add focused process edge cases**

Add direct process assertions for: `--smoke` plus an extra argument, unknown argument, empty stdin, a valid first request followed by a second request, and a request at the exact maximum byte boundary. Bound test construction so it does not allocate more than 1,000,001 input bytes.

- [ ] **Step 4: Run process GREEN and commit**

Run:

```powershell
cargo fmt --all --check
cargo test -p codeatlas-native-analyzer --test smoke --test handshake
cargo test -p codeatlas-native-analyzer
cargo clippy -p codeatlas-native-analyzer --all-targets -- -D warnings
git diff --check
```

Expected: both process test binaries and all unit tests pass; unsupported modes leave stdout empty.

Commit:

```powershell
git add crates/native-analyzer/src/main.rs crates/native-analyzer/tests/smoke.rs crates/native-analyzer/tests/handshake.rs
git commit -m "test(native): verify DESCRIBE process handshake"
```

### Task 3: Test-only TypeScript real-binary verifier and root gate

**Files:**

- Create: `packages/providers/test/native-handshake.test.mjs`
- Modify: `package.json`
- Modify: `scripts/test-workspace-structure.mjs`

**Interfaces:**

- Consumes: Task 1 Fixture, Task 2 executable, and `NativeRequestEnvelopeSchema`, `NativeEventEnvelopeSchema`, `NativeEventStreamSchema` from `packages/providers/dist/index.js`.
- Produces: root script `test:native-handshake` and a `verify` order that builds the Rust executable before spawning it.

- [ ] **Step 1: Write path-resolution and manifest tests before gate wiring**

Create the Node test with these helpers:

```js
const repositoryRoot = new URL('../../../', import.meta.url);
const fixtureRoot = new URL('../../../fixtures/ipc/handshake-v1/', import.meta.url);

function nativeBinaryPath({ targetDirectory = process.env.CARGO_TARGET_DIR, platform = process.platform } = {}) {
  const root = targetDirectory
    ? path.resolve(fileURLToPath(repositoryRoot), targetDirectory)
    : path.resolve(fileURLToPath(repositoryRoot), 'target');
  return path.join(root, 'debug', platform === 'win32' ? 'codeatlas-native-analyzer.exe' : 'codeatlas-native-analyzer');
}
```

Use `path.isAbsolute(targetDirectory)` explicitly so an absolute `CARGO_TARGET_DIR` remains absolute and a relative value resolves from repository root. Test default, relative, absolute, Windows suffix, and non-Windows filename cases without spawning.

Read `cases.json`, assert exact task metadata, ordered IDs, expected shapes, safe relative request paths, actual byte lengths, and unique IDs.

Run `pnpm build && node --test packages/providers/test/native-handshake.test.mjs`.

Expected: path/manifest tests pass; process cases fail with `ENOENT` until the Rust binary has been built in this worktree.

- [ ] **Step 2: Implement bounded direct spawning**

Implement a helper returning `{ code, stdout, stderr }`:

```js
function runHandshake(binary, request, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [], {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {},
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const timer = setTimeout(() => child.kill(), 5_000);
    const collect = (chunks, kind) => (chunk) => {
      if (kind === 'stdout') stdoutBytes += chunk.length;
      else stderrBytes += chunk.length;
      if (stdoutBytes > limit || stderrBytes > limit) {
        child.kill();
        reject(new Error(`native ${kind} exceeded capture limit`));
        return;
      }
      chunks.push(chunk);
    };
    child.stdout.on('data', collect(stdout, 'stdout'));
    child.stderr.on('data', collect(stderr, 'stderr'));
    child.once('error', reject);
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    });
    child.stdin.end(request);
  });
}
```

Guard settlement so kill/error/close can resolve or reject only once. A timeout rejects with `native handshake timed out`; capture overflow rejects with the stream name. Do not invoke `cargo`, a shell, or production provider code.

- [ ] **Step 3: Validate every real process result with TypeScript schemas**

For each Fixture case, parse the request only when JSON syntax is valid. Recoverable cases must have stdout ending in one LF, no other LF, empty stderr, and exactly one parsed event. Validate the request with `NativeRequestEnvelopeSchema`, the event with `NativeEventEnvelopeSchema`, and `{ request, events: [event] }` with `NativeEventStreamSchema`.

For incompatible cases, the request itself remains schema-valid because its envelope is version `1`; assert the exact error code from the manifest. For `invalid-describe-v1`, assert the raw request is intentionally rejected by `NativeRequestEnvelopeSchema` while the emitted `REQUEST_FAILED` event validates. For `malformed-request-v1`, assert exit `2`, empty stdout, bounded nonempty stderr, and no attempt to fabricate an event.

Add an in-memory capture-limit test using a short-lived Node child process or export the collector into test-local injection; it must reject once output exceeds the bound rather than retaining unbounded bytes.

- [ ] **Step 4: Wire the root script and prove ordering**

Add:

```json
"test:native-handshake": "node --test packages/providers/test/native-handshake.test.mjs"
```

Change `verify` so the tail is exactly:

```text
... && pnpm format:rust:check && cargo build --workspace && pnpm test:native-handshake && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
```

Do not add `native-handshake.test.mjs` to the ordinary `test` script because `test` runs before `cargo build` in `verify`.

In `test-workspace-structure.mjs`, assert the new script value and compare string indexes:

```js
assert.equal(manifest.scripts['test:native-handshake'], 'node --test packages/providers/test/native-handshake.test.mjs');
assert.ok(manifest.scripts.verify.indexOf('cargo build --workspace') < manifest.scripts.verify.indexOf('pnpm test:native-handshake'));
assert.ok(manifest.scripts.verify.indexOf('pnpm test:native-handshake') < manifest.scripts.verify.indexOf('cargo clippy --workspace'));
```

- [ ] **Step 5: Run cross-language GREEN and commit**

Run:

```powershell
pnpm build
cargo build --workspace
pnpm test:native-handshake
node --test packages/providers/test/native-ipc.test.mjs packages/providers/test/native-ipc-bytes.test.mjs scripts/test-workspace-structure.mjs
git diff --check
```

Expected: all five Fixture cases exercise the real Rust binary; all existing provider tests still pass; the root ordering assertions pass. If Cargo hits LNK1105/error 1224, record the exact failing command and stop the completion claim rather than substituting another executable.

Commit:

```powershell
git add packages/providers/test/native-handshake.test.mjs package.json scripts/test-workspace-structure.mjs
git commit -m "test(ipc): verify real Rust DESCRIBE handshake"
```

### Task 4: Normative documentation, traceability, and completion evidence

**Files:**

- Modify: `docs/handoff/specs/NATIVE_IPC.md`
- Modify: `docs/handoff/DESIGN_TRACEABILITY.md`
- Modify: `docs/handoff/CURRENT_STATUS.md`

**Interfaces:**

- Consumes: final Fixture paths, test names, dependency placement, focused counts, full-gate output, and exact commit SHAs from Tasks 1-3.
- Produces: synchronized P0-W3-003 contract/evidence and P0-W3-004 as the next authoritative task only after every mandatory gate passes.

- [ ] **Step 1: Update the Native IPC implementation boundary**

Document that P0-W3-003 now implements one-request Rust `DESCRIBE`, exact descriptor constants, version negotiation, recoverable `REQUEST_FAILED`, unrecoverable malformed-request behavior, and the test-only real-binary TypeScript verifier. Keep production TypeScript process lifecycle, streaming, timeout/cancellation, corruption handling, checksum verification, and state application assigned to P0-W3-004 or later validated work.

- [ ] **Step 2: Make the traceability row executable**

Replace the generic P0-W3-003 Fixture text with:

```text
`p0-native-ipc-handshake-v1`: `fixtures/ipc/handshake-v1/cases.json`; `crates/native-analyzer/tests/handshake.rs`; `packages/providers/test/native-handshake.test.mjs`; stdout/stderr and unsupported-argument process checks
```

Keep acceptance `Rust/TypeScript handshake and rejection` and governing authorities `Native IPC; Provider SPI; docs/specs/native-analyzer-scalability.md; ADR-014`. Do not change a frozen decision, phase threshold, Canonical IR schema, or migration.

- [ ] **Step 3: Run focused checks and the full Quality Gate**

Run:

```powershell
pnpm build
cargo build --workspace
cargo test -p codeatlas-native-analyzer --bin codeatlas-native-analyzer protocol
cargo test -p codeatlas-native-analyzer --test smoke --test handshake
pnpm test:native-handshake
node --test packages/providers/test/native-ipc.test.mjs packages/providers/test/native-ipc-bytes.test.mjs scripts/test-workspace-structure.mjs
pnpm verify
git diff --check
```

Expected: every command exits `0`. Capture exact pass counts and exact commands from the fresh output. A prior successful run is not evidence for a command that currently fails with LNK1105/error 1224.

- [ ] **Step 4: Audit architecture and deferred scope**

Run:

```powershell
git diff --name-only f694bc60959ff3fcab9e9ed23bed95e42ee86bc5..HEAD
git diff f694bc60959ff3fcab9e9ed23bed95e42ee86bc5..HEAD -- packages/providers/src packages/storage packages/knowledge
rg -n -i "sqlite|sqlx|diesel|tree.sitter|LanguageAnalyzer|ANALYZE|REFRESH|CANCEL|canonicaliz|FactMerger|knowledge|llm|embedding|zvec|network|watch|daemon" crates/native-analyzer/src crates/native-analyzer/tests/handshake.rs packages/providers/test/native-handshake.test.mjs fixtures/ipc/handshake-v1
```

Expected: no production TypeScript/storage/knowledge diff. Explain expected negative-scope words in test assertions or documentation; investigate every production Rust hit before claiming the audit passes.

- [ ] **Step 5: Update CURRENT_STATUS only from observed evidence**

Append a P0-W3-003 entry containing task ID, exact implementation commits, Fixture ID, focused/full commands and pass counts, schema/migration impact (`none`), dependency impact (`serde_json` production-only for protocol JSON), failure/recovery behavior, stdout/stderr proof, architecture/deferred audit, and next task P0-W3-004. If the linker blocker remains, record P0-W3-003 as blocked/incomplete and do not advance the next-action summary.

- [ ] **Step 6: Format, verify documentation, and commit**

Run:

```powershell
pnpm exec prettier --write docs/handoff/specs/NATIVE_IPC.md docs/handoff/DESIGN_TRACEABILITY.md docs/handoff/CURRENT_STATUS.md
pnpm format:check
git diff --check
```

Commit only if the evidence text matches observed results:

```powershell
git add docs/handoff/specs/NATIVE_IPC.md docs/handoff/DESIGN_TRACEABILITY.md docs/handoff/CURRENT_STATUS.md
git commit -m "docs: record P0-W3-003 handshake evidence"
```

- [ ] **Step 7: Final exact-HEAD verification**

Run:

```powershell
pnpm verify
git status --short --branch
git log --oneline --decorate -8
```

Expected: full gate exits `0`, the worktree is clean, and the log contains only the reviewed P0-W3-003 design/plan/implementation sequence. Do not merge, push, or claim hosted CI without separate authorization and observed exact-SHA evidence.
