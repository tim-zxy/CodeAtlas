## Approved owned historical Wiki delivery - 2026-11-16

Actual successful one-shot receipt Wiki output can feed a private process-origin preparer and temp-only v2 file writer. The artifact keeps original publication/candidate/snapshot associations and marks observation ENDED and currentFreshness UNASSESSED. It is a historical projection, not a knowledge republish, persistent permission, ongoing Source observation or quality admission. Existing MANUAL semantics, Canonical facts and ordinary production closure remain. [Exact file contract](../../superpowers/specs/2026-11-08-owned-wiki-files.md#approved-receipt-wiki-historical-file-version---2026-11-16).

## Approved owned freshness operation - 2026-11-16

The [one-shot self-owned reconciliation contract](../../superpowers/specs/2026-11-16-owned-freshness-wiki.md) adds an explicit Application operation before Wiki projection. Complete matching genuine Source/Storage bases permit only ACTIVE AFFECTED-to-FRESH metadata CAS in anonymous temporary memory databases. It never recompiles/re-publishes semantic knowledge, changes historical revisions/receipts, recovers STALE, grants clearance or quality, or writes during ordinary read tools. FRESH is scoped to this observation window, not whole-project completeness. Production and real user data remain closed.

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

## Source-grounded degradation (Phase 1 design)

When an authorized semantic update encounters unsupported or partially failed parsing, it may create local, source-grounded `KnowledgeCandidate` records from source, configuration, or documents the caller is permitted to access. Prefer degradation for the affected files/capabilities rather than downgrading an otherwise valid repository result. This path never changes Source/Code/Contract/ExecutionGraph/RuntimeFlow AUTO updates, never fabricates Canonical Code Facts, and never invokes `update_knowledge` merely because a parser failed. Remote LLM use still requires its independent opt-in and security policy; a local-only or security block never triggers remote fallback.

Each degraded candidate records its generation method, source/evidence references, affected scope, parser/coverage limitation, and relations that could not be verified. Missing support or an unverified relationship remains explicit uncertainty. Candidates pass the existing schema/grounding validation, identity resolution, Reconciliation, Evaluation, and Quality Gate before copy-on-write publication; failure retains the last published revision. Do not create a second knowledge chain or let an LLM write SQLite. Phase 1 may validate a bounded candidate path; complete degradation orchestration is deferred until Phase 2 evidence-based design and is not a Phase 0.5 or Phase 1 dependency.

## Freshness

`SourceFreshness` is `FRESH | AFFECTED | STALE`. `CompilationCurrency` is `CURRENT | OUTDATED_WORKFLOW | OUTDATED_PROMPT | OUTDATED_MODEL_POLICY`. Model/prompt changes recommend recompilation but do not impersonate source changes.

## Wiki projection boundary

Wiki publication remains MANUAL, but explicit reprojection of an already published KnowledgeRevision is distinct from semantic `update_knowledge`. A Wiki spec/profile/renderer change can invalidate an artifact and request reprojection; it must not compile Knowledge or invoke an LLM to fill missing facts. Its reader uses KnowledgeQuery/Application API, not direct SQLite. Version dimensions and phase allocation are governed by [ADR-013](../adr/ADR-013-versioned-wiki-projection.md) and the [Wiki Projection specification](../../specs/wiki-projection.md).

