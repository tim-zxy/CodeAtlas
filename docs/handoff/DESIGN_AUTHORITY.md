# Design Authority

## Precedence

Memory-stability written amendment accepted (2026-10-02): the user's “确认” accepts the [written high-water/range policy](../superpowers/specs/2026-10-02-p05-w3-020-memory-profile-stability-proposal.md), superseding the maximum-only reservation-selection detail for future profiles. Existing frozen contracts and historical profiles remain unchanged. This accepts the formula/reporting contract, not a concrete numerical reservation or implementation. The [native plan](../superpowers/plans/2026-10-02-p05-w3-020-memory-profile-stability.md) awaits review, and separate exact numeric approval plus fresh gates remain mandatory. This supersedes the earlier policy-proposed language below; corrected-build admission is still unavailable.

Measurement-stability direction approved (2026-10-02): the user authorized alternative2's detailed design. The [written detail](../superpowers/specs/2026-10-02-p05-w3-020-memory-profile-stability-proposal.md) proposes exact-identity high water plus observed within-group range and prior-approval floor. This is an evidence-backed EVOLVABLE admission-policy proposal, not an accepted formula, new numeric approval, FROZEN amendment or implementation authority. Until written review and subsequent numeric review, the existing policy remains authoritative and the corrected build remains unadmitted. No phase/IPC/IR/SQLite/security decision changes.

Packet B admission quality hold (2026-10-02): fresh corpus evidence invalidated the newly approved212,692,992-byte profile for corrected build `86fa33c51ecf63383f3575877bedaf66c47661dee5222ea4e14e8a0dd74e5888`; that entry was withdrawn. Existing exact profiles, frozen contracts and fresh peak gate remain intact. The [measurement-stability proposal](../superpowers/specs/2026-10-02-p05-w3-020-memory-profile-stability-proposal.md) is not accepted and selects no new numeric margin/threshold. Completion and publication are held, not bypassed by a repeated green sample.

Packet B Tasks 1–7 now locally implement accepted ADR-016's R010/full-only v3 path. Actual DESCRIBE publishes [1,2,3] only after real bootstrap gates; no incremental capability or successful REFRESH is published. Native CI uses the reviewed exact Windows/x64 Node 24.15.0 profile; other environments still refuse v3 Runtime bootstrap until measured/reviewed. Existing v1/v2, Canonical IR, application publication and phase/deferred boundaries remain unchanged. See CURRENT_STATUS for gate evidence and outstanding final review/publication status.

When documents disagree, use this order:

1. Accepted ADRs and amendments
2. `DESIGN_AUTHORITY.md`
3. Normative files in `specs/` and `../specs/` (the latter only for their named extension topics)
4. `ARCHITECTURE.md` and `PRODUCT_VISION.md`
5. `PHASE_ACCEPTANCE.md`
6. `ROADMAP.md` and `WORK_BREAKDOWN.md`
7. `CURRENT_STATUS.md`

Later dates do not override higher authority unless an ADR explicitly amends the decision.

## FROZEN decisions

An Engineering Agent must not silently change any item below. A change requires an accepted ADR or Design Change Proposal plus synchronized updates to architecture, specs, acceptance, traceability, migrations, and fixtures where applicable:

- local-first operation and no required cloud service;
- provider-independent Canonical IR;
- SQLite as canonical storage and vectors as rebuildable derived indexes;
- provider-specific and framework-specific semantics normalized below canonical contracts;
- automatic code/contract/`ExecutionGraph`/`RuntimeFlow` updates and manual semantic-knowledge publication;
- `ExecutionGraph -> RuntimeFlow -> BusinessFlow` naming and responsibility split;
- evidence, claim, candidate, and published knowledge separation;
- stable opaque knowledge identity and explicit uncertainty;
- LLM candidate generation without direct database mutation;
- application/API/service layering and domain-owned mutation;
- Rust analyzer has no SQLite ownership;
- evaluation and fixtures are implementation infrastructure;
- no automatic remote fallback when local-only or security-blocked.
- Wiki is a published-Knowledge projection, never a canonical writer; projection-only changes cannot initiate semantic compilation (ADR-013).
- NativeProvider remains language-neutral, framework semantics remain Plugin-owned, and Rust cannot activate SQLite state (ADR-014).
- Native IPC v1 strict payloads remain compatible; ADR-015 adds a separately negotiated v2 `ANALYZE` coverage payload without changing IR schema v1, ProviderSnapshot v1, or Rust's storage authority.

On 2026-09-30 the user accepted [ADR-016](adr/ADR-016-native-refresh-derived-analysis-state.md): negotiated v3 ANALYZE/REFRESH and TypeScript-owned derived summaries, additive R010 reservation, unchanged initial hard caps and same-WORKTREE applicability. Existing strict v1/v2, IR v1, ProviderSnapshot v1 and no-Rust-SQLite decisions stay FROZEN. Architecture acceptance is not implementation evidence or approval to skip detailed packet/plan review.

