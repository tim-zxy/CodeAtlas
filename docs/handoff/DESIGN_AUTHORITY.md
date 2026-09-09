# Design Authority

## Precedence

When documents disagree, use this order:

1. Accepted ADRs and amendments
2. `DESIGN_AUTHORITY.md`
3. Normative files in `specs/`
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

## DEFERRED decisions

These are intentionally postponed to the assigned phase. They must not become dependencies, acceptance gates, or implementation scope in Phase 0, Phase 0.5, or Phase 1 without an approved roadmap and design amendment:

- Joern deep integration and CFG/PDG persistence;
- managed local LLM downloads;
- adaptive model/provider/retrieval routing;
- third-party plugin sandbox design;
- task session memory;
- enterprise ACLs and remote runtime;
- single-executable implementation;
- fully automatic knowledge publication.

## Engineering Agent authority

The Engineering Agent shall implement the current phase, run its fixtures, update status, record design issues, refine future phases when evidence warrants it, and preserve traceability. Codex, Claude Code, OpenCode, and other Coding Agents have identical authority under this pack. No Agent may silently redefine Canonical IR, lifecycle semantics, update policy, trust boundaries, or phase scope.

## Design Change Proposal minimum content

A proposal must state the decision being changed, its current authority class, evidence, alternatives, compatibility impact, migration impact, security impact, affected phases, affected documents, required fixture/baseline changes, and rollback strategy. Implementation begins only after the proposal is accepted.
