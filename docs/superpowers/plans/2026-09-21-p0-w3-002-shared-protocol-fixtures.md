# P0-W3-002 Shared Protocol Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one raw Native IPC v1 JSONL corpus that TypeScript and Rust consume byte-for-byte with identical deterministic classifications.

**Architecture:** Committed request/event files under `fixtures/ipc/protocol-v1/` are the only byte authority. A TypeScript test-only classifier reuses the existing Zod IPC schemas; a Rust integration-test classifier uses `serde_json` only as a development dependency. No production decoder, process client, analyzer behavior, or storage path is introduced.

**Tech Stack:** Node.js 24 test runner, TypeScript package build output, Zod 4.6.1, Rust 1.98.1, `serde_json`, Git attributes, JSONL.

**Spec:** `docs/superpowers/specs/2026-09-21-p0-w3-002-shared-protocol-fixtures-design.md`

## Global Constraints

- Fixture ID is exactly `p0-native-ipc-protocol-bytes-v1`; task ID is exactly `P0-W3-002`.
- Protocol version and IR schema version remain exactly `1`.
- The committed `.jsonl` files are the sole byte authority and both consumers read the same repository paths.
- `fixtures/ipc/protocol-v1/**/*.jsonl -text` prevents checkout newline conversion while retaining readable diffs.
- Classification order is byte length, UTF-8/framing, JSON syntax, protocol version, envelope/event legality, sequence, terminal completeness.
- Rust changes are test-only; `src/main.rs` remains unchanged and the analyzer still owns no SQLite state.
- P0-W3-003, P0-W3-004, Java parsing, production streaming, canonicalization, storage, Knowledge, LLM, vectors, watcher, and daemon behavior remain out of scope.
- Do not delete, weaken, or replace the existing P0-W3-001 object-schema tests.

## Review Focus

- A manifest path that is absolute or escapes with `..` must be rejected before file access; Task 1 pins this in the TypeScript loader and Task 3 pins it in Rust.
- A BOM, invalid UTF-8 sequence, unexpected blank line, or CRLF byte change must not be silently normalized; Tasks 1 and 3 exercise these raw-byte mutations.
- Line limits count UTF-8 bytes rather than JavaScript/Rust character counts; Tasks 2 and 3 exercise a multibyte line.
- `OVERSIZE_LINE` must win over malformed JSON when both apply; Tasks 2 and 3 assert precedence.
- Request/event ID disagreement or an event illegal for the request must be `INVALID_EVENT`, while a sequence gap must be `OUT_OF_ORDER`; Tasks 2 and 3 assert both distinctions.

---

## File map

- Create `.gitattributes`: preserve exact JSONL bytes only for the new fixture directory.
- Create `fixtures/ipc/protocol-v1/cases.json`: task metadata, paths, byte lengths, line limits, and expected classifications.
- Create `fixtures/ipc/protocol-v1/<case>/request.jsonl` and `events.jsonl`: twelve raw protocol transcripts.
- Create `packages/providers/test/native-ipc-bytes.test.mjs`: authoritative TypeScript byte consumer and full schema validation.
- Modify `package.json`: include the new TypeScript test in the root test gate.
- Modify `scripts/test-workspace-structure.mjs`: assert that the byte test cannot disappear from the root gate.
- Modify `crates/native-analyzer/Cargo.toml` and `Cargo.lock`: add lockfile-pinned `serde_json` as a development dependency.
- Create `crates/native-analyzer/tests/protocol_fixtures.rs`: Rust consumer for the same bytes.
- Modify `docs/handoff/specs/NATIVE_IPC.md`, `docs/handoff/DESIGN_TRACEABILITY.md`, and `docs/handoff/CURRENT_STATUS.md`: synchronize the executable contract and fresh evidence.

### Task 1: Valid raw corpus and TypeScript byte consumer

**Files:**

- Create: `.gitattributes`
- Create: `fixtures/ipc/protocol-v1/cases.json`
- Create: `fixtures/ipc/protocol-v1/{describe-v1,analyze-java-basic-v1,refresh-modified-file-v1,refresh-delete-file-v1,partial-analysis-v1,cancellation-v1}/{request.jsonl,events.jsonl}`
- Create: `packages/providers/test/native-ipc-bytes.test.mjs`
- Modify: `package.json`
- Modify: `scripts/test-workspace-structure.mjs`

