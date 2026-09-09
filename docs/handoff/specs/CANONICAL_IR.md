# Canonical IR Specification

## Contract

Canonical IR is the versioned, provider-independent interchange and persistence contract. Provider-native payloads may retain extra properties but cannot leak into public APIs without normalization. All entities use opaque stable IDs, explicit references, source revision context, evidence, confidence, and resolution.

## Common primitives

```ts
type EntityId = string;
type CanonicalId = string;

interface EntityRef {
  kind: string;
  id: EntityId;
  revisionId?: EntityId;
}

interface SourceRange {
  sourceFileId: EntityId;
  startLine: number; startColumn: number;
  endLine: number; endColumn: number;
}

type ResolutionLevel = "EXACT" | "HEURISTIC" | "AMBIGUOUS" | "UNRESOLVED" | "UNSUPPORTED";
interface Confidence { score: number; method: string; reasons: string[]; }
interface SchemaEnvelope<T> { schema: string; version: number; payload: T; }
```

`Confidence.score` is within 0..1 and never substitutes for `ResolutionLevel`. Epoch milliseconds UTC are used in SQLite; public APIs emit ISO-8601 instants.

## Source IR

- Workspace: local knowledge boundary and repository registry.
- Repository: stable source-control unit with a root independent from workspace root.
- Revision: `COMMIT`, mutable `WORKTREE`, or immutable `SNAPSHOT`.
- RevisionSet: frozen mapping of repository IDs to revision IDs for a knowledge compilation.
- SourceFile: normalized repository-relative path, content fingerprint, classification, language hint, sensitivity.
- ProviderSnapshot: provider run, versions, requested revision, capability/coverage status, diagnostics, and outcome.

## Code IR

ProviderNode and ProviderEdge retain `providerId` and `providerFactId`. CanonicalNode and CanonicalEdge use stable fact keys and aggregate evidence. Initial node kinds cover repository/module/package/type/symbol; initial edge kinds cover import/reference/call/inheritance/override. A target is either a resolved `EntityRef` or an `UnresolvedTarget` with the original hint and candidate references.

No normalizer may invent a target to satisfy a non-null constraint.

## Runtime IR

`EntryPoint` represents HTTP, RPC, message, schedule, task, data-change, batch, CLI, and manual triggers. `TaskDefinition`, `DataResource`, `DataChangeTrigger`, `Contract`, and `ExecutionContext` are explicit entities.

`ExecutionGraph` contains detailed runtime nodes and transitions. Transition kinds include `CALL`, `HTTP`, `RPC`, `PUBLISH`, `CONSUME`, `CREATE_TASK`, `EXECUTE_TASK`, `DATA_CHANGE`, `BRANCH`, `JOIN`, `RETRY`, `FAILURE`, and `COMPENSATION`. Context kinds include `REQUEST`, `EVENT`, `JOB`, `TASK`, and `BATCH`.

`RuntimeFlow` is a deterministic projection with ordered steps, branches, boundaries, and support references. `BusinessFlow` is knowledge and is never stored as an execution fact.

## Document and claim IR

Document IR includes Document, DocumentRevision, Section, Block, Table, Link, CodeSnippet, EntityMention, and retrievable Chunk. Structural blocks remain authoritative; chunks are derived retrieval units.

Claims carry subject, predicate, value/object, scope, evidence, confidence, authority, and claim kind `OBSERVED | DECLARED | INFERRED | CURATED`. State intent is `CURRENT | TARGET | HISTORICAL | TRANSITION | DESIRED`.

## Knowledge IR

KnowledgeItem has a stable opaque ID, type, scope, importance, lifecycle state, source freshness, compilation currency, and revision list. Phase 1 types are Component, Capability, RuntimeFlow reference, BusinessFlow, and Integration. Phase 2 adds ArchitectureRule, Decision, and Migration.

Each KnowledgeRevision stores structured content, semantic and presentation fingerprints, support references, compilation provenance, evaluation result, and publication state. Human and agent projections are generated from the same revision.

## Compatibility

Every payload carries a schema name/version. Readers accept supported older compatible versions through explicit adapters. Unknown enum values at external boundaries are rejected or preserved as provider extensions; they are never silently coerced. Breaking changes require an ADR, migration path, fixture updates, and a major schema version.

