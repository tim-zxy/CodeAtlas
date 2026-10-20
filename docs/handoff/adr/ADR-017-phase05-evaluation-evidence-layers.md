# ADR 017 Phase 0.5 Evaluation Evidence Layers

Status: Accepted on 2026-10-15 by the user's “批准，继续执行” after the remaining-work
and approval-boundary explanation. This accepts this ADR and its written design;
the subsequent user “确认” approves the revised existing implementation plan.
No report implementation, numerical reservation or gate passage follows.

## Context and authority

The accepted closeout report v1 requires a positive Native worker count and all
three resource-closure flags for every case. The original
`canonical-normalization` and `two-provider-same-call` Fixtures instead consume
recorded Provider input. They have no executable source corpus or Native process.
The original `metadata-only-source-change` producer recipe changes identical
`Caller.java` from SOURCE to TEST; the public Source classifier derives role from
path and exposes only include/exclude configuration. A public Git scan cannot
produce that transition without a different product contract.

The read-only `task5-scope-conflict-audit.mjs` and its
`task5-scope-conflict-audit-unsandboxed.log` in the existing closeout workspace
reproduce both mismatches and v1's rejection of null expected workers. Existing
SQL replay/process probes do not remove them. Current actual report remains FAIL.

This is a material change to the internal Evaluation report contract, not an
amendment of Canonical IR, ProviderSnapshot, Native IPC or SQLite schemas.
ADR-010/012/014/016 and original Phase 0.5 Exit Criteria remain authoritative.
Authority class: EVOLVABLE internal Evaluation interface under ADR-012; because
the report contract changes materially, this ADR records explicit written
acceptance. No FROZEN decision is reclassified or superseded.

## Decision

Adopt the [versioned detailed design](../../superpowers/specs/2026-10-15-p05-evaluation-evidence-layers-design.md).
Keep every one of the 31 required cases per repetition. Derive applicability from
a fixed reviewed case policy, never a caller-supplied exemption:

- 28 `NATIVE_INDEX` cases use the actual public Git/Native index entry.
- 2 `RECORDED_PROVIDER_SQLITE` cases require both their original Provider contracts
  and physical Application/Store publication/support-lifetime checks. They report
  no Native worker/child observations and contribute no parser-accuracy sample.
- 1 `DECLARED_SOURCE_NATIVE` metadata case uses independently declared Source IR
  through the qualified component/replay path, real Native streams and
  Application/Store. It is not public Git classification functionality.

Introduce report schema v2 explicitly; preserve v1 validators, reports and
historical failures unchanged. Separate acceptance status from Native outcome.
Expected PARTIAL cases pass only on validated partial completion, nonpublication,
exact retained publication state and closure before any Evaluation restoration.

Both component and real-index obligations remain mandatory for overall PASS.
Keep 95/95/90/100/0 gates, original accuracy scopes, all declared incremental
cases, two actual worker/order trials, D5/full22 and four-purpose qualification.
No resource number or production Source override is approved by this decision.

## Alternatives

1. Keep one uniform Native obligation: cannot truthfully qualify the recorded
   fixtures; retain FAIL rather than manufacture worker/closure observations.
2. Add production multi-Provider injection and Source role overrides: expands
   product/security contracts merely to fit component fixtures; rejected here.
3. Explicit fixed evidence layers: recommended; changes the report, not the
   production authority boundaries or original required behavior.

## Compatibility, security and migration

V2 has explicit dispatch and new identity/corpus binding; v1 is not automatically
upgraded or retagged. Fixture Manifest v1 and all original eight pinned fixture
packs remain byte-unchanged. There is no database migration or production API
change. SQL remains Storage-owned, publication Application-owned and Rust has no
SQLite authority. No arbitrary applicability mask, dynamic plugin registry,
environment bypass, new transport cap or remote fallback is introduced.

## Affected scope and rollback

On acceptance, amend the existing closeout Tasks4/5 interfaces and Task6 tests/
registration, preserving Task7/8 order and the existing D5 plan. Synchronize
Evaluation, closeout design/plan, Phase Acceptance interpretation, Design
Authority, Traceability and Current Status. Roadmap counts, milestones and
Deferred Decisions do not change. Production-path changes still require final
identity freeze, independent measurement and separate exact numeric approval.

Rollback disables v2 execution and leaves v1's conservative FAIL behavior in place.
Never rewrite a historical report, weaken a gate, delete good canonical state or
reuse an old-build profile. This record is not implementation or phase acceptance.
