# Native IPC Wire Specification

## Ownership and version 1 boundary

`@codeatlas/providers` owns the strict TypeScript request, event, descriptor, and complete-stream schemas. Native output remains Provider Facts and is not Canonical IR until the TypeScript Runtime validates, canonicalizes, merges, and stores it. The Rust analyzer owns no SQLite connection and cannot publish Canonical Knowledge.

Protocol version 1 and IR schema version 1 are the only accepted values in P0-W3-001. The schemas are implemented in `packages/providers/src/native-ipc.ts`; the object-schema Fixture index is `fixtures/ipc/schema-v1/cases.json`, and `packages/providers/test/native-ipc.test.mjs` is a mandatory root-test input. P0-W3-002 adds the shared raw-byte corpus described below. Production byte decoding, process lifecycle, handshake enforcement, and state application remain P0-W3-003, P0-W3-004, or later work.

## Transport

One JSON object per UTF-8 line. TypeScript writes requests to stdin; Rust writes protocol events only to stdout and logs only to stderr. No shell. The client enforces maximum line/event/count/total-byte limits, backpressure, timeout, cancellation, and process termination.

Transport enforcement is specified here but is not implemented in production by P0-W3-002. The complete-stream schema validates already-decoded objects, while the P0-W3-002 consumers are test-only classifiers over the shared byte corpus. Neither task claims production JSONL decoding, process execution, timeout enforcement, checksum verification, or database application.

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

## ANALYZE events

`ANALYSIS_STARTED`, `SOURCE_FILE`, `NODE`, `EDGE`, `COVERAGE`, `DIAGNOSTIC`, `ANALYSIS_COMPLETED`, and `ANALYSIS_FAILED`. A completed payload includes counts, coverage summary, content fingerprint, and integrity checksum. Failed streams are never applied.

A successful stream starts with `ANALYSIS_STARTED`, uses contiguous sequence numbers from zero, and ends with one `ANALYSIS_COMPLETED`. A pre-start `REQUEST_FAILED` is also a complete terminal stream. Started, failed, and completed context must match the request ProviderSnapshot, Repository, Revision, and fingerprint. ProviderNode and ProviderEdge events retain Provider identity and must match the request snapshot/repository/revision. Terminal counts must equal the emitted source-file, node, edge, coverage, and diagnostic event counts. Successful outcomes are `SUCCEEDED` or `PARTIAL`.

## REFRESH events

Refresh input contains base revision/fingerprint and normalized added/modified/deleted files. Patch events are `UPSERT_NODE`, `REMOVE_NODE`, `UPSERT_EDGE`, and `REMOVE_EDGE`, plus source/coverage/diagnostic and terminal events. The base must match the active graph; otherwise return `BASE_REVISION_MISMATCH` and request full analysis.

A successful stream starts with `REFRESH_STARTED` and ends with one `REFRESH_COMPLETED`; failure uses `REFRESH_FAILED`, and a pre-start validation failure may use `REQUEST_FAILED`. Patch upserts reuse strict ProviderNode and ProviderEdge contracts. Removals use typed Provider NODE/EDGE references rather than Canonical IDs. Terminal counts must equal every emitted patch/source/coverage/diagnostic event category. P0-W3-001 validates the patch protocol only; file-level incremental analysis and atomic validated application remain later tasks.

## Complete-stream validation

For every request, event request IDs match, sequence is exactly zero-based and contiguous, only request-legal event types occur, and exactly one terminal event is last. `ANALYZE` and `REFRESH` also enforce the request `maxEvents` budget, start-event ordering, context agreement, and terminal emitted-count agreement. `DESCRIBE_COMPLETED`, analysis/refresh completed or failed, `CANCEL_ACCEPTED`, and `REQUEST_FAILED` are terminal.

This validator intentionally does not compute or verify integrity checksums. It preserves the declared fingerprint/checksum in the terminal payload; production byte-stream checksum computation and process corruption handling belong to P0-W3-003, P0-W3-004, or later validated application work.

## Error model

Errors include incompatible protocol/IR, invalid request, unsupported language/capability, source changed during analysis, resource/budget exceeded, cancelled, internal analyzer failure, protocol corruption, and base mismatch. Diagnostics may be non-fatal; only the terminal event determines stream success.

Errors use a closed code enum, an exact non-blank message of at most 128 characters, and an explicit retryable flag. Unknown codes are rejected.

## Shared fixtures

P0-W3-002 defines `p0-native-ipc-protocol-bytes-v1` at `fixtures/ipc/protocol-v1/cases.json`. Its raw JSONL covers describe, analyze, refresh modify/delete, partial analysis, cancellation, malformed JSON, invalid event, incompatible protocol, oversize line, out-of-order sequence, and premature EOF. `packages/providers/test/native-ipc-bytes.test.mjs` and `crates/native-analyzer/tests/protocol_fixtures.rs` consume the same request and event files, require manifest paths to be relative with only normal components, and verify the declared byte lengths and classifications.

The closed classification names are `VALID`, `MALFORMED_JSON`, `INVALID_EVENT`, `INCOMPATIBLE_PROTOCOL`, `OVERSIZE_LINE`, `OUT_OF_ORDER`, and `PREMATURE_EOF`. Classification is deterministic: raw framing is checked before JSON parsing; line byte limits are checked before UTF-8/JSON decoding; malformed JSON precedes protocol and schema checks; incompatible protocol precedes closed-envelope validation; request-ID mismatch precedes sequence checks; sequence gaps precede request-specific legality and terminal completeness; and a legal request-allowed non-terminal prefix produces premature EOF. Request-ID mismatch, illegal event types, invalid envelope shape, or invalid terminal placement produce `INVALID_EVENT`.

Raw Fixture bytes are protected by `fixtures/ipc/protocol-v1/**/*.jsonl -text` in `.gitattributes`; consumers reject BOM, invalid UTF-8, CRLF, and blank lines rather than relying on checkout conversion. The maximum line size is measured in UTF-8 bytes, not characters.

Both classifiers are deliberately test-only. Rust adds `serde_json` only under `[dev-dependencies]`; it does not add a production protocol module or import test behavior into `src/main.rs`.

P0-W3-001 contributes the TypeScript object-schema Fixture for the request/event matrix, version and limit declarations, complete-stream ordering/terminal/count/context rules, and cancellation. P0-W3-002 proves only cross-language agreement on the shared raw corpus. Rust `DESCRIBE`, production decoding and process enforcement, checksum verification, atomic validated state application, and file-level incremental analysis remain P0-W3-003, P0-W3-004, or later tasks.

