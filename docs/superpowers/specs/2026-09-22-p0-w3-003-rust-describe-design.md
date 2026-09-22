# P0-W3-003 Rust DESCRIBE Design

## Status and intent

- Status: written design approved by the user on 2026-09-22.
- Phase: Phase 0, Workstream 3.
- Task: P0-W3-003 Rust `DESCRIBE` protocol handshake.
- Scope: expose and verify the native analyzer descriptor over the versioned JSONL IPC contract.

This task proves that the real Rust executable and the existing TypeScript protocol schemas agree on the initial handshake. It does not introduce analysis, refresh, cancellation, Canonical IR persistence, or a production TypeScript native-process client.

## Authority and acceptance

The controlling documents are:

- `docs/handoff/WORK_BREAKDOWN.md`, task P0-W3-003;
- `docs/handoff/PHASE_ACCEPTANCE.md`, Phase 0 native-analyzer acceptance;
- `docs/handoff/specs/NATIVE_IPC.md`;
- `docs/handoff/specs/PROVIDER_SPI.md`;
- `docs/handoff/specs/MODULE_BOUNDARIES.md`;
- ADR-002, ADR-010, ADR-012, and ADR-014;
- `docs/specs/native-analyzer-scalability.md`.

The task is accepted only when the following are demonstrated with fresh evidence:

1. the Rust binary reads a `DESCRIBE` request from standard input;
2. standard output contains protocol JSONL only and standard error contains diagnostics only;
3. the descriptor is language-neutral and validates against the TypeScript schema;
4. compatible and incompatible protocol/IR negotiations produce the specified deterministic events;
5. the same task Fixture drives Rust-side and TypeScript-side verification;
6. all applicable unit, Fixture, architecture, formatting, build, and Quality Gates pass.

The current machine has a known Rust linker blocker: Windows `link.exe` reports LNK1105 with error 1224 while closing the newly generated executable. This is not waived by this design and must be resolved or proven absent before implementation completion.

## Chosen approach

Build the native analyzer once, then run a test-only Node.js handshake verifier against the built executable. The verifier sends Fixture requests to the real Rust process and validates its emitted events with the existing TypeScript schemas.

This is intentionally narrower than a production client:

- it exercises the true cross-language boundary instead of validating a copied response Fixture;
- it avoids repeated `cargo run` compilation inside tests;
- it does not prematurely implement P0-W3-004 process lifecycle, streaming, cancellation, or recovery behavior;
- it adds no schema framework or production TypeScript abstraction.

## Process modes

The binary has two explicit modes:

- no arguments: JSONL protocol mode on standard input/output;
- `--smoke`: retain the existing smoke-test behavior.

Any other argument is rejected with exit code `2`, no protocol output, and a safe diagnostic on standard error. Protocol mode does not print banners, logs, prompts, or human-readable summaries to standard output.

## Request framing and validation

Protocol mode reads exactly one UTF-8 JSON request line for this task. The line must:

- terminate with one LF byte;
- not contain a UTF-8 BOM;
- not contain CR bytes;
- not be blank;
- be valid UTF-8 and valid JSON;
- be no larger than 1,000,000 bytes including the terminating LF.

The request envelope is closed: unknown envelope or payload fields are rejected. `requestId` must be a non-blank string of at most 128 characters. A valid P0-W3-003 request has type `DESCRIBE` and the exact payload declared by `NATIVE_IPC.md`.

The handshake request itself uses the version-1 envelope. Negotiated incompatibility is expressed by the client-supported version lists in its payload; a non-version-1 envelope is an invalid request rather than a successfully decoded negotiation request.

Validation precedence is deterministic:

1. framing and byte limit;
2. UTF-8 decoding;
3. JSON parsing;
4. recover a valid `requestId` when possible;
5. envelope and protocol-field validation;
6. request-type and payload validation;
7. mutually supported protocol version;
8. mutually supported IR schema version.

If no trustworthy request ID can be recovered, the request is unrecoverable: standard output remains empty, a safe diagnostic is written to standard error, and the process exits `2`. A recoverable invalid request emits one `REQUEST_FAILED` event for its request ID and exits successfully after flushing the event.

## Descriptor contract

For a mutually compatible request, Rust emits one `DESCRIBE_COMPLETED` event containing:

- `providerId`: `native`;
- provider and runtime versions: the Cargo package version;
- supported protocol versions: `[1]`;
- supported Canonical IR schema versions: `[1]`;
- capabilities: `['protocol-handshake']`;
- language registrations: Java `grammarVersion` and `analyzerVersion` are `0.0.0`, and `compatibilityVersion` is the string `"1"`;
- limits: 1,000,000 bytes per JSONL line, 10,000 events per request, and 10,000,000 total output bytes per request;
- build metadata: target expressed as `ARCH-OS` and profile `debug` or `release`.

`protocol-handshake` describes the only capability actually delivered by this task; it does not claim code-graph analysis. The Java registration reserves the already-designed language identity while version `0.0.0` explicitly avoids claiming parser or analyzer maturity before Phase 0.5.

