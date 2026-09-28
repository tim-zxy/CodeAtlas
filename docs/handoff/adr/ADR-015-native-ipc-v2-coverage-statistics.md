# ADR 015 Versioned Native IPC Coverage Statistics

Status: Accepted on 2026-09-28 for P05-W3-003; implementation still requires a reviewed plan and task evidence.

## Decision

Native IPC v1 remains strict and readable. Add protocol v2 for `ANALYZE` with typed per-file/per-capability site statistics in `COVERAGE`; IR schema remains v1. The v1 `DESCRIBE` request remains the bootstrap and advertises support for both analysis protocol versions. Protocol-v2 `REFRESH` is not introduced by this decision. Do not add fields to ProviderSnapshot v1 or make Rust a Canonical SQLite writer.

## Authority and evidence

ADR-010's version-negotiated JSONL/storage boundary, ADR-014's Native outcome/coverage requirement, and the strict v1 Native IPC specification are FROZEN. P05-W3-003 requires eligible, covered, unsupported, partial, and resolution-level statistics. The merged P05-W3-002 implementation emits only categorical v1 coverage (`packages/providers/src/native-ipc.ts` and `crates/native-analyzer/src/analyze.rs`); a strict v1 consumer rejects added fields. Counting only emitted facts cannot measure recognized but un-emitted syntax sites. The existing Phase 0.5 gate calls for visible incomplete coverage without an invented numerical threshold.

## Alternatives

- Infer statistics from existing facts: compatible, but loses unsupported/partial recognized sites and can falsely imply complete coverage.
- Encode counts in diagnostic messages: avoids a schema change but makes validation, compatibility, and machine consumption unreliable.
- Version the coverage payload: preserves old clients while allowing strict cross-language validation. This is the accepted choice.

## Compatibility, migration, and rollback

Advertise protocol versions `[1, 2]` and IR schema `[1]`; old clients can continue to request v1 and receive unchanged v1 `ANALYZE` event shapes. v2 streams carry strict statistics and are rejected by v1 validators rather than silently coerced. A version-list expectation in the existing handshake golden requires explicit review; v1 framing and raw-byte corpus stay intact. There is no persisted schema, migration, Canonical IR, or ProviderSnapshot change. Before a future v2-only consumer exists, rollback can disable v2 advertisement/emission and continue v1; any consumer of v1 must show numeric statistics as unavailable, not zero. Protocol hard byte/event limits remain fixed, with typed failure on exhaustion.

## Security, phases, and required synchronization

No raw source, secrets, framework semantics, Knowledge writes, shell execution, or SQLite access is added to Rust. The new counts are source-derived bounded integers; the language-neutral boundary checks partition invariants, while Java Fixtures compare counts with emitted source facts. This belongs only to P05-W3-003 in Phase 0.5; later graph queries surface its warnings, and no later-phase feature is made a dependency.

Synchronize `docs/handoff/specs/NATIVE_IPC.md`, `PROVIDER_SPI.md`, `EVALUATION.md`, `PHASE_ACCEPTANCE.md`, `DESIGN_TRACEABILITY.md`, `CURRENT_STATUS.md`, the protocol/handshake Fixture baselines, and the P05-W3-003 design/plan. Fixture baselines change only with implementation and reviewed exact outputs, not at design acceptance. ADR-010 remains in force; this record adds a compatible version rather than replacing its storage boundary. If v2 fails validation or cannot fit the declared budget, retain v1 availability and the last valid graph; do not relax v1 schemas or publish a partial result.