**Interfaces:**

- Consumes: `NativeRequestEnvelopeSchema`, `NativeEventEnvelopeSchema`, and `NativeEventStreamSchema` from `packages/providers/dist/index.js`.
- Produces: test-local `classifyTranscript(requestBytes, eventBytes, maxLineBytes)` returning one closed classification string; the manifest shape consumed later by Rust.

- [ ] **Step 1: Write the failing TypeScript fixture-index and path-safety tests**

Create `native-ipc-bytes.test.mjs` with imports from `node:assert/strict`, `node:fs/promises`, `node:path`, `node:test`, and the three existing IPC schemas. Define:

```js
const fixtureRoot = new URL('../../../fixtures/ipc/protocol-v1/', import.meta.url);
const classifications = new Set([
  'VALID',
  'MALFORMED_JSON',
  'INVALID_EVENT',
  'INCOMPATIBLE_PROTOCOL',
  'OVERSIZE_LINE',
  'OUT_OF_ORDER',
  'PREMATURE_EOF',
]);

function resolveFixturePath(relativePath) {
  assert.equal(typeof relativePath, 'string');
  assert.equal(relativePath.includes('\\'), false);
  const resolved = new URL(relativePath, fixtureRoot);
  assert.equal(resolved.href.startsWith(fixtureRoot.href), true);
  return resolved;
}
```

The first test reads `cases.json`, asserts exact top-level metadata, asserts unique IDs, validates every classification and positive safe-integer limit/byte length, resolves both file paths, and asserts the initial six IDs in the order listed below. A second test calls `resolveFixturePath('../escape.jsonl')` and `resolveFixturePath('/absolute.jsonl')` and asserts rejection.

- [ ] **Step 2: Wire the test into mandatory root checks and prove RED**

Add `packages/providers/test/native-ipc-bytes.test.mjs` immediately after the existing native IPC test in `package.json`. Add a matching `assert.match(manifest.scripts.test, /packages\/providers\/test\/native-ipc-bytes\.test\.mjs/)` assertion in `scripts/test-workspace-structure.mjs`.

Run:

```powershell
pnpm build
node --test packages/providers/test/native-ipc-bytes.test.mjs scripts/test-workspace-structure.mjs
```

Expected: FAIL with `ENOENT` for `fixtures/ipc/protocol-v1/cases.json`; the workspace-structure assertion passes.

- [ ] **Step 3: Add exact-byte protection and the valid manifest entries**

Create `.gitattributes` containing exactly:

```gitattributes
fixtures/ipc/protocol-v1/**/*.jsonl -text
```

Create `cases.json` with the fixed metadata below. Each case contains `id`, `requestFile`, `eventsFile`, `requestBytes`, `eventsBytes`, `maxLineBytes`, and `expected`. Use paths such as `describe-v1/request.jsonl`; use `VALID` for all six initial cases and `8192` for `maxLineBytes`.

```json
{
  "schemaVersion": 1,
  "id": "p0-native-ipc-protocol-bytes-v1",
  "task": "P0-W3-002",
  "governingSpec": "docs/handoff/specs/NATIVE_IPC.md",
  "acceptance": "TypeScript and Rust consume the same Native IPC v1 request and event bytes",
  "cases": []
}
```

Populate `cases` in this exact order: `describe-v1`, `analyze-java-basic-v1`, `refresh-modified-file-v1`, `refresh-delete-file-v1`, `partial-analysis-v1`, `cancellation-v1`. After writing the JSONL files in Step 4, calculate each byte length with `Get-Item <path> | Select-Object -ExpandProperty Length` and replace each manifest length with that printed integer before running tests.

- [ ] **Step 4: Add the six valid transcripts**

Write compact UTF-8 JSON, one object per line, with one final LF and no BOM. Reuse the exact values from `packages/providers/test/native-ipc.test.mjs` for Repository, WORKTREE Revision, SourceFile, ProviderNode, ProviderEdge, capability, coverage, diagnostic, and descriptor shapes. Use these exact request/event sequences:

