# Knowledge Workflow Specification

## Update model

Source fingerprints, code facts, contracts, `ExecutionGraph`, `RuntimeFlow`, document parsing, and impact detection update automatically. Claim extraction that uses semantic interpretation, Capability, BusinessFlow, Architecture knowledge, and wiki publication update only through `update_knowledge`.

## Workflows

- `RepoKnowledgeUpdateWorkflow`
- `WorkspaceKnowledgeUpdateWorkflow`
- `CrossRepoKnowledgeUpdateWorkflow`

Each resolves scope, freezes a RevisionSet, collects facts/evidence, derives deterministic structures, creates bounded semantic tasks, validates candidates, resolves identity, reconciles, evaluates, and atomically publishes a last-known-good revision.

```text
Scope -> Frozen RevisionSet -> Fact Collection -> Structural Derivation
      -> SemanticTask -> Candidate Validation -> Identity Resolution
      -> Reconciliation -> Evaluation -> Publication
```

## Semantic runtime

Phase 1 tasks are `CAPABILITY_SYNTHESIS`, `BUSINESS_FLOW_SYNTHESIS`, `COMPONENT_SUMMARY`, and `CLAIM_EXTRACTION`. A `SemanticContextBuilder` prioritizes structured facts and stable entity references within a budget, applies access policy and redaction, then uses a versioned prompt and model policy. Structured output is validated before candidate creation.

Native JSON Schema is preferred, JSON mode plus validation is acceptable, and prompt-only JSON plus bounded repair is fallback. Retry types distinguish transport, structure repair, semantic-context expansion, and allowed model fallback. Default remote fallback is disabled.

## Publication and provenance

LLM/network work occurs outside database transactions. A CompilationRun records revision set, workflow/task/prompt/model versions, input fingerprints, budgets, invocation metadata, validation results, and candidate references. It does not store hidden reasoning or raw invocation payloads by default.

Publishing uses copy-on-write. Partial or failed runs retain the previous published knowledge. Deterministic draft knowledge may exist but cannot be labeled as complete semantic publication.

## Freshness

`SourceFreshness` is `FRESH | AFFECTED | STALE`. `CompilationCurrency` is `CURRENT | OUTDATED_WORKFLOW | OUTDATED_PROMPT | OUTDATED_MODEL_POLICY`. Model/prompt changes recommend recompilation but do not impersonate source changes.

