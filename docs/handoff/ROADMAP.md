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

Within those existing tasks, native scheduling obtains parse-worker mode from validated indexing configuration, bounds in-flight and pending results with backpressure, distinguishes timeout/parser/unsupported/syntax/empty-success outcomes, and proves worker-count consistency against pinned inputs. The benchmark suite retains cold, 1-, 5-, and 50-file scenarios plus a worker-consistency case. Numeric performance limits still require measured baselines; none is added here.

P05-W3-003 uses the ADR-015 negotiated Native IPC v2 `ANALYZE` coverage payload for per-file/capability source-site counts and resolution distribution. Strict v1 remains available and reports numeric statistics as unavailable. This does not add a persisted ProviderSnapshot schema, protocol-v2 `REFRESH`, a new numerical gate, or an earlier query/activation dependency.

## Phase 1 Core product proof

Add Java/Spring, Mongo, Kafka, FastAPI semantics; `ExecutionGraph`; `RuntimeFlow`; contract registry and basic cross-repository stitching; Markdown/ADR document IR; components, capabilities, integrations, and grounded business flows; repository/workspace/cross-repository knowledge workflows; manual knowledge update; FTS5; LLM runtime with local/OpenAI-compatible structured output; six core MCP tools; security baseline; packaging and install flow.

Provide the standard Wiki through a KnowledgeQuery/Application read boundary. If a WikiGenerator exists when this phase is implemented, retain it behind a thin projection facade/default-profile adapter; none exists yet. A complete user-authored Declarative WikiSpec is not required. Framework semantics remain Plugin-owned. Additional analyzer languages are optional and require their own Fixture/Evaluation evidence, not an all-language Phase 1 gate.

Design source-grounded, permissioned KnowledgeCandidate degradation for unsupported/partial parser coverage within the existing manual Knowledge workflow; a bounded candidate path may be evaluated, but complete degradation orchestration is not a Phase 1 dependency. Standard cross-repository System Wiki sections use published Knowledge with explicit missing/stale diagnostics. Agent knowledge consumption is progressive (L0 summary, L1 task-relevant knowledge, L2 deep engineering context) and read-only queries never trigger `update_knowledge`. This amendment does not make a full DiagramModel/renderer a Phase 1 exit requirement.

## Phase 2 Knowledge flywheel and agent enhancement

Add architecture rules, decisions, migrations, current/target/transition reasoning, architecture drift, advanced reconciliation, curated claims and resolution rules, embeddings and Zvec, hybrid retrieval, impact and change context, usage and feedback, richer document sources, daemon/local HTTP, and expanded security and permissions.

Add declarative WikiSpec, profile inheritance and version pinning, projection validation and diff. Refine multi-language concurrency and capability-aware analysis depth from measured baselines; no unsupported latency target is frozen here.

Detail grounded DiagramModel, default Mermaid rendering, type-specific provenance/ordering validation, and artifact lifecycle from Phase 1 evidence. In particular, cross-repository sequence diagrams require temporal evidence rather than dependency edges alone.

## Phase 3 Advanced intelligence and scale

Evaluate and selectively add SCIP/Joern, CFG/PDG, advanced data flow and taint, polymorphism improvements, adaptive provider/model/retrieval routing, task-aware session context, a single-executable option, third-party plugin ecosystem and sandboxing, and more automated knowledge policies. Decisions must be driven by Phase 1/2 evaluation data.

Wiki section/data extensions and their SDK belong here. `FAST`, `BALANCED`, and `PRECISE` are prospective analysis-depth profiles, not Phase 0/0.5 requirements or alternate Canonical IRs.

## Promotion rule

A phase advances only when every mandatory acceptance gate in `PHASE_ACCEPTANCE.md` passes, evidence is recorded, `CURRENT_STATUS.md` is updated, and any architecture changes are captured through ADRs and traceability updates.
