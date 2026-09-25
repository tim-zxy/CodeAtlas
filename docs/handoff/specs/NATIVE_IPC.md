# Native IPC Wire Specification

## Ownership and version 1 boundary

`@codeatlas/providers` owns the strict TypeScript request, event, descriptor, and complete-stream schemas. Native output remains Provider Facts and is not Canonical IR until the TypeScript Runtime validates, canonicalizes, merges, and stores it. The Rust analyzer owns no SQLite connection and cannot publish Canonical Knowledge.

Protocol version 1 and IR schema version 1 are the only accepted values in P0-W3-001. The schemas are implemented in `packages/providers/src/native-ipc.ts`; the object-schema Fixture index is `fixtures/ipc/schema-v1/cases.json`, and `packages/providers/test/native-ipc.test.mjs` is a mandatory root-test input. P0-W3-002 adds the shared raw-byte corpus described below. P0-W3-003 implements the one-request Rust `DESCRIBE` boundary and a test-only TypeScript real-binary verifier. P0-W3-004 implements the production TypeScript process lifecycle, streaming decoder, timeout/cancellation, corruption handling, and checksum verification. Validated SQLite state application remains later work.

## Transport

One JSON object per UTF-8 line. TypeScript writes requests to stdin; Rust writes protocol events only to stdout and logs only to stderr. No shell. The client enforces maximum line/event/count/total-byte limits, backpressure, timeout, cancellation, and process termination.

P0-W3-003 enforces the Rust side of a single `DESCRIBE` request per process: one UTF-8 JSON object, exactly one final LF, no BOM/CR/second record, and a 1,000,000-byte total request limit including the LF. It writes exactly one terminal protocol event to stdout for recoverable requests; malformed framing, UTF-8, JSON, or an untrustworthy request ID leaves stdout empty, writes a safe diagnostic to stderr, and exits `2`.

P0-W3-004 adds `executeNativeRequest` as the production TypeScript client boundary. It spawns one absolute executable directly with `shell: false`, writes exactly one bounded request record with backpressure, and incrementally decodes stdout as strict UTF-8 JSONL. The client rejects BOM, CR, blank lines, malformed UTF-8/JSON, incomplete final records, post-terminal bytes, request-ID or sequence drift, illegal event types, oversize lines, excess events, and excess total output. Default limits are 1,000,000 bytes for the request and each output line, 10,000,000 total stdout bytes, 10,000 events, and 1,000,000 captured stderr bytes. Callers may lower, but not raise, these protocol ceilings.

Timeout and `AbortSignal` cancellation terminate the one-shot child, wait through a bounded grace period, and discard every decoded event; they do not write a protocol `CANCEL` request to stdin. Failed terminal events map to typed client failures without exposing their event buffer. Successful results are deeply frozen only after complete-stream and checksum validation. Stderr remains diagnostic-only and is surfaced only as bounded metadata on typed client failures; it is not parsed as protocol data or included in default error serialization.

## Envelope

```ts
interface NativeRequestEnvelope<T> {
  protocolVersion: 1; requestId: string;
  type: "DESCRIBE" | "ANALYZE" | "REFRESH" | "CANCEL";
  payload: T;
}
interface NativeEventEnvelope<T> {
  protocolVersion: 1; requestId: string;
  sequence: number; type: string; payload: T;
}
```

Sequence starts at zero and strictly increases per request. Exactly one terminal event is required. Unknown required versions, duplicate/out-of-order sequence, malformed JSON, oversize payload, post-terminal data, or premature EOF are protocol errors.

All envelopes and payloads are strict: unknown fields are rejected. Request IDs are exact non-blank strings with a maximum of 128 characters. Sequence and count fields are non-negative safe integers; declared budgets and limits are positive safe integers.

## Requests

- `DESCRIBE` declares the client-supported protocol and IR schema version lists. Both lists are non-empty and contain unique positive integers.
- `ANALYZE` supplies IR schema version 1, a ProviderSnapshot ID, Repository, Revision, SourceFiles, unique requested capabilities, optional deadline, and resource budget. Repository and Revision identities must agree; every SourceFile must belong to that Repository and Revision, with no duplicate SourceFile ID.
- `REFRESH` supplies the same execution context plus the exact base revision ID/fingerprint, target Revision, and normalized added/modified/deleted file changes. Added and modified SourceFiles belong to the target Revision. A SourceFile ID may occur only once across the complete change set.
- `CANCEL` identifies the target request ID. A successful cancellation acknowledgement must echo that target exactly.

## DESCRIBE

Returns analyzer version, supported protocol and IR schema versions, languages, capabilities, limits, and build/platform metadata. The runtime selects a mutually supported protocol/IR pair before analysis and rejects incompatibility explicitly.

