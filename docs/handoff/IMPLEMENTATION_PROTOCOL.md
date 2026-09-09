# Implementation Protocol

## Starting a task

1. Read `CURRENT_STATUS.md`, the task entry, its referenced specs, ADRs, and acceptance gates.
2. Confirm predecessors are complete and the task belongs to the active phase.
3. Write or select the fixture that proves the behavior before implementation.
4. Implement the smallest contract-complete change without deferred features.
5. Run unit, contract, fixture, architecture-boundary, and relevant integration checks.
6. Update specs when implementation clarifies behavior; use an ADR for frozen decisions.
7. Update `CURRENT_STATUS.md` with evidence and the next task.

## Definition of done for every task

- implementation and tests are complete;
- relevant fixtures pass;
- no architecture dependency rule is violated;
- public schemas and errors are validated at boundaries;
- documentation reflects behavior changes;
- `CURRENT_STATUS.md` records evidence;
- no unrelated or deferred capability was introduced;
- changes to canonical contracts have an ADR or compatible schema amendment.

## Phase protocol

Phase 0 and 0.5 follow `WORK_BREAKDOWN.md` directly. After Phase 0.5 acceptance, the Engineering Agent expands Phase 1 into task-sized work items using the Phase 1 specs, end-to-end fixtures, and acceptance gates, then obtains design review before implementation. Phase 2 and Phase 3 are refined only after the preceding phase produces measurement evidence.

## Change control

- FROZEN: open an ADR or Design Change Proposal, state compatibility, migration, security, and phase impact, update all affected documents, and do not implement until accepted.
- EVOLVABLE: change behind tests and Fixtures, update baselines deliberately, record the Evaluation evidence, and synchronize the controlling design documents.
- DEFERRED: keep out of Phase 0, Phase 0.5, and Phase 1 scope; document evidence that may trigger design in the assigned phase.

## Safety rules

- Never delete the last good graph or knowledge revision before replacement validation.
- Never log raw secrets, full prompts, or unrestricted environment variables.
- Never pass a shell to native providers or inherit the full process environment.
- Never silently turn an unresolved or ambiguous relation into a resolved one.
- Never publish partial semantic output as complete knowledge.

## Evidence record

For each completed task record: task ID, commit/revision, commands run, fixture IDs, pass counts, schema or migration version changes, known limitations, and the next unblocked task.
