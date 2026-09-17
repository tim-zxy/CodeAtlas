# Agent Neutral Engineering Handoff Pack

This pack is the self-contained implementation authority for the local-first Engineering Intelligence and Knowledge Runtime. It is intended for any capable Engineering Agent or Coding Agent, including Codex, Claude Code, OpenCode, and comparable tools. No source-chat history is required.

## Required reading order

1. `docs/handoff/ENGINEERING_HANDOFF.md`
2. `docs/handoff/CURRENT_STATUS.md`
3. `docs/handoff/DESIGN_AUTHORITY.md`
4. `docs/handoff/IMPLEMENTATION_PROTOCOL.md`
5. `docs/handoff/ROADMAP.md`
6. The active phase in `docs/handoff/WORK_BREAKDOWN.md` and `docs/handoff/PHASE_ACCEPTANCE.md`
7. Relevant files under `docs/handoff/adr/`, `docs/handoff/specs/`, and topic extensions under `docs/specs/`
8. `docs/handoff/DESIGN_TRACEABILITY.md`

`docs/handoff/CODEX_HANDOFF.md` remains only as a compatibility entry for environments that expect that filename.

The 2026-09-17 backward-compatible design extension is recorded in `docs/handoff/DESIGN_AMENDMENT_REPORT.md`; it adds Wiki projection and Native Analyzer scalability design without changing the active Phase 0 task order.

The formal roadmap contains Phase 0, Phase 0.5, Phase 1, Phase 2, and Phase 3. It intentionally contains no Phase 4.

The canonical flow naming is `ExecutionGraph -> RuntimeFlow -> BusinessFlow`.

## Long term repository use

Keep `docs/handoff/` versioned with the implementation repository. The root `AGENTS.md` points Engineering Agents there and establishes the mandatory read-before-change protocol. After every completed work item, update `docs/handoff/CURRENT_STATUS.md`; after every design change, update the affected specs, acceptance criteria, traceability, and ADR record together.
