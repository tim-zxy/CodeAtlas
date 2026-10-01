# Roadmap

## Maturity labels

| Phase | Maturity                   | Meaning                                                                                                                 |
| ----- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 0     | IMPLEMENTATION-READY       | Tasks, contracts, fixtures, and exit gates are defined.                                                                 |
| 0.5   | IMPLEMENTATION-READY       | The code-intelligence proof path is directly implementable.                                                             |
| 1     | DESIGN-READY               | Scope, models, boundaries, and acceptance are defined; expand the work breakdown after Phase 0.5.                       |
| 2     | ARCHITECTURE-READY         | Capability boundary and invariants are defined; detailed design follows evidence from Phase 1.                          |
| 3     | ROADMAP/ARCHITECTURE-READY | Direction and architectural guardrails are defined; implementation details are deliberately deferred to measured needs. |

There is no Phase 4 in this roadmap.

## Phase 0 Engineering foundation

Deliver the monorepo, TypeScript runtime skeleton, CLI/MCP shells, canonical IR package, repository/workspace SQLite migrations, provider and plugin contracts, native IPC handshake, fixture registry, comparator, metrics engine, and dependency guardrails. Phase 0 does not need to parse Java.

## Phase 0.5 Trusted code intelligence

Prove `Source -> Native Analyzer -> Canonical Facts -> SQLite -> Incremental Patch -> Evaluation -> Understand/Trace` for Java. Include symbols, imports, direct calls, inheritance, references, unresolved targets, coverage, provider bindings, full-index safety, incremental correctness, CLI understand, and code-level trace. Do not represent code trace as `BusinessFlow`.

The Java implementation uses a language-neutral NativeProvider with a narrow internal `LanguageAnalyzer` boundary, file-level refresh, protocol-only stdout, staging/batch apply, and stage/memory measurements. These constrain existing tasks rather than adding another language or a new numeric gate.

P05-W1-010 adds an activation fingerprint through additive repository migration R008 so a retained graph for a mutable `WORKTREE` can be marked stale or legacy-unknown without discarding it. Full-analysis staging and atomic activation stay within Phase 0.5; the unpublished Phase 1 repository migration reservations move to R009/R010. No Phase 1 capability is pulled forward.

P05-W1-011 reserves additive R009 for active per-support Canonical candidates needed by exact incremental FactMerger reselection. An older active graph lacking those candidates requires full analysis before patching; it is never guessed forward. The planned, unpublished Phase 1 repository migrations shift to R010/R011. This does not change Phase 0.5 exit gates or bring Native REFRESH production forward.

The accepted P05-W1-011 cross-revision amendment limits Phase 0.5 patch activation to one mutable `WORKTREE` revision ID with separately checked base and target fingerprints. A changed revision ID or immutable target requests full analysis without mutating the last graph. Broader cross-revision carry-forward requires a separate evidence-preserving design; this amendment does not relax the declared incremental-correctness or no-default-full-reparse gates on pinned inputs.

Within those existing tasks, native scheduling obtains parse-worker mode from validated indexing configuration, bounds in-flight and pending results with backpressure, distinguishes timeout/parser/unsupported/syntax/empty-success outcomes, and proves worker-count consistency against pinned inputs. The benchmark suite retains cold, 1-, 5-, and 50-file scenarios plus a worker-consistency case. Numeric performance limits still require measured baselines; none is added here.

P05-W3-003 uses the ADR-015 negotiated Native IPC v2 `ANALYZE` coverage payload for per-file/capability source-site counts and resolution distribution. Strict v1 remains available and reports numeric statistics as unavailable. This does not add a persisted ProviderSnapshot schema, protocol-v2 `REFRESH`, a new numerical gate, or an earlier query/activation dependency.

Before Phase 1 promotion, P05-W3-020 must implement/evaluate restart-safe REFRESH. The user accepted [ADR-016](adr/ADR-016-native-refresh-derived-analysis-state.md) on 2026-09-30: negotiated v3, TypeScript-owned derived summaries and additive R010 reservation; unpublished Phase 1 execution/runtime-flow reservations now move to R011/R012. No original Phase 0.5 gate or phase boundary changes. The first [v3 contract design/Fixture packet](../superpowers/specs/2026-09-30-p05-w3-020-v3-contract-design.md) and plan were approved for native execution; its input validators are locally implemented (review findings repaired; integration open); subsequent detailed packets cover state/full bootstrap, producer, composition and Evaluation. No product capability or R010 SQL is released by architecture acceptance.

Current publication clarification (2026-10-01): packet A is integrated through PR #17 at `954897e` with successful exact merge CI. Its older local-only wording above is historical. The [packet B R010/full-bootstrap design](../superpowers/specs/2026-10-01-p05-w3-020-state-bootstrap-design.md) is accepted; its [seven-task plan](../superpowers/plans/2026-10-01-p05-w3-020-state-bootstrap.md) is approved for native execution; Tasks 1–3 are locally complete, and Task 3 separately implements full-v3 schema/byte decoding/correspondence tests with an approved remeasured read/seal profile and passing local gates. Real full-output producer/bootstrap and REFRESH remain unimplemented; the parent task, phase scope, task count and original promotion gates are unchanged.

Task 3 numeric approval update (2026-10-01): the user answered the exact reservation question with “继续”. The unaltered report is preserved separately at `fixtures/storage/native-analysis-state/memory-baseline-task3.json`, SHA-256 `a9451c810ae270340cb499cac5dbf01d0fe274b755861a6725b4576eb17815b1`, with capture status unchanged. The current-build Windows read/seal profile now reserves 250,855,424 bytes plus twice retained SQL UTF-8 bytes; Task 2 report/profile is unchanged. Production matching-profile and one-byte-below/refusal checks passed within 83/83 focused tests after explicit RED for the absent current profile. Earlier pending-review/current-build refusal wording is historical and superseded by this approval/install record. Final post-approval root Node regression passes 762 with one existing Windows skip; focused tests pass 83/83, Cargo 88/88, existing real Native tests 25/25, build/type/architecture/fmt/Clippy/format/diff pass. Local Task 3 local Task 3 is complete. Decoder/transport workspace admission is still Task 4 work; no real producer/bootstrap/REFRESH or phase exit is claimed.

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
