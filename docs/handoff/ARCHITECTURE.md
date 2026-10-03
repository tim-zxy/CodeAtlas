# Architecture

2026-10-03 proposed C1 boundary: direction approval permits review of the [written preflight amendment](../superpowers/specs/2026-10-03-p05-w3-020-c1-memory-preflight-proposal.md). Private Runtime admission would precede lazy request preparation; Provider verification remains pure and depends on no Runtime/SQLite writer. Separate REFRESH_VERIFY admission is not D transport/publication. This detail is not yet normative or implemented; original architecture/phase/deferred boundaries remain unchanged.

2026-10-03 design-only continuation: [REFRESH packet C](../superpowers/specs/2026-10-03-p05-w3-020-native-refresh-producer-design.md) is accepted within ADR-016; its [native plan](../superpowers/plans/2026-10-03-p05-w3-020-native-refresh-producer.md) awaits review. It specifies a bounded retained-summary scan and real changed-file Rust producer; Provider validation remains separate from TypeScript-owned atomic publication in subsequent packet D. No Canonical/storage/framework/knowledge boundary changes or early capability are introduced.

Packet B local review closure (2026-10-02): TypeScript owns bounded request preflight before schema copying/SQLite observation, exact approved static metadata admission, correspondence seal and atomic graph/state Apply. Rust remains JSONL Provider-fact-only with full v3 advertised, no real REFRESH capability. Original review's two Important defects are fixed; complete equivalent local gates pass after280,453,120-byte exact numeric approval (CURRENT_STATUS), but hosted integration remains unperformed. Canonical IR, SQLite authority, update lifecycle and phase/deferred boundaries do not change; Phase0.5 stays10/14 integrated.

Packet B execution update (2026-10-02): Task 6 is locally committed as `0b2af73`, with 24 real bootstrap/lifecycle cases, 98/98 expanded focused tests and root 796 pass/0 fail/one existing Windows skip. Task 7 now advertises full v3 `[1,2,3]` after observed RED→GREEN descriptor tests; strict v1/v2, IR v1, capability list and explicit v3 REFRESH refusal are unchanged. The required bootstrap runner obtains the actual descriptor through the production client rather than using a future descriptor. Native integration CI selects Windows/x64 Node 24.15.0 because only that exact environment has reviewed full-transport admission; Ubuntu TypeScript and Windows Rust gates remain. This is configured coverage, not observed hosted CI or Linux bootstrap evidence. Final Task 7 gates/review remain pending; earlier unimplemented/profile-review-blocked wording is historical. Parent REFRESH and original Phase 0.5 exits stay open at 10/14 integrated, with no new milestone or deferred scope.

## Invariants

1. Sources provide evidence; canonical IR provides stable contracts.
2. Code facts and knowledge are different layers.
3. Tools and providers produce facts or evidence; workflows compile knowledge.
4. Domain services own state mutation.
5. SQLite is authoritative; FTS and vectors are derived indexes.
6. Code, contract, `ExecutionGraph`, and `RuntimeFlow` update automatically.
7. Semantic knowledge and wiki publication update manually.
8. LLMs return schema-validated candidates and never write canonical knowledge directly.
9. Framework concepts are normalized below the canonical layer.
10. Provider identity and canonical identity remain separate.
11. Stable knowledge identity does not depend on wording, prompt, or model.
12. Rust analyzers stream facts and never own SQLite.
13. Evaluation and uncertainty are first-class.

## Canonical update policy

| Layer                             | Policy |
| --------------------------------- | ------ |
| Source fingerprint                | AUTO   |
| Code Graph                        | AUTO   |
| Contract Graph                    | AUTO   |
| ExecutionGraph                    | AUTO   |
| RuntimeFlow                       | AUTO   |
| Knowledge impact                  | AUTO   |
| Document structural parse         | AUTO   |
| Semantic claim extraction         | MANUAL |
| Capability                        | MANUAL |
| BusinessFlow                      | MANUAL |
| Architecture knowledge            | MANUAL |
| Wiki publication                  | MANUAL |
| Evaluation after knowledge update | AUTO   |

AUTO means deterministic updates occur during watching or startup reconciliation. MANUAL means an authorized `update_knowledge` command initiates semantic compilation and publication. Manual publication never prevents affected-state reporting.

## Logical architecture

```text
Agents / Humans
      |
MCP stdio | CLI | optional local HTTP
      |
Agent and Application API
      |
Query use cases | Command use cases | Knowledge workflows
      |
KnowledgeRuntime facade
      |
+-----+----------+-----------+-----------+-----------+
| Repository     | Contract  | Execution | Document  |
| Intelligence   | Intel.    | Intel.    | Intel.    |
+----------------+-----------+-----------+-----------+
      |                  Knowledge Compiler | Evaluation
      +---------------------------+----------+
                                  |
                         Canonical IR stores
                                  |
                       SQLite | FTS5 | Zvec*
                                  |
                     Provider and Plugin layer
                    Native Rust | external providers

* optional and derived
```

## Information ladder

```text
Source
  -> provider facts and evidence
  -> Canonical Code IR
  -> contracts and ExecutionGraph
  -> RuntimeFlow
  -> KnowledgeCandidate
  -> reconciled KnowledgeRevision
  -> BusinessFlow and other knowledge projections
```

`ExecutionGraph` is a detailed, automatically maintained runtime graph. `RuntimeFlow` is a deterministic technical-flow compression of that graph. `BusinessFlow` is a grounded semantic abstraction whose steps retain support references.

## Backward-compatible design extensions

