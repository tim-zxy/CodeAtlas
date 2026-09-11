# Canonical IR Specification

## Contract

Canonical IR is the versioned, provider-independent interchange and persistence contract. Provider-native payloads may retain extra properties but cannot leak into public APIs without normalization. All entities use opaque stable IDs, explicit references, source revision context, evidence, confidence, and resolution.

## Common primitives

The Zod schemas exported by `@codeatlas/ir` are the executable contracts. The
exported TypeScript types are inferred from those schemas and are not separate
wire definitions. Parsing helpers validate at public boundaries and return only
JSON-compatible values.

`EntityId` and `CanonicalId` are distinct TypeScript-branded forms of the same
opaque, non-empty string representation. Whitespace-only values and values with
leading or trailing whitespace are rejected. Accepted IDs retain their string
JSON representation; validation does not trim, rewrite, or infer meaning from
UUID shape, prefixes, provider identity, names, or source text.

`EntityRef` is a strict object with a non-blank, trimmed-string `kind`, a
validated `id`, and an optional validated `revisionId`. Unknown object keys are
rejected. The `kind` value remains open in P0-W1-001; later task-specific
schemas may narrow it.

`SourceRange` is a strict object containing `sourceFileId`, `startLine`,
`startColumn`, `endLine`, and `endColumn`. Coordinates are zero-based,
start-inclusive, end-exclusive, non-negative safe integers. Columns are UTF-8
byte offsets within a line. The end position must not precede the start
position when ordered by line and then column; empty and multi-line ranges are
valid.

`ResolutionLevel` is exactly `EXACT | HEURISTIC | AMBIGUOUS | UNRESOLVED |
UNSUPPORTED`. `Confidence` is a strict object with a finite `score` in the
inclusive range `0..1`, a non-blank trimmed `method`, and an array of non-blank
trimmed `reasons`. Confidence and resolution are independent dimensions: one
is never derived from or substituted for the other.

Public timestamps use the exact UTC millisecond form
`YYYY-MM-DDTHH:mm:ss.sssZ`. Offsets, invalid calendar values, and other
precision are rejected rather than normalized. SQLite boundaries use finite,
safe integer epoch milliseconds. Explicit `utcInstantToEpochMilliseconds` and
`epochMillisecondsToUtcInstant` helpers validate both directions; no implicit
date or timezone conversion is performed.

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

Every payload is carried in a strict envelope containing only a non-empty schema
name, a positive safe-integer version, and a JSON-compatible payload validated
by a caller-supplied Zod schema. A reader declares one exact schema name and
version. Envelope parsing is ordered and deterministic: validate the outer
shape, compare the schema name, compare the version, then validate the payload.
This means malformed shape wins over schema/version checks, schema mismatch wins
over version checks, and version mismatch wins over payload validation.

The public typed failures are `IR_VALIDATION_FAILED` for primitive, envelope,
or payload violations, `SCHEMA_MISMATCH` for an unexpected schema name, and
`UNSUPPORTED_SCHEMA_VERSION` for an unsupported version. Validation failures
retain structured field paths and bounded messages; they do not retain raw
rejected payloads.

P0-W1-001 supports exact version matching only. It adds no implicit adapter,
downgrade, upgrade, provider-extension coercion, or best-effort normalization.
Unknown enum values and unknown strict-object keys are rejected at the public
boundary. Breaking changes require an ADR, migration path, fixture updates, and
a major schema version.