The version 1 language-neutral descriptor contains Provider, Provider version, Runtime version, unique protocol and IR version lists, unique capabilities, per-language grammar/analyzer/compatibility versions, positive line/event/total-byte limits, and build target/profile. Language IDs must be unique. This metadata is handshake data; it is not silently added to strict Canonical IR or ProviderSnapshot v1. See [ADR-014](../adr/ADR-014-multilanguage-native-analyzer.md) and the [Native Analyzer Scalability specification](../../specs/native-analyzer-scalability.md).

P0-W3-003 emits Provider `native`; package-derived Provider and Runtime versions; protocol/IR lists `[1]`; capability `protocol-handshake`; Java language metadata with grammar/analyzer version `0.0.0` and compatibility version `1`; limits of 1,000,000 line bytes, 10,000 events, and 10,000,000 total bytes; and the compile target/profile. Negotiation checks protocol compatibility before IR compatibility. Incompatibility and other recoverable validation failures emit `REQUEST_FAILED` with a closed error code, fixed bounded message, and `retryable: false`.

P05-W3-001 retains that DESCRIBE framing and negotiation behavior, and after the `java-basic-symbol` and `java-nested-types` Fixtures pass it additionally advertises `SYMBOL`. Java `grammarVersion` is the pinned `tree-sitter-java` crate version `0.23.5`; `analyzerVersion` remains package-derived `0.0.0` and compatibility version remains `1`. `ANALYZE` accepts only Java SYMBOL source files for this task, emits source-grounded ProviderNode facts with complete or partial coverage, and has no REFRESH, relation extraction, framework semantics, or state-application authority. The effective parse-worker count is a private process argument validated against the request budget, not a version-1 IPC field.

P05-W3-002 adds evaluated Java `IMPORT`, `CALL`, `INHERITANCE`, and `REFERENCE` capabilities to DESCRIBE after the four registered relation Fixtures and task-local direct-call gates pass. A relation request uses a bounded two-pass declaration index and emits deterministic ProviderEdge facts with source range, resolved target or honest unresolved/ambiguous candidate state, and per-capability coverage. The existing version-1 event framing, JSONL terminal integrity, and TypeScript client validation remain unchanged. SYMBOL-only requests retain their previous path. This task does not implement REFRESH, Canonical SQLite application, framework semantics, or later-phase knowledge projections.

The first relation pass retains declaration and inheritance context; the second pass re-verifies source and resolves sites. A sole call candidate with positive arity and no argument-type proof is `HEURISTIC`, not `EXACT`. Indexed superclass lookup can supply an inherited candidate, also `HEURISTIC`. Java package declaration nodes are file-scoped, so a normal wildcard package import remains `UNRESOLVED` rather than choosing one file's package node or declaring a false ambiguity; uses of that wildcard can still yield heuristic type candidates. These are resolution semantics within the existing ProviderTarget v1 shape, not new IPC fields.

## ANALYZE events

`ANALYSIS_STARTED`, `SOURCE_FILE`, `NODE`, `EDGE`, `COVERAGE`, `DIAGNOSTIC`, `ANALYSIS_COMPLETED`, and `ANALYSIS_FAILED`. A completed payload includes counts, coverage summary, content fingerprint, and integrity checksum. Failed streams are never applied.

A successful stream starts with `ANALYSIS_STARTED`, uses contiguous sequence numbers from zero, and ends with one `ANALYSIS_COMPLETED`. A pre-start `REQUEST_FAILED` is also a complete terminal stream. Started, failed, and completed context must match the request ProviderSnapshot, Repository, Revision, and fingerprint. ProviderNode and ProviderEdge events retain Provider identity and must match the request snapshot/repository/revision. Terminal counts must equal the emitted source-file, node, edge, coverage, and diagnostic event counts. Successful outcomes are `SUCCEEDED` or `PARTIAL`.

## REFRESH events

Refresh input contains base revision/fingerprint and normalized added/modified/deleted files. Patch events are `UPSERT_NODE`, `REMOVE_NODE`, `UPSERT_EDGE`, and `REMOVE_EDGE`, plus source/coverage/diagnostic and terminal events. The base must match the active graph; otherwise return `BASE_REVISION_MISMATCH` and request full analysis.

A successful stream starts with `REFRESH_STARTED` and ends with one `REFRESH_COMPLETED`; failure uses `REFRESH_FAILED`, and a pre-start validation failure may use `REQUEST_FAILED`. Patch upserts reuse strict ProviderNode and ProviderEdge contracts. Removals use typed Provider NODE/EDGE references rather than Canonical IDs. Terminal counts must equal every emitted patch/source/coverage/diagnostic event category. P0-W3-001 validates the patch protocol only; file-level incremental analysis and atomic validated application remain later tasks.

