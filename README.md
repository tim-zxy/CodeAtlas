# Agent Neutral Engineering Handoff Pack

This pack is the self-contained implementation authority for the local-first Engineering Intelligence and Knowledge Runtime. It is intended for any capable Engineering Agent or Coding Agent, including Codex, Claude Code, OpenCode, and comparable tools. No source-chat history is required.

## Required reading order

1. `ENGINEERING_HANDOFF.md`
2. `CURRENT_STATUS.md`
3. `DESIGN_AUTHORITY.md`
4. `IMPLEMENTATION_PROTOCOL.md`
5. `ROADMAP.md`
6. The active phase in `WORK_BREAKDOWN.md` and `PHASE_ACCEPTANCE.md`
7. Relevant files under `adr/` and `specs/`
8. `DESIGN_TRACEABILITY.md`

`CODEX_HANDOFF.md` remains only as a compatibility entry for environments that expect that filename.

The formal roadmap contains Phase 0, Phase 0.5, Phase 1, Phase 2, and Phase 3. It intentionally contains no Phase 4.

The canonical flow naming is `ExecutionGraph -> RuntimeFlow -> BusinessFlow`.

## Long term repository use

Keep this directory versioned with the implementation repository. The root `AGENTS.md` points Engineering Agents here and establishes the mandatory read-before-change protocol. After every completed work item, update `CURRENT_STATUS.md`; after every design change, update the affected specs, acceptance criteria, traceability, and ADR record together.

