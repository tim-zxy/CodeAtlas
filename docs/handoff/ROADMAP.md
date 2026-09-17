# Roadmap

## Maturity labels

| Phase | Maturity | Meaning |
|---|---|---|
| 0 | IMPLEMENTATION-READY | Tasks, contracts, fixtures, and exit gates are defined. |
| 0.5 | IMPLEMENTATION-READY | The code-intelligence proof path is directly implementable. |
| 1 | DESIGN-READY | Scope, models, boundaries, and acceptance are defined; expand the work breakdown after Phase 0.5. |
| 2 | ARCHITECTURE-READY | Capability boundary and invariants are defined; detailed design follows evidence from Phase 1. |
| 3 | ROADMAP/ARCHITECTURE-READY | Direction and architectural guardrails are defined; implementation details are deliberately deferred to measured needs. |

There is no Phase 4 in this roadmap.

## Phase 0 Engineering foundation

Deliver the monorepo, TypeScript runtime skeleton, CLI/MCP shells, canonical IR package, repository/workspace SQLite migrations, provider and plugin contracts, native IPC handshake, fixture registry, comparator, metrics engine, and dependency guardrails. Phase 0 does not need to parse Java.

## Phase 0.5 Trusted code intelligence

Prove `Source -> Native Analyzer -> Canonical Facts -> SQLite -> Incremental Patch -> Evaluation -> Understand/Trace` for Java. Include symbols, imports, direct calls, inheritance, references, unresolved targets, coverage, provider bindings, full-index safety, incremental correctness, CLI understand, and code-level trace. Do not represent code trace as `BusinessFlow`.

The Java implementation uses a language-neutral NativeProvider with a narrow internal `LanguageAnalyzer` boundary, file-level refresh, protocol-only stdout, staging/batch apply, and stage/memory measurements. These constrain existing tasks rather than adding another language or a new numeric gate.

## Phase 1 Core product proof

Add Java/Spring, Mongo, Kafka, FastAPI semantics; `ExecutionGraph`; `RuntimeFlow`; contract registry and basic cross-repository stitching; Markdown/ADR document IR; components, capabilities, integrations, and grounded business flows; repository/workspace/cross-repository knowledge workflows; manual knowledge update; FTS5; LLM runtime with local/OpenAI-compatible structured output; six core MCP tools; security baseline; packaging and install flow.

Provide the standard Wiki through a KnowledgeQuery/Application read boundary. If a WikiGenerator exists when this phase is implemented, retain it behind a thin projection facade/default-profile adapter; none exists yet. A complete user-authored Declarative WikiSpec is not required. Framework semantics remain Plugin-owned. Additional analyzer languages are optional and require their own Fixture/Evaluation evidence, not an all-language Phase 1 gate.

## Phase 2 Knowledge flywheel and agent enhancement

Add architecture rules, decisions, migrations, current/target/transition reasoning, architecture drift, advanced reconciliation, curated claims and resolution rules, embeddings and Zvec, hybrid retrieval, impact and change context, usage and feedback, richer document sources, daemon/local HTTP, and expanded security and permissions.

Add declarative WikiSpec, profile inheritance and version pinning, projection validation and diff. Refine multi-language concurrency and capability-aware analysis depth from measured baselines; no unsupported latency target is frozen here.

## Phase 3 Advanced intelligence and scale

Evaluate and selectively add SCIP/Joern, CFG/PDG, advanced data flow and taint, polymorphism improvements, adaptive provider/model/retrieval routing, task-aware session context, a single-executable option, third-party plugin ecosystem and sandboxing, and more automated knowledge policies. Decisions must be driven by Phase 1/2 evaluation data.

Wiki section/data extensions and their SDK belong here. `FAST`, `BALANCED`, and `PRECISE` are prospective analysis-depth profiles, not Phase 0/0.5 requirements or alternate Canonical IRs.

## Promotion rule

A phase advances only when every mandatory acceptance gate in `PHASE_ACCEPTANCE.md` passes, evidence is recorded, `CURRENT_STATUS.md` is updated, and any architecture changes are captured through ADRs and traceability updates.
