# Architecture

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

| Layer | Policy |
|---|---|
| Source fingerprint | AUTO |
| Code Graph | AUTO |
| Contract Graph | AUTO |
| ExecutionGraph | AUTO |
| RuntimeFlow | AUTO |
| Knowledge impact | AUTO |
| Document structural parse | AUTO |
| Semantic claim extraction | MANUAL |
| Capability | MANUAL |
| BusinessFlow | MANUAL |
| Architecture knowledge | MANUAL |
| Wiki publication | MANUAL |
| Evaluation after knowledge update | AUTO |

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
