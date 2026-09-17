# Engineering Agent Handoff

## Mission

Continue the approved design without depending on the original ChatGPT conversation. Implement Phase 0 and Phase 0.5 from the task-level specifications, expand and implement Phase 1 within the existing design, and refine Phase 2 and Phase 3 only within the frozen architecture and with evidence from completed phases.

This handoff is agent-neutral. Codex, Claude Code, OpenCode, or another Implementation Agent must reach the same architectural interpretation, phase boundary, and acceptance standard from this repository alone.

## Mandatory reading before code changes

1. This file and the repository root `../../README.md`.
2. `CURRENT_STATUS.md` to determine the active phase and next unblocked task.
3. `DESIGN_AUTHORITY.md` to classify decisions as FROZEN, EVOLVABLE, or DEFERRED.
4. `IMPLEMENTATION_PROTOCOL.md` for task execution and evidence rules.
5. The active phase sections in `WORK_BREAKDOWN.md` and `PHASE_ACCEPTANCE.md`.
6. Every ADR and spec referenced by the selected task or traceability row, including topic extensions in `../specs/` when relevant.

The Agent must not modify code until this reading is complete and task predecessors are verified.

## Non negotiable model

```text
Provider fact != Canonical fact
Canonical code fact != Knowledge
ExecutionGraph != RuntimeFlow
RuntimeFlow != BusinessFlow
Candidate != published KnowledgeRevision
Vector index != canonical storage
SourceFreshness != CompilationCurrency
```

## Phase contract

- Phase 0 is implementation-ready: build contracts, storage, IPC, fixtures, dependency enforcement, and runtime skeleton. Java parsing is not an exit requirement.
- Phase 0.5 is implementation-ready: prove trustworthy and incremental Java code intelligence and code-level queries. Do not introduce framework or semantic-knowledge scope.
- Phase 1 is design-ready: after Phase 0.5 acceptance, the Engineering Agent creates a reviewed task breakdown from existing specs and acceptance, then implements it without redesigning the product.
- Phase 2 is architecture-ready: detail it using Phase 1 evidence while preserving frozen decisions.
- Phase 3 is roadmap/architecture-ready: invest only where Phase 1/2 evaluation demonstrates utility.
- No Phase 4 exists unless it is formally designed and approved through the governance process.

## Governance

- FROZEN: do not change silently. Submit an ADR or Design Change Proposal, document compatibility/migration impact, and synchronize all affected authorities before implementation.
- EVOLVABLE: iterate only from Fixture or Evaluation evidence; record the result and update the controlling spec, baseline, acceptance, and traceability.
- DEFERRED: design in the assigned phase. Do not introduce it into Phase 0, Phase 0.5, or Phase 1 scope.

## Escalation triggers

Stop and propose a design change when work appears to require a breaking Canonical IR change, weakening local-first/security defaults, changing AUTO/MANUAL semantics, changing the flow hierarchy, allowing direct LLM knowledge writes, merging repository/workspace truth stores, or making a deferred capability an earlier-phase dependency.

## Completion standard

Unit tests alone do not complete a task or phase. Completion requires the declared fixtures and quantitative gates, demonstrated failure/recovery behavior, synchronized documentation, an updated `CURRENT_STATUS.md`, and fresh reproducible evidence.