## Complete-stream validation

For every request, event request IDs match, sequence is exactly zero-based and contiguous, only request-legal event types occur, and exactly one terminal event is last. `ANALYZE` and `REFRESH` also enforce the request `maxEvents` budget, start-event ordering, context agreement, and terminal emitted-count agreement. `DESCRIBE_COMPLETED`, analysis/refresh completed or failed, `CANCEL_ACCEPTED`, and `REQUEST_FAILED` are terminal.

The object-level complete-stream validator intentionally does not compute or verify integrity checksums by itself. The P0-W3-004 byte-stream client computes SHA-256 over the exact raw JSONL bytes of every pre-terminal event, including each LF, and compares the lowercase 64-character checksum in a successful `ANALYSIS_COMPLETED` or `REFRESH_COMPLETED` terminal. A mismatch is protocol corruption and discards the complete result. Failed terminal streams and request forms without a success checksum still receive complete-stream validation.

## Error model

Errors include incompatible protocol/IR, invalid request, unsupported language/capability, source changed during analysis, resource/budget exceeded, cancelled, internal analyzer failure, protocol corruption, and base mismatch. Diagnostics may be non-fatal; only the terminal event determines stream success.

Errors use a closed code enum, an exact non-blank message of at most 128 characters, and an explicit retryable flag. Unknown codes are rejected.

## Shared fixtures

P0-W3-002 defines `p0-native-ipc-protocol-bytes-v1` at `fixtures/ipc/protocol-v1/cases.json`. Its raw JSONL covers describe, analyze, refresh modify/delete, partial analysis, cancellation, malformed JSON, invalid event, incompatible protocol, oversize line, out-of-order sequence, and premature EOF. `packages/providers/test/native-ipc-bytes.test.mjs` and `crates/native-analyzer/tests/protocol_fixtures.rs` consume the same request and event files, require manifest paths to be relative with only normal components, reject POSIX absolute, Windows drive-prefixed, and backslash paths, and verify the declared byte lengths and classifications. URL-looking component text such as `%2e%2e` remains a literal filename component in both consumers; the TypeScript test resolver encodes each validated component before URL resolution so it cannot be normalized into traversal.

The closed classification names are `VALID`, `MALFORMED_JSON`, `INVALID_EVENT`, `INCOMPATIBLE_PROTOCOL`, `OVERSIZE_LINE`, `OUT_OF_ORDER`, and `PREMATURE_EOF`. Classification is deterministic: raw framing is checked before JSON parsing; line byte limits are checked before UTF-8/JSON decoding; malformed JSON precedes protocol and schema checks; incompatible protocol precedes closed-envelope validation; request-ID mismatch precedes sequence checks; sequence gaps precede request-specific legality and terminal completeness; and a legal request-allowed non-terminal prefix produces premature EOF. Request-ID mismatch, illegal event types, invalid envelope shape, or invalid terminal placement produce `INVALID_EVENT`.

Raw Fixture bytes are protected by `fixtures/ipc/protocol-v1/**/*.jsonl -text` in `.gitattributes`; consumers reject BOM, invalid UTF-8, CRLF, and blank lines rather than relying on checkout conversion. The maximum line size is measured in UTF-8 bytes, not characters.

Both P0-W3-002 classifiers are deliberately test-only. P0-W3-003 moves `serde_json` into Rust production dependencies for the real protocol module and adds `p0-native-ipc-handshake-v1` at `fixtures/ipc/handshake-v1/cases.json`. `crates/native-analyzer/tests/handshake.rs` and the test-only `packages/providers/test/native-handshake.test.mjs` spawn the real no-argument executable, verify the five compatible/incompatible/invalid/malformed outcomes, enforce stdout/stderr separation and bounded capture, and validate recoverable output with the existing TypeScript schemas. The verifier is ordered after `cargo build --workspace` and is not production provider code.

P0-W3-001 contributes the TypeScript object-schema Fixture for the request/event matrix, version and limit declarations, complete-stream ordering/terminal/count/context rules, and cancellation. P0-W3-002 proves cross-language agreement on the shared raw corpus. P0-W3-003 implements Rust `DESCRIBE` request decoding and emission. P0-W3-004 adds `p0-native-client-v1` at `fixtures/ipc/client-v1/cases.json`; `packages/providers/test/native-client.test.mjs` exercises malformed, out-of-order, oversize, timeout, cancellation, process-exit, checksum, and immutable-result behavior with a deterministic helper, while `packages/providers/test/native-client-binary.test.mjs` verifies the same production client against the real Rust binary. Atomic validated state application, Java/file-level incremental analysis, and native multi-event analysis emission remain later tasks.