Wiki remains a projection of published Canonical Knowledge, not another truth store. A versioned projection reads through KnowledgeQuery/Application API, produces structured sections, validates provenance and missing data, and renders separately versioned artifacts. Commercial Agent use has a locked standard profile; internal customization is policy-gated. Spec/profile/renderer changes may require explicit reprojection but never trigger semantic `update_knowledge`. See [ADR-013](adr/ADR-013-versioned-wiki-projection.md) and the [Wiki Projection specification](../specs/wiki-projection.md). This is Phase 1+ design, not a Phase 0 implementation.

NativeProvider remains language-neutral. A future internal `LanguageAnalyzer` boundary isolates syntax extraction and resolution by language; Java is first, while framework meaning belongs to Plugins. File fingerprints, bounded parser workers, changed-file refresh, protocol-only JSONL stdout, validated staging, and TypeScript-owned batched SQLite activation preserve the existing Provider/Canonical and storage boundaries. See [ADR-014](adr/ADR-014-multilanguage-native-analyzer.md) and the [Native Analyzer Scalability specification](../specs/native-analyzer-scalability.md). Phase 0.5 retains its Java-first priority and existing numeric quality gates.

Native IPC v1 remains a strict compatible path. Accepted [ADR-015](adr/ADR-015-native-ipc-v2-coverage-statistics.md) adds a negotiated v2 `ANALYZE` coverage payload for source-grounded per-file/capability site statistics; v1 `DESCRIBE` remains the bootstrap, IR schema stays v1, and protocol-v2 `REFRESH` is not part of P05-W3-003. Coverage statistics are Provider observation metadata, not Canonical truth or permission to activate partial state.

Source-grounded LLM degradation is a future, permissioned semantic-candidate path when parser coverage is unavailable; it rejoins the existing Reconciliation/Evaluation/publication chain and cannot create Canonical Code Facts or trigger semantic publication automatically. Diagram and Agent Context are bounded, authorized derived views of engineering facts or published Knowledge; neither becomes a canonical writer. Diagram projection defaults to grounded Mermaid, and a sequence requires ordering evidence rather than a CallGraph inference. Wiki remains the narrower ADR-013 projection of published Knowledge only. See [Knowledge Workflow](specs/KNOWLEDGE_WORKFLOW.md), [Diagram Projection](../specs/diagram-projection.md), and [Agent API](specs/AGENT_API.md).

Accepted [ADR-016](adr/ADR-016-native-refresh-derived-analysis-state.md) adds separately negotiated v3 ANALYZE/REFRESH with compact derived per-file resolver summaries, not AST/source persistence. TypeScript owns the derived repository state and activates it in the same validated Store transaction as graph/support/Evidence/coverage/fingerprint. Rust consumes strict bounded JSONL metadata and owns no SQLite. Missing/incompatible baseline requests explicit bootstrap; resource exhaustion never silently triggers full parsing. v1/v2 and same-WORKTREE applicability remain unchanged. This is accepted Phase 0.5 architecture, not an implemented REFRESH capability; the first [contract packet](../superpowers/specs/2026-09-30-p05-w3-020-v3-contract-design.md) was approved and has isolated input validators/shared corpus locally. Real producer, lifecycle and Store integration still require subsequent detailed packets; see CURRENT_STATUS for review-repair evidence.

The first contract packet is now integrated as PR #17; its earlier local-only description is historical. The [packet B detailed design](../superpowers/specs/2026-10-01-p05-w3-020-state-bootstrap-design.md) is accepted; its [implementation plan](../superpowers/plans/2026-10-01-p05-w3-020-state-bootstrap.md) is approved for native execution. It specifies Provider-owned validation injected by Runtime into Storage persistence ports, no Storage-to-Providers dependency, and one existing Store activation transaction for full graph and derived summaries. Task 1 adds R010 locally without backfill; validation/read/full-bootstrap and v3 capability remain unimplemented.

## Deployment modes

- `ONE_SHOT`: CLI opens the workspace, reconciles changes, performs one use case, and exits.
- `MCP_STDIO`: default agent integration; one process serves one active workspace and may watch files.
- `DAEMON`: optional Phase 2 mode for persistent watching, multi-client use, local HTTP, and background work.

When no process is alive, startup reconciliation compares fingerprints before serving queries. A daemon is not required for correctness.

## Storage topology

Each repository has a rebuildable `repo.sqlite` for source, provider, canonical code, evidence, diagnostics, coverage, execution, and runtime-flow facts. A workspace has `workspace.sqlite` for repository registration, frozen revision sets, services, contracts, cross-repository execution, documents, claims, knowledge, lifecycle, evaluation, and later usage.

Cross-repository relations are built through service identities, a contract registry, boundary resolution, and a workspace execution graph. The system does not pretend that cross-repository links are ordinary method calls.

## Technology boundary

- TypeScript: runtime, application services, APIs, configuration, storage coordination, workflows, evaluation, plugins, and agent integrations.
- Rust: performance-sensitive native parsing and fact extraction, initially Tree-sitter based.
- SQLite and FTS5: mandatory local persistence and lexical retrieval.
- Zvec and embeddings: optional derived semantic retrieval, introduced in Phase 2.
- Markdown and ADR: initial document sources; richer formats follow in Phase 2.

## Failure semantics

- Full and incremental graph updates validate before atomically activating a new good state.
- Analyzer failure leaves the previous indexed revision active.
- Knowledge compilation is copy-on-write; failed or partial runs do not replace the last published revision.
- Optional provider, LLM, or embedding failures degrade capability and report status; they do not invalidate deterministic features.
- Security-policy blocks never trigger an automatic remote fallback.