```text
describe-v1: DESCRIBE -> DESCRIBE_COMPLETED
analyze-java-basic-v1: ANALYZE -> ANALYSIS_STARTED, SOURCE_FILE, NODE, EDGE, COVERAGE, DIAGNOSTIC, ANALYSIS_COMPLETED
refresh-modified-file-v1: REFRESH(modified=[target SourceFile]) -> REFRESH_STARTED, SOURCE_FILE, UPSERT_NODE, UPSERT_EDGE, COVERAGE, REFRESH_COMPLETED
refresh-delete-file-v1: REFRESH(deleted=[{id,path,previousContentFingerprint}]) -> REFRESH_STARTED, REMOVE_NODE, REMOVE_EDGE, REFRESH_COMPLETED
partial-analysis-v1: ANALYZE -> ANALYSIS_STARTED, SOURCE_FILE, COVERAGE(PARTIAL), DIAGNOSTIC, ANALYSIS_COMPLETED(outcome=PARTIAL)
cancellation-v1: CANCEL -> CANCEL_ACCEPTED
```

For every completed event, make counts equal the preceding event categories. Use sequence numbers starting at `0`, the same request ID on every line, and matching repository/revision/fingerprint context. `analyze-java-basic-v1` may use `languageHint: "java"` and `providerKind: "java.method"`; it must not add parser code or claim a stable capability.

- [ ] **Step 5: Implement the minimal TypeScript byte classifier**

Implement these test-local helpers:

```js
function decodeLines(bytes, maxLineBytes) {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return { error: 'MALFORMED_JSON' };
  }
  const rawLines = [];
  let start = 0;
  for (let index = 0; index <= bytes.length; index += 1) {
    if (index !== bytes.length && bytes[index] !== 0x0a) continue;
    const line = bytes.subarray(start, index);
    if (line.length > maxLineBytes) return { error: 'OVERSIZE_LINE' };
    if (line.at(-1) === 0x0d) return { error: 'MALFORMED_JSON' };
    rawLines.push(line);
    start = index + 1;
  }
  if (rawLines.at(-1)?.length === 0) rawLines.pop();
  if (rawLines.length === 0 || rawLines.some((line) => line.length === 0)) {
    return { error: 'MALFORMED_JSON' };
  }
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
    return { lines: rawLines.map((line) => decoder.decode(line)) };
  } catch {
    return { error: 'MALFORMED_JSON' };
  }
}
```

`classifyTranscript` must call `decodeLines` for request and events, require exactly one request line, `JSON.parse` every line, return `INCOMPATIBLE_PROTOCOL` if any parsed envelope has `protocolVersion !== 1`, validate the request and each event schema, return `OUT_OF_ORDER` for a sequence mismatch, return `PREMATURE_EOF` when no legal terminal is last, and finally return `VALID` only when `NativeEventStreamSchema.safeParse({ request, events }).success` is true; all other structural failures return `INVALID_EVENT`.

- [ ] **Step 6: Add valid-case and raw-byte regression assertions**

For each manifest entry, read both files as `Buffer`, assert exact byte lengths, classify, and assert `actual === expected`. Add focused tests that mutate an in-memory valid transcript and assert:

```js
assert.equal(classifyTranscript(Buffer.from([0xef, 0xbb, 0xbf, ...request]), events, 8192), 'MALFORMED_JSON');
assert.equal(classifyTranscript(Buffer.from([0xff]), events, 8192), 'MALFORMED_JSON');
assert.equal(classifyTranscript(Buffer.from(`${validRequest}\n\n`), events, 8192), 'MALFORMED_JSON');
```

- [ ] **Step 7: Run GREEN and commit**

Run:

```powershell
pnpm exec prettier --write fixtures/ipc/protocol-v1/cases.json packages/providers/test/native-ipc-bytes.test.mjs package.json scripts/test-workspace-structure.mjs
pnpm build
node --test packages/providers/test/native-ipc-bytes.test.mjs scripts/test-workspace-structure.mjs
git diff --check
```

