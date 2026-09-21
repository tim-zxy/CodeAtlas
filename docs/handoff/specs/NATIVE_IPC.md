# Native IPC Wire Specification

## Ownership and version 1 boundary

`@codeatlas/providers` owns the strict TypeScript request, event, descriptor, and complete-stream schemas. Native output remains Provider Facts and is not Canonical IR until the TypeScript Runtime validates, canonicalizes, merges, and stores it. The Rust analyzer owns no SQLite connection and cannot publish Canonical Knowledge.

Protocol version 1 and IR schema version 1 are the only accepted values in P0-W3-001. The schemas are implemented in `packages/providers/src/native-ipc.ts`; the executable Fixture index is `fixtures/ipc/schema-v1/cases.json`, and `packages/providers/test/native-ipc.test.mjs` is a mandatory root-test input. Byte framing, process lifecycle, and cross-language byte fixtures remain P0-W3-002 through P0-W3-004.

## Transport

One JSON object per UTF-8 line. TypeScript writes requests to stdin; Rust writes protocol events only to stdout and logs only to stderr. No shell. The client enforces maximum line/event/count/total-byte limits, backpressure, timeout, cancellation, and process termination.

Transport enforcement is specified here but is not implemented by P0-W3-001. The complete-stream schema validates already-decoded objects; it does not claim JSONL byte decoding, process execution, timeout enforcement, or database application.

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

This validator intentionally does not compute or verify integrity checksums. It preserves the declared fingerprint/checksum in the terminal payload; byte-stream checksum computation and process corruption handling belong to P0-W3-002 through P0-W3-004.

## Error model

Errors include incompatible protocol/IR, invalid request, unsupported language/capability, source changed during analysis, resource/budget exceeded, cancelled, internal analyzer failure, protocol corruption, and base mismatch. Diagnostics may be non-fatal; only the terminal event determines stream success.

Errors use a closed code enum, an exact non-blank message of at most 128 characters, and an explicit retryable flag. Unknown codes are rejected.

## Shared fixtures

Both implementations consume byte-identical describe, analyze, refresh modify/delete, partial coverage, invalid event, malformed JSON, out-of-order, oversize, cancellation, incompatible version, and premature EOF fixtures.

P0-W3-001 contributes the TypeScript object-schema Fixture for the request/event matrix, version and limit declarations, complete-stream ordering/terminal/count/context rules, and cancellation. It does not claim the byte-identical TypeScript/Rust fixture gate assigned to P0-W3-002.