For incompatible negotiation, Rust emits exactly one recoverable failure event:

- no shared protocol version: `REQUEST_FAILED` with `INCOMPATIBLE_PROTOCOL_VERSION`;
- shared protocol but no shared IR schema version: `REQUEST_FAILED` with `INCOMPATIBLE_IR_SCHEMA_VERSION`.

An otherwise recoverable malformed or unsupported request emits `REQUEST_FAILED` with `INVALID_REQUEST`. Error details must be deterministic and safe; they must not echo arbitrary input or host paths.

## Implementation boundaries

The intended Rust change is surgical:

- `crates/native-analyzer/src/main.rs` keeps argument dispatch only;
- a new `crates/native-analyzer/src/protocol.rs` owns framing, validation, negotiation, and event serialization;
- `serde_json` moves from development-only to production dependencies because the executable now serializes protocol events;
- no additional parsing, schema, async-runtime, CLI, logging, or IPC dependency is added.

No production TypeScript source changes are required. The existing provider IPC schemas remain the validation authority for the cross-language test. Rust must not open SQLite, construct Canonical knowledge, call a Provider or Knowledge service, invoke a shell, access the network, or perform long-running work.

## Fixture design

Add one task-specific Fixture corpus:

`fixtures/ipc/handshake-v1/cases.json`

It contains exact request bytes and expected outcome metadata for:

- `describe-v1`;
- `incompatible-protocol-v1`;
- `incompatible-ir-v1`;
- `invalid-describe-v1`;
- `malformed-request-v1`.

Both Rust tests and the TypeScript cross-language verifier consume this same corpus. Tests may add focused in-memory cases for internal edge conditions, but must not duplicate the five acceptance cases in a second authoritative Fixture.

The existing P0-W3-002 classifier corpus remains unchanged. Its purpose is source classification; the new corpus proves protocol negotiation and stdout/stderr behavior.

## Test and Quality Gate wiring

Rust tests cover framing, validation precedence, negotiation, deterministic descriptor construction, safe errors, and JSONL serialization. A process-level Rust integration test covers standard streams and exit codes.

Add `packages/providers/test/native-handshake.test.mjs` as a test-only cross-language verifier. It must:

- locate the already-built binary, honoring `CARGO_TARGET_DIR` and the Windows `.exe` suffix;
- spawn it directly with shell execution disabled;
- send the exact Fixture bytes;
- bound captured stdout and stderr;
- validate every emitted object with the existing TypeScript event/stream schemas;
- assert protocol-only stdout, expected stderr policy, exit status, and expected event semantics.

Add a root `test:native-handshake` script. The root `pnpm verify` sequence runs it after `cargo build --workspace`, so the verifier never silently compiles a different binary or hides a build failure.

Required evidence includes:

- focused Rust unit and integration tests;
- the shared handshake Fixture run;
- the TypeScript real-binary handshake test;
- existing provider tests;
- architecture checks;
- repository formatting, build, and full `pnpm verify` gates;
- a clean diff check.

The pre-existing LNK1105/1224 machine failure is recorded as a blocker, not converted into a skipped test, relaxed gate, alternate fake binary, or success claim.

## Failure and recovery semantics

P0-W3-003 handles one handshake request per process. A recoverable protocol failure produces a terminal `REQUEST_FAILED` event and preserves stream validity. An unrecoverable framing failure produces no stdout event because there is no trustworthy correlation identity.

No Canonical State or Published Knowledge is touched, so failure cannot partially update SQLite or knowledge publication. The process is disposable; retry starts a fresh process with the same deterministic descriptor.

## Deferred scope

The following remain explicitly deferred:

- the production TypeScript native client and streaming lifecycle: P0-W3-004;
- `ANALYZE`, `REFRESH`, `CANCEL`, multi-request sessions, backpressure, timeouts, and process supervision: P0-W3-004 or its governed successors;
- Java or Tree-sitter parsing and the `LanguageAnalyzer` boundary: Phase 0.5;
- framework semantics: plugins, not the native grammar layer;
- Canonicalization, Fact Merge, SQLite application, and incremental graph updates: their assigned tasks/phases;
- Knowledge compilation, wiki projection, embeddings, LLM candidates, and publication workflows: later governed phases.

No Phase 2 or Phase 3 capability is introduced, and no Phase 4 is created.

## Documentation and completion record

After implementation, synchronize:

- `docs/handoff/specs/NATIVE_IPC.md` if implementation exposes a missing non-design-changing clarification;
- `docs/handoff/DESIGN_TRACEABILITY.md` with the final Task–Fixture–Test–Acceptance evidence;
- `docs/handoff/CURRENT_STATUS.md` with commands, results, commit, and any still-open blocker.

An ADR is required only if implementation evidence demands changing a frozen boundary. This design does not authorize such a change.

P0-W3-003 is not complete merely when code exists. It is complete only when implementation, unit tests, the shared Fixture, the real Rust/TypeScript handshake, applicable Quality Gates, architecture guardrails, documentation consistency, and fresh reproducible status evidence all pass without introducing deferred scope.