Expected: all focused tests PASS; Prettier may report `.gitattributes` as ignored/unchanged, and the JSONL files retain exact bytes.

Commit:

```powershell
git add .gitattributes fixtures/ipc/protocol-v1 packages/providers/test/native-ipc-bytes.test.mjs package.json scripts/test-workspace-structure.mjs
git commit -m "test(ipc): add valid shared protocol bytes"
```

### Task 2: Invalid byte fixtures and deterministic classification

**Files:**

- Modify: `fixtures/ipc/protocol-v1/cases.json`
- Create: `fixtures/ipc/protocol-v1/{malformed-json-v1,invalid-event-v1,incompatible-protocol-v1,oversize-line-v1,out-of-order-v1,premature-eof-v1}/{request.jsonl,events.jsonl}`
- Modify: `packages/providers/test/native-ipc-bytes.test.mjs`

**Interfaces:**

- Consumes: Task 1 manifest and `classifyTranscript`.
- Produces: the final twelve-case corpus and all seven closed classifications required by Task 3.

- [ ] **Step 1: Extend the index expectation first and prove RED**

Change the exact ID assertion to append, in order: `malformed-json-v1`, `invalid-event-v1`, `incompatible-protocol-v1`, `oversize-line-v1`, `out-of-order-v1`, `premature-eof-v1`.

Run `node --test packages/providers/test/native-ipc-bytes.test.mjs`.

Expected: FAIL because the manifest still contains only six case IDs.

- [ ] **Step 2: Add six isolated invalid transcripts**

Append manifest entries with these exact expectations and constructions:

| ID | Expected | Construction |
| --- | --- | --- |
| `malformed-json-v1` | `MALFORMED_JSON` | valid DESCRIBE request; event line ends before the closing braces |
| `invalid-event-v1` | `INVALID_EVENT` | valid ANALYZE request; sequence-0 event type is `ANALYSIS_PROGRESS` |
| `incompatible-protocol-v1` | `INCOMPATIBLE_PROTOCOL` | DESCRIBE request has `protocolVersion: 2`; event is otherwise parseable |
| `oversize-line-v1` | `OVERSIZE_LINE` | valid DESCRIBE transcript; `maxLineBytes` is one less than the event line byte length |
| `out-of-order-v1` | `OUT_OF_ORDER` | valid ANALYZE start at sequence 0 and valid completion at sequence 2 |
| `premature-eof-v1` | `PREMATURE_EOF` | valid ANALYZE request and only `ANALYSIS_STARTED` |

Use `8192` for all line limits except `oversize-line-v1`. Calculate and record exact request/event file lengths as in Task 1.

- [ ] **Step 3: Pin classification precedence and byte counting**

Add in-memory tests that assert:

```js
assert.equal(classifyTranscript(validRequestBytes, Buffer.from('{'.repeat(20)), 10), 'OVERSIZE_LINE');
assert.equal(classifyTranscript(validRequestBytes, Buffer.from('{'), 10), 'MALFORMED_JSON');
assert.equal(Buffer.byteLength('界'), 3);
assert.equal(classifyTranscript(validRequestBytes, Buffer.from('界'), 2), 'OVERSIZE_LINE');
```

Mutate a valid event request ID and assert `INVALID_EVENT`; mutate only its sequence and assert `OUT_OF_ORDER`. Add a CRLF mutation and assert it cannot satisfy the original manifest byte length.

- [ ] **Step 4: Run the complete TypeScript fixture suite and commit**

Run:

```powershell
pnpm exec prettier --write fixtures/ipc/protocol-v1/cases.json packages/providers/test/native-ipc-bytes.test.mjs
pnpm build
node --test packages/providers/test/native-ipc.test.mjs packages/providers/test/native-ipc-bytes.test.mjs scripts/test-workspace-structure.mjs
git diff --check
```

Expected: all existing schema tests and new byte tests PASS; all twelve cases match their declared classifications.

Commit:

```powershell
git add fixtures/ipc/protocol-v1 packages/providers/test/native-ipc-bytes.test.mjs
git commit -m "test(ipc): add invalid protocol byte cases"
```

