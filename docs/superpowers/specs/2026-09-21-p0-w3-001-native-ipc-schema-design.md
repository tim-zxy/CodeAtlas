# P0-W3-001 Native IPC Schema v1 Design

Status: implementation design for the existing Phase 0 task. This makes the accepted Native IPC concepts executable without changing ADR-010, ADR-014, Canonical IR, or ProviderSnapshot v1.

## Scope and ownership

`@codeatlas/providers` owns strict TypeScript/Zod wire schemas for Native IPC v1 because it is the Provider boundary and may depend on `@codeatlas/ir`. The IR package remains protocol-agnostic. This task validates in-memory JSON values and complete event arrays only; it does not decode JSONL bytes, spawn Rust, implement a Provider SPI, write SQLite, or apply facts.

## Requests and negotiation

Every request has exact `protocolVersion: 1`, bounded `requestId`, a closed type, and a strict payload:

- `DESCRIBE` advertises the client's supported protocol and IR schema versions;
- `ANALYZE` selects IR v1 and carries a Provider snapshot ID, Repository, Revision, normalized SourceFile scope, requested capability names, optional deadline, and explicit resource budget;
- `REFRESH` additionally carries the active base revision/fingerprint, target Revision, and normalized added/modified/deleted file changes;
- `CANCEL` names the target request ID.

Descriptor output is language-neutral. It includes Provider/runtime versions, supported protocol/IR versions, global capabilities, per-language grammar/analyzer/compatibility versions and capabilities, analyzer-advertised line/event/total-byte limits, and bounded build metadata. Version arrays and capability/language names must be non-empty and unique. No Java identifier or maturity claim is embedded.

## Events and payload reuse

Wire events use strict envelopes with protocol version, request ID, non-negative sequence, closed event type, and typed payload. Existing IR schemas are reused for SourceFile, ProviderNode, ProviderEdge, diagnostics, capability coverage, IDs, paths, revisions, and fingerprints. IPC never accepts CanonicalNode/CanonicalEdge as Provider output.

`ANALYZE` emits `ANALYSIS_STARTED`, `SOURCE_FILE`, `NODE`, `EDGE`, `COVERAGE`, `DIAGNOSTIC`, then exactly one `ANALYSIS_COMPLETED | ANALYSIS_FAILED`. `REFRESH` uses `REFRESH_STARTED`, source/coverage/diagnostic events and `UPSERT_NODE`, `REMOVE_NODE`, `UPSERT_EDGE`, `REMOVE_EDGE`, then exactly one `REFRESH_COMPLETED | REFRESH_FAILED`. `DESCRIBE_COMPLETED`, `CANCEL_ACCEPTED`, and `REQUEST_FAILED` cover the remaining request terminals.

Completed events carry actual counts, content fingerprint, coverage summary where applicable, outcome, and an opaque integrity checksum. Failure events carry a closed safe error code, bounded message, and retryability; they contain no stack, source text, or arbitrary details.

## Complete-stream validation

The pure `NativeEventStreamSchema` verifies request and event schemas together:

- sequence begins at zero and is contiguous;
- every event request ID matches the request;
- event types are legal for that request;
- analysis/refresh starts first;
- exactly one terminal event is last;
- snapshot/repository/revision/fingerprint context remains consistent;
- terminal counts match emitted events;
- the request budget bounds event count;
- cancellation acknowledgement matches its target.

Integrity-checksum calculation, byte/UTF-8/line decoding, timeouts, process termination, backpressure, stderr handling, and post-terminal byte detection belong to P0-W3-002/P0-W3-004. The schema preserves these future checks without pretending to perform them.

## Fixture and deferred boundary

`p0-native-ipc-schema-v1` covers the four request variants, every event variant, strict rejection, version/limit declarations, ordering, terminal semantics, count/context integrity, and cancellation. P0-W3-002 will add byte-identical TypeScript/Rust JSONL fixtures. P0-W3-003 will implement Rust `DESCRIBE`; P0-W3-004 will implement the process client. Java parsing, LanguageAnalyzer, refresh execution, storage activation, and framework meaning remain later tasks.
