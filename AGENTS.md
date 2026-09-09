# Engineering Agent Instructions

This repository uses an agent-neutral Engineering Handoff Pack. These instructions apply to Codex, Claude Code, OpenCode, and any other Coding Agent or Implementation Agent working in this repository.

## Required reading before modifying code

Read these documents in order before making any code, schema, configuration, fixture, or build change:

1. `docs/ENGINEERING_HANDOFF.md`
2. `docs/CURRENT_STATUS.md`
3. `docs/DESIGN_AUTHORITY.md`
4. `docs/IMPLEMENTATION_PROTOCOL.md`
5. `docs/ROADMAP.md`
6. The active phase sections in `docs/WORK_BREAKDOWN.md` and `docs/PHASE_ACCEPTANCE.md`
7. Every relevant ADR under `docs/adr/`
8. Every relevant specification under `docs/specs/`
9. `docs/DESIGN_TRACEABILITY.md`

Do not rely on the original ChatGPT discussion or any unavailable conversation history. The repository documents are the implementation authority.

## Design governance

- FROZEN decisions must not be changed silently. Submit an ADR or Design Change Proposal and update all affected specs, acceptance gates, traceability, migrations, and fixtures before implementation.
- EVOLVABLE decisions may change only when Fixture or Evaluation results justify the change. Record the evidence and synchronize the controlling design documents and baselines.
- DEFERRED decisions are designed in their assigned phase. Do not introduce them as dependencies or scope in Phase 0, Phase 0.5, or Phase 1.

## Required invariants

- Preserve provider-independent Canonical IR.
- Keep SQLite authoritative and vector indexes derived and rebuildable.
- Keep LLM output candidate-only; only validated application workflows may publish canonical knowledge.
- Preserve AUTO updates for source/code/contract/ExecutionGraph/RuntimeFlow facts and MANUAL publication for semantic claims, Capability, BusinessFlow, architecture knowledge, and wiki projections.
- Use `ExecutionGraph -> RuntimeFlow -> BusinessFlow`; do not restore the retired flow identifier as a formal core model.
- Do not add a Phase 4 without a formally approved design.

## Task completion

Writing the code is not, by itself, completion. A task is complete only when all of the following are true:

- implementation is complete;
- unit tests pass;
- the corresponding Fixtures pass;
- all applicable Quality Gates are satisfied;
- no Architecture Guardrail is violated;
- no DEFERRED capability has been introduced early or without approval;
- all related documentation remains consistent with the implementation and design authorities;
- `CURRENT_STATUS.md` has been updated with fresh reproducible evidence; and
- when the design changes, every affected ADR, specification, acceptance gate, Fixture or baseline, and traceability record has been synchronized.

Follow `IMPLEMENTATION_PROTOCOL.md`. Run the declared tests, Fixtures, Evaluation gates, failure/recovery checks, and architecture checks. A task is not complete without fresh reproducible evidence and traceability updates for changed contracts.

When an implementation result conflicts with the design, do not make the task pass by deleting or weakening tests, lowering a Quality Gate, bypassing Canonical IR, bypassing Evidence, or mutating the database directly outside the validated application workflow. First determine whether the failure is caused by the implementation, the Fixture, or an incorrect design assumption. Correct implementation and Fixture defects at their source. If evidence shows that a design assumption is wrong, use the governed, evidence-driven design-change process and synchronize every affected ADR, specification, acceptance gate, Fixture or baseline, migration, and traceability record before treating the task as complete.