### Task 3: Rust consumer of the same byte corpus

**Files:**

- Modify: `crates/native-analyzer/Cargo.toml`
- Modify: `Cargo.lock`
- Create: `crates/native-analyzer/tests/protocol_fixtures.rs`

**Interfaces:**

- Consumes: Task 2 `cases.json`, raw request/event paths, lengths, line limits, and classification names.
- Produces: `classify_transcript(request: &[u8], events: &[u8], max_line_bytes: usize) -> Classification` in Rust integration-test scope only.

- [ ] **Step 1: Write the Rust manifest/corpus test before adding the dependency**

Create the integration test with:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Classification {
    Valid,
    MalformedJson,
    InvalidEvent,
    IncompatibleProtocol,
    OversizeLine,
    OutOfOrder,
    PrematureEof,
}

fn expected_classification(value: &str) -> Classification {
    match value {
        "VALID" => Classification::Valid,
        "MALFORMED_JSON" => Classification::MalformedJson,
        "INVALID_EVENT" => Classification::InvalidEvent,
        "INCOMPATIBLE_PROTOCOL" => Classification::IncompatibleProtocol,
        "OVERSIZE_LINE" => Classification::OversizeLine,
        "OUT_OF_ORDER" => Classification::OutOfOrder,
        "PREMATURE_EOF" => Classification::PrematureEof,
        unexpected => panic!("unknown fixture classification: {unexpected}"),
    }
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

fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("fixtures/ipc/protocol-v1")
}
```

Parse `cases.json` as `serde_json::Value`, assert the same metadata and exact twelve IDs, resolve each path only when it is relative and contains only `Component::Normal`, read the bytes, assert declared lengths, and compare `classify_transcript` with the manifest expectation.

- [ ] **Step 2: Run RED**

Run:

```powershell
cargo test -p codeatlas-native-analyzer --test protocol_fixtures
```

Expected: compilation FAIL because `serde_json` is not declared and `classify_transcript` is not yet implemented.

- [ ] **Step 3: Add the minimal development dependency**

Add exactly this section to `crates/native-analyzer/Cargo.toml`:

```toml
[dev-dependencies]
serde_json = "1.0"
```

Run `cargo test -p codeatlas-native-analyzer --test protocol_fixtures --no-run` once to update `Cargo.lock` and compile the test target.

- [ ] **Step 4: Implement the test-only Rust classifier**

Implement `decode_lines` using byte slices split on `b'\n'`, checking length before `std::str::from_utf8`, removing only one final empty segment, and rejecting any remaining empty segment as `MalformedJson`. Parse values with `serde_json::from_str::<Value>`.

`classify_transcript` must mirror the TypeScript precedence: exactly one request line; parse all lines; protocol version `1`; closed request/event types; matching request IDs; zero-based contiguous sequence; request-specific legal events; terminal event last; otherwise the same closed classification. Do not import the classifier from `src/main.rs` or add production modules.

- [ ] **Step 5: Add Rust edge-regression tests**

Add tests that directly call the classifier for absolute/parent paths, BOM/invalid UTF-8, middle blank line, multibyte oversize, oversize-before-malformed precedence, request-ID mismatch, illegal event, sequence gap, and missing terminal. Assert the same result names as the TypeScript tests.

- [ ] **Step 6: Run Rust and cross-language gates, then commit**

Run:

```powershell
cargo fmt --all --check
cargo test -p codeatlas-native-analyzer --test protocol_fixtures
cargo clippy --workspace --all-targets -- -D warnings
pnpm build
node --test packages/providers/test/native-ipc-bytes.test.mjs
git diff --check
```

Expected: Rust and TypeScript consume all twelve case records and agree with the same manifest; Clippy reports no warnings.

Commit:

```powershell
git add crates/native-analyzer/Cargo.toml crates/native-analyzer/tests/protocol_fixtures.rs Cargo.lock
git commit -m "test(native): consume shared IPC byte fixtures"
```

### Task 4: Contract documentation, traceability, and completion evidence

**Files:**

- Modify: `docs/handoff/specs/NATIVE_IPC.md`
- Modify: `docs/handoff/DESIGN_TRACEABILITY.md`
- Modify: `docs/handoff/CURRENT_STATUS.md`

**Interfaces:**

- Consumes: final fixture ID, paths, classifications, focused test counts, full-gate output, and dependency diff from Tasks 1-3.
- Produces: reproducible P0-W3-002 completion record and P0-W3-003 as the next authoritative task.

- [ ] **Step 1: Update the normative IPC fixture section**

Document `p0-native-ipc-protocol-bytes-v1`, `fixtures/ipc/protocol-v1/cases.json`, both consumer test paths, the seven classification names, classification precedence, exact-byte Git attribute, and the test-only boundary. State explicitly that Rust `DESCRIBE`, production decoding/process enforcement, checksum verification, and state application remain P0-W3-003/P0-W3-004 or later.

- [ ] **Step 2: Make the traceability row concrete**

Replace the generic P0-W3-002 Fixture text with:

```text
`p0-native-ipc-protocol-bytes-v1`: `fixtures/ipc/protocol-v1/cases.json`; `packages/providers/test/native-ipc-bytes.test.mjs`; `crates/native-analyzer/tests/protocol_fixtures.rs`
```

Keep acceptance exactly “TypeScript and Rust consume identical fixtures” and governing spec “Native IPC”; do not change Phase 0 thresholds or add an ADR.

- [ ] **Step 3: Run focused checks and full Quality Gate**

Run:

```powershell
pnpm build
node --test packages/providers/test/native-ipc.test.mjs packages/providers/test/native-ipc-bytes.test.mjs scripts/test-workspace-structure.mjs
cargo test -p codeatlas-native-analyzer --test protocol_fixtures
pnpm verify
git diff --check
```

Expected: every command exits `0`. Capture exact Node and Rust pass counts from output; do not infer or pre-write counts.

- [ ] **Step 4: Audit guardrails and Deferred scope**

Run:

```powershell
git diff --name-only 5e0cebb2dd3afb7c203dcdaca63a2190536e74cd..HEAD
git diff 5e0cebb2dd3afb7c203dcdaca63a2190536e74cd..HEAD -- crates/native-analyzer/src packages/providers/src packages/storage packages/knowledge
rg -n "sqlite|sqlx|diesel|tree.sitter|LanguageAnalyzer|spawn|Command::new|child_process|knowledge|llm|embedding|zvec|watch|daemon" crates/native-analyzer/tests/protocol_fixtures.rs packages/providers/test/native-ipc-bytes.test.mjs fixtures/ipc/protocol-v1
```

Expected: no production source diff in the listed directories; search hits, if any, are fixture text or assertions and are explained in `CURRENT_STATUS.md` rather than silently ignored.

- [ ] **Step 5: Update CURRENT_STATUS with only fresh evidence**

Correct the stale top summary to say the implementation chain through P0-W3-001 is integrated on main and P0-W3-002 is the active/completed task as appropriate. Append a P0-W3-002 entry containing task ID, branch/commit baseline, Fixture ID, exact commands and pass counts, schema/migration impact (`none`), dependency impact (`serde_json` dev-only), failure/read-only behavior, guardrail/Deferred audit, known limitations, and next task P0-W3-003. Do not claim hosted CI until an exact pushed SHA has a successful run.

- [ ] **Step 6: Format, re-run the affected documentation checks, and commit**

Run:

```powershell
pnpm exec prettier --write docs/handoff/specs/NATIVE_IPC.md docs/handoff/DESIGN_TRACEABILITY.md docs/handoff/CURRENT_STATUS.md
pnpm format:check
git diff --check
```

Commit:

```powershell
git add docs/handoff/specs/NATIVE_IPC.md docs/handoff/DESIGN_TRACEABILITY.md docs/handoff/CURRENT_STATUS.md
git commit -m "docs: record P0-W3-002 fixture evidence"
```

- [ ] **Step 7: Final branch verification**

Run:

```powershell
pnpm verify
git status --short --branch
git log --oneline --decorate -6
```

Expected: full gate exits `0`; status is clean on `codex/p0-w3-002-protocol-fixtures`; no merge or push is performed without separate authorization.
