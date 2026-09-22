# P0-W3-002 Shared Protocol Fixtures Design

Status: approved implementation design for the existing Phase 0 task. This design makes the Native IPC v1 byte contract executable in TypeScript and Rust without implementing the Rust handshake or the production TypeScript process client.

## Authority and scope

P0-W3-002 is governed by ADR-010, ADR-012, ADR-014, `docs/handoff/specs/NATIVE_IPC.md`, and the P0-W3-002 traceability row. P0-W3-001 remains the object-level TypeScript schema authority. This task adds one committed set of raw request/stdout bytes and proves that both language test suites consume those exact files.

The task does not add a production JSONL decoder, spawn a process, implement Rust `DESCRIBE`, parse Java, introduce a `LanguageAnalyzer`, canonicalize Provider Facts, write SQLite, or activate graph state. Those responsibilities remain with P0-W3-003, P0-W3-004, and Phase 0.5 tasks.

## Shared fixture layout

The fixture has ID `p0-native-ipc-protocol-bytes-v1` and lives at:

```text
fixtures/ipc/protocol-v1/
  cases.json
  <case-id>/
    request.jsonl
    events.jsonl
```

`cases.json` is the versioned index. Each case declares:

- a stable case ID;
- the repository-relative request and event byte paths;
- the expected classification;
- the maximum permitted bytes for one line in that scenario; and
- the expected byte length of each file.

The byte lengths detect accidental BOM or newline conversion without adding a hashing dependency. Both consumers resolve the declared paths under the fixture root and reject absolute paths, parent traversal, and paths outside that root.

The committed `.jsonl` files are the sole byte authority. They are not generated into separate TypeScript and Rust copies. A path-specific `.gitattributes` `-text` rule disables newline conversion for `fixtures/ipc/protocol-v1/**/*.jsonl` while retaining readable diffs.

## Framing and classification

Every fixture is evaluated in this order:

1. compare the raw file byte lengths with the manifest;
2. decode strict UTF-8 without replacement;
3. split on LF and enforce the case-specific line-byte limit before JSON parsing;
4. require exactly one request line and one or more event lines, allowing only the final empty segment caused by a trailing LF;
5. parse each declared line as one JSON value;
6. validate protocol version and envelope/event structure;
7. validate zero-based contiguous sequencing and request/event agreement; and
8. require exactly one legal terminal event at the end for a valid transcript.

The closed result set is:

```text
VALID
MALFORMED_JSON
INVALID_EVENT
INCOMPATIBLE_PROTOCOL
OVERSIZE_LINE
OUT_OF_ORDER
PREMATURE_EOF
```

Checks use the order above so a scenario has one deterministic expected classification. In particular, line size wins before JSON/schema validation, malformed JSON wins before envelope checks, and protocol incompatibility wins before event-stream semantics.

## Required cases

| Case | Expected result | Purpose |
| --- | --- | --- |
| `describe-v1` | `VALID` | Language-neutral descriptor and version metadata |
| `analyze-java-basic-v1` | `VALID` | Protocol transcript containing Java-shaped Provider Facts only; no parser or capability-maturity claim |
| `refresh-modified-file-v1` | `VALID` | Valid modified-file patch transcript |
| `refresh-delete-file-v1` | `VALID` | Valid deleted-file patch transcript |
| `partial-analysis-v1` | `VALID` | `PARTIAL` outcome with explicit partial coverage/diagnostic evidence |
| `cancellation-v1` | `VALID` | `CANCEL` request and matching acknowledgement |
| `malformed-json-v1` | `MALFORMED_JSON` | Invalid JSON stdout line |
| `invalid-event-v1` | `INVALID_EVENT` | Syntactically valid but unknown/illegal event envelope |
| `incompatible-protocol-v1` | `INCOMPATIBLE_PROTOCOL` | Unsupported protocol version |
| `oversize-line-v1` | `OVERSIZE_LINE` | Otherwise parseable line exceeding its fixture limit |
| `out-of-order-v1` | `OUT_OF_ORDER` | Sequence gap or reordering |
| `premature-eof-v1` | `PREMATURE_EOF` | Stream ends without its required terminal event |

The first ten cases satisfy the explicit `WORK_BREAKDOWN.md` task list. Cancellation and out-of-order are also included because the higher-authority Native IPC specification requires them in the shared byte suite.

## TypeScript consumer

`packages/providers/test/native-ipc-bytes.test.mjs` reads `cases.json` and the referenced files as raw buffers. It performs the framing checks above, parses the request with `NativeRequestEnvelopeSchema`, and validates valid transcripts with `NativeEventStreamSchema`. Invalid cases assert the exact declared classification rather than merely asserting that some exception occurred.

This is test infrastructure only. The existing P0-W3-001 object-schema tests remain in place and are not weakened or replaced. The new test is an explicit root `pnpm test` input and is asserted by the workspace-structure test.

## Rust consumer

`crates/native-analyzer/tests/protocol_fixtures.rs` reads the same manifest and the same raw files from the repository fixture directory. It uses `serde_json` as a development dependency to avoid implementing a JSON parser. Its test-only verifier checks UTF-8, line size, JSON syntax, protocol version, the closed event names needed by these fixtures, request IDs, sequence order, and terminal presence.

The Rust verifier is deliberately not a production IPC implementation and is not called by `src/main.rs`. P0-W3-003 will implement `DESCRIBE`; P0-W3-004 owns the production TypeScript streaming/process boundary. `serde_json` therefore enters `[dev-dependencies]` only in this task.

## Failure and recovery properties

Fixture validation is read-only. A rejected transcript returns no partial typed stream and cannot mutate Canonical State, SQLite, or Published Knowledge. Tests use committed local bytes only and perform no network, process, or database operation.

An oversize case uses a small scenario-specific limit rather than committing a multi-megabyte line. This tests byte-boundary behavior without creating repository bloat or inventing a production limit. Negotiated production limits remain owned by the descriptor and P0-W3-004 client.

## Documentation and traceability

Implementation completion updates:

- `docs/handoff/specs/NATIVE_IPC.md` with the concrete Fixture ID, location, classification contract, and task boundary;
- `docs/handoff/DESIGN_TRACEABILITY.md` with exact TypeScript/Rust test paths and acceptance mapping; and
- `docs/handoff/CURRENT_STATUS.md` with fresh commands, pass counts, dependency impact, Deferred audit, and the next unblocked task.

The stale summary at the top of `CURRENT_STATUS.md` is corrected to match the already-recorded integration checkpoint while preserving all historical evidence.

No ADR, Canonical IR version, IPC protocol version, migration, or acceptance threshold changes.

## Acceptance

P0-W3-002 is complete only when:

- all twelve indexed cases are read from the same committed paths by TypeScript and Rust;
- both consumers agree on every deterministic classification;
- all valid transcripts pass the existing TypeScript IPC schemas;
- byte lengths and line limits are enforced from raw buffers;
- the path-specific Git attribute protects raw bytes across platforms;
- focused TypeScript and Rust fixture tests pass;
- the full `pnpm verify` gate passes, including formatting, all workspace builds/tests, dependency guardrails, Rust formatting/build/Clippy/tests;
- documentation and Task-Fixture-Acceptance traceability are synchronized; and
- no P0-W3-003/P0-W3-004, Java parser, storage, Knowledge, LLM, vector, watcher, daemon, or later-phase behavior is introduced.