## EVOLVABLE decisions

An Engineering Agent may tune these only when Fixture or Evaluation evidence supports the change. The Agent must record the evidence and update the controlling design document, evaluation baseline, acceptance criteria, and traceability; material contract changes also require an ADR:

- identity signal weights and ambiguity margins;
- FactMerger scoring and confidence aggregation;
- `RuntimeFlow` compression rules;
- knowledge projection and probe-generation policies;
- redaction patterns beyond mandatory defaults;
- provider capability routing and performance thresholds;
- semantic-task decomposition and retry counts within security/budget bounds;
- hybrid ranking weights after Phase 2 begins.
- Wiki profile layout, optional sections, and projection validation thresholds within the versioned contract, based on projection Fixtures and review.
- analyzer worker count, cache budget, performance thresholds, and language capability maturity, based on reproducible benchmarks and Evaluation.

Task 6 EVOLVABLE internal token refinement (2026-10-02) is recorded in ADR-016 and the accepted packet B design: a safe repository committed-snapshot count detects same-fingerprint legacy activation with absent derived state. Actual legacy Fixture RED→GREEN justifies the change; no wire/Canonical/migration/FROZEN contract changes. The initial Task 6 profile was approved and passed focused bootstrap gates. A subsequent write-lock Fixture exposed missing Store classification checks; the repair enforces the already required complete source-inventory recheck, without changing design or migration contracts. Runtime/Store remains provisional; the repaired exact Node build requires renewed reviewed calibration and is not admitted by the older profile. This is not completion or a new phase threshold.

## DEFERRED decisions

Task 6 repaired-build profile approval (2026-10-02): the user approved 247,508,992 bytes plus twice retained SQL bytes for exact build `87b74e5e9050757eb30ebae478919fada586ece8299cf98588a79a17b28e7e63`. The paired unchanged raw reports and Windows environment/corpus identities are recorded in CURRENT_STATUS. This supersedes the pending-calibration wording above for this exact build only; all existing profiles remain intact and other builds/platforms refuse. No new phase threshold or FROZEN decision is changed.

These are intentionally postponed to the assigned phase. They must not become dependencies, acceptance gates, or implementation scope in Phase 0, Phase 0.5, or Phase 1 without an approved roadmap and design amendment:

- Joern deep integration and CFG/PDG persistence;
- managed local LLM downloads;
- adaptive model/provider/retrieval routing;
- third-party plugin sandbox design;
- task session memory;
- enterprise ACLs and remote runtime;
- single-executable implementation;
- fully automatic knowledge publication.
- user-authored Declarative WikiSpec, profile inheritance/pinning, validation, and diff until Phase 2; the Phase 1 standard profile is not blocked.
- custom Wiki section/data extensions and SDK until Phase 3; adaptive analysis-depth profiles remain phase-gated by evidence.

## Engineering Agent authority

The Engineering Agent shall implement the current phase, run its fixtures, update status, record design issues, refine future phases when evidence warrants it, and preserve traceability. Codex, Claude Code, OpenCode, and other Coding Agents have identical authority under this pack. No Agent may silently redefine Canonical IR, lifecycle semantics, update policy, trust boundaries, or phase scope.

The 2026-09-24 Phase 0.5 compatibility amendment interprets future System Wiki sections within ADR-013's published-Knowledge-only reader. Source-grounded knowledge degradation remains candidate-only and permissioned; Diagram and Agent Context remain derived views. No new FROZEN decision is substituted for ADR-013/014, no Phase 0 gate is reopened, and the original Phase 0.5 exit gates remain authoritative alongside additive resource/outcome consistency checks. See the dated [Design Amendment Report](DESIGN_AMENDMENT_REPORT_2026-09-24.md) for implementation-state evidence and phase allocation.

The user accepted the [P05-W1-011 cross-revision Design Change Proposal](../superpowers/specs/2026-09-30-p05-w1-011-cross-revision-design-change-proposal.md) on 2026-09-30. Phase 0.5 patch activation is limited to a single mutable `WORKTREE` revision ID; a different ID or immutable target requests full analysis without changing the active graph. This preserves immutable Evidence and Provider-independent Canonical IR; broader carry-forward needs a separate reviewed design. Existing Phase 0.5 quantitative gates are unchanged.

## Design Change Proposal minimum content

A proposal must state the decision being changed, its current authority class, evidence, alternatives, compatibility impact, migration impact, security impact, affected phases, affected documents, required fixture/baseline changes, and rollback strategy. Implementation begins only after the proposal is accepted.
