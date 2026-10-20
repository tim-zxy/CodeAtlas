# ADR 018 Native Evaluation Diagnostic Observation

2026-10-15 subsequent approval: user “继续” accepts proposed design §9 and the
revised existing Task5 plan. Implement the honest existing FULL multiplicity and
scoped diagnostic lifetime with required compatibility tests; no resource value,
profile installation, remote action or phase completion follows. This supersedes
the prior rollout/count-review hold below.

Status: Accepted2026-10-15, including design §9 correction and revised Task5 plan
by the subsequent explicit “继续”. Local implementation/qualification is in
progress; earlier approval alone did not approve later artifacts by implication.
No profile, resource value, phase acceptance or remote action is authorized.

## Context and authority

ADR-014/017 and original Phase0.5 acceptance require actual worker variation and
changed-only parsing. Normal Rust supplies no-op callbacks where internal tests
observe parse entry and completion. Sorted wire output/Source delivery counts do
not provide these missing observations. The existing Task5 plan requires a
focused proposal rather than fabricated worker proof.

ADR-010, Native IPC and Security reserve stdout for versioned protocol data and
stderr for bounded diagnostics, not a second authoritative protocol. This
material Evaluation-only observation contract needs explicit review of that
distinction. It does not reclassify or silently supersede a FROZEN decision.

## Decision

Accept the [bounded observation design](../../superpowers/specs/2026-10-15-p05-native-parse-observation-design.md):
private v3-only hashed diagnostic records at real parser entry/settlement,
request-owned bounded writer, private Evaluation observation of the original
stderr consumer and owned original-input/child/receipt binding. Reuse real
coordinator slots; no scheduler/order flag or new public configuration.

Only development Evaluation may interpret these diagnostics for its declared
quality checks. Production Provider decoding, resource admission, facts,
Canonical Evidence, publication and knowledge never obtain authority from them.
Valid stdout/terminal/exit, Source, graph/support/coverage/R010 and ownership
remain separately necessary. Missing/corrupt diagnostics keep quality evidence
unavailable; they do not manufacture a success or erase the original error.

## Alternatives

Test-only executables/component worker observations need an additional explicit
ADR-017 applicability/acceptance amendment and cannot silently replace actual
public worker cases. Deferring observation safely retains FAIL/NOT_RUN and blocks
phase exit. The proposed diagnostic direction preserves those actual cases.

## Compatibility, security and migration

No v1/v2 or stdout-v3 field/checksum change, Canonical/ProviderSnapshot schema,
Source override, database migration, Rust SQLite write, new environment key or
remote transfer. V3 stderr gains only bounded hashed metadata; no source/path/
request-ID text or secret. Keep original limits and sanitized default errors.
The main-held StderrLock must not be acquired from parser threads; the detailed
design uses the existing explicit writer with request-owned short locking.

This is EVOLVABLE internal Evaluation/diagnostic behavior under ADR-012/014,
with a material-interface ADR. If review finds a FROZEN conflict, resolve it by an
explicit accepted amendment before implementation; this proposal is not an
exception to the current IPC/security authorities.

Planning discrepancy: current relation FULL has two real parse passes, unlike the
original design's once-per-input assertion. Accepted design §9 and the revised
plan preserve both passes; do not suppress the second pass or silently
rework the parser. This correction changes no original numerical gate,
wire field or resource reservation. The existing timed worker owner also needs
explicit scoped settlement for a borrowed diagnostic writer; timeout compatibility
is mandatory, not permission to change scheduling/deadline policy.

## Phases, evidence and rollback

Keep31 required cases,21 incremental cases, original gates, D5/full22 and four
purposes. Add reviewed diagnostic vectors/real lifecycle/worker checks without
changing original fixture pins. Synchronize Native IPC, Security, scalability,
Evaluation, Design Authority, Phase Acceptance, Traceability and Current Status.
No new roadmap task/phase or earlier deferred capability.

Review the written spec/ADR and then the revised existing plan. Finish corrections
before final freeze/calibration/holdouts; exact numeric approval stays separate.
Rollback removes diagnostic qualification and keeps the phase held, retaining
old artifacts and the last valid graph. No old-profile reuse or report retagging.
