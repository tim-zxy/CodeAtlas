# P0-W1-003 Code Fact IR Design

**Status:** Approved for implementation planning

**Date:** 2026-09-15

**Task:** P0-W1-003 Code fact IR

**Governing authority:** ADR-002, ADR-012, `docs/handoff/specs/CANONICAL_IR.md`, `docs/handoff/PHASE_ACCEPTANCE.md`, and `docs/handoff/DESIGN_TRACEABILITY.md`

## Purpose

P0-W1-003 defines the Provider Fact and Canonical Code Fact wire contracts used by later normalization, Evidence, persistence, Native IPC, and code-intelligence tasks. It freezes strict Provider/Canonical identity separation and preserves resolved, ambiguous, unresolved, and unsupported targets without performing normalization, merging, storage, or graph activation.

This task extends only dependency-bottom `@codeatlas/ir`. It does not implement the producer or consumer workflows that will use these contracts.

## Compatibility and governance

This design is a compatible field-level elaboration of ADR-002 and the existing Code IR section of `CANONICAL_IR.md`. It preserves these frozen invariants:

- Canonical IR remains Provider-independent.
- Provider identity never substitutes for Canonical identity.
- Ambiguous and unresolved relations remain explicit and are never forced to one target.
- SQLite remains the future authoritative store; this task adds no storage or migration.
- Evidence remains separate and belongs to P0-W1-004.
- `@codeatlas/ir` imports no other project package.
- Evaluation and Fixtures remain required implementation infrastructure.

No accepted ADR changes. No adapter or migration is required because no earlier Code Fact schema exists.

## Scope

### Included

- branded Provider Fact IDs and Node/Edge FactKeys;
- typed Provider and Canonical Fact references;
- ProviderNode, ProviderEdge, CanonicalNode, and CanonicalEdge;
- Provider-native kinds and closed provider-independent Canonical kinds;
- resolved, ambiguous, unresolved, and unsupported targets;
- Confidence, source revision, ProviderSnapshot, and SourceRange context;
- version-1 Common IR envelope tests;
- task-local executable Fixtures and brand type tests.

### Excluded

- FactKey computation, hashing, canonicalization, or normalization;
- FactMerger scoring, Confidence aggregation, or Provider authority policy;
- Evidence, EvidenceStatus, FactEvidence, and ProviderFactBinding;
- graph-wide uniqueness, referential integrity, or dangling-reference validation;
- SQLite, migrations, transactions, staging, or activation;
- Native IPC request/event schemas;
- parsing, scanning, Provider execution, or plugin behavior;
- graph queries, ExecutionGraph, RuntimeFlow, BusinessFlow, Knowledge, LLM, embedding, network, watcher, or daemon behavior.

P05-W4-001 generates language-neutral FactKeys and maps Provider facts to Canonical facts. P05-W4-002 merges support and aggregates Confidence.

## File structure

```text
packages/ir/src/
  code-fact-identity.ts
  code-fact-reference.ts
  code-fact-target.ts
  provider-code-fact.ts
  canonical-code-fact.ts
  index.ts
packages/ir/test/
  code-fact-ir.test.mjs
packages/ir/type-test/
  code-fact-brands.test.ts
fixtures/ir/code-fact-v1/
  cases.json
  valid/cases.json
  invalid/cases.json
```

Provider and Canonical facts must not be collapsed into one object with nullable identity fields. No arbitrary attributes bag is allowed.

## Exact scalar contracts

The following schemas are separately branded exact strings:

- `ProviderFactIdSchema` / `ProviderFactId`;
- `NodeFactKeySchema` / `NodeFactKey`;
- `EdgeFactKeySchema` / `EdgeFactKey`;
- `CodeFactNameSchema` / `CodeFactName`;
- `QualifiedCodeFactNameSchema` / `QualifiedCodeFactName`;
- `ProviderFactKindSchema` / `ProviderFactKind`;
- `UnresolvedTargetHintSchema` / `UnresolvedTargetHint`.

Each value is non-empty, non-blank, and has no surrounding whitespace. Parsing preserves the exact string and performs no normalization, prefix interpretation, identity derivation, or FactKey computation.

`ProviderFactId`, `NodeFactKey`, `EdgeFactKey`, `EntityId`, `CanonicalId`, and `ProviderId` are not assignable to one another without runtime validation.

## Fact references

`FactTypeSchema` is exactly `NODE | EDGE`.

```ts
interface ProviderFactRef {
  factType: 'NODE' | 'EDGE';
  providerId: ProviderId;
  providerFactId: ProviderFactId;
}

interface CanonicalFactRef {
  factType: 'NODE' | 'EDGE';
  id: CanonicalId;
}
```

`ProviderNodeRefSchema` and `CanonicalNodeRefSchema` narrow `factType` to `NODE`. Edge sources, resolved targets, and candidates accept only the corresponding Node reference. Edge references are invalid graph endpoints.

`providerSnapshotId` is observation provenance on a Provider fact. It is not part of Provider Fact identity or `ProviderFactRef`.

References do not assert that a target exists. Repository/revision membership and referential integrity require graph or storage context and remain outside single-object parsing.

## Target resolution

Provider and Canonical targets have parallel strict shapes with different reference types. Each union is discriminated by `resolution` and carries a consistent `state` literal.

Resolved targets use:

```ts
{
  state: 'RESOLVED';
  resolution: 'EXACT' | 'HEURISTIC';
  target: ProviderNodeRef | CanonicalNodeRef;
}
```

They contain no hint or candidates.

Non-resolved targets use:

```ts
{
  state: 'UNRESOLVED';
  resolution: 'AMBIGUOUS' | 'UNRESOLVED' | 'UNSUPPORTED';
  originalHint: UnresolvedTargetHint;
  candidates: readonly (ProviderNodeRef | CanonicalNodeRef)[];
}
```

Invariants:

- `AMBIGUOUS` has at least two unique candidates.
- `UNRESOLVED` has zero or more unique candidates.
- `UNSUPPORTED` has exactly zero candidates.
- Candidate order is preserved and no candidate is selected automatically.
- Provider candidates are unique by `(providerId, providerFactId)`.
- Canonical candidates are unique by `CanonicalId`.

Duplicate candidates are rejected at the duplicate path. Validation does not sort, deduplicate, infer resolution from count, or promote a candidate.

## Provider facts

Provider facts are validated observations. They retain Provider identity and Provider-native kinds without exposing an arbitrary Provider payload.

```ts
interface ProviderNode {
  providerId: ProviderId;
  providerFactId: ProviderFactId;
  providerSnapshotId: EntityId;
  repositoryId: EntityId;
  revisionId: EntityId;
  providerKind: ProviderFactKind;
  name: CodeFactName;
  qualifiedName: QualifiedCodeFactName | null;
  sourceRange: SourceRange | null;
  confidence: Confidence;
}

interface ProviderEdge {
  providerId: ProviderId;
  providerFactId: ProviderFactId;
  providerSnapshotId: EntityId;
  repositoryId: EntityId;
  revisionId: EntityId;
  providerKind: ProviderFactKind;
  source: ProviderNodeRef;
  target: ProviderTarget;
  sourceRange: SourceRange | null;
  confidence: Confidence;
}
```

ProviderEdge requires the Edge, source, resolved target, and every candidate to use the same `providerId`. Mismatches are rejected at the nested reference's `providerId` path. No Provider lookup or ID-format convention is introduced.

Provider facts contain no `CanonicalId`, `NodeFactKey`, or `EdgeFactKey`.

## Canonical nodes

`CodeNodeKindSchema` is exactly:

```text
REPOSITORY | MODULE | PACKAGE | TYPE | SYMBOL
```

All Canonical nodes share:

```ts
{
  id: CanonicalId;
  factKey: NodeFactKey;
  repositoryId: EntityId;
  revisionId: EntityId;
  name: CodeFactName;
  qualifiedName: QualifiedCodeFactName | null;
  sourceRange: SourceRange | null;
  confidence: Confidence;
}
```

`CanonicalNodeSchema` is a strict discriminated union on `kind`:

- `REPOSITORY`, `MODULE`, and `PACKAGE` have no subkind.
- `TYPE` requires `typeKind` and rejects `symbolKind`.
- `SYMBOL` requires `symbolKind` and rejects `typeKind`.

`CodeTypeKindSchema` is exactly:

```text
CLASS | INTERFACE | ENUM | RECORD | ANNOTATION | TRAIT | STRUCT | UNION | OTHER
```

`CodeSymbolKindSchema` is exactly:

```text
METHOD | CONSTRUCTOR | FUNCTION | FIELD | PROPERTY | VARIABLE | PARAMETER | CONSTANT | OTHER
```

These are language-neutral categories. Provider-specific kinds remain only in Provider facts until P05-W4-001 normalizes them.

## Canonical edges

`CodeEdgeKindSchema` is exactly:

```text
IMPORT | REFERENCE | CALL | INHERITANCE | OVERRIDE
```

```ts
interface CanonicalEdge {
  id: CanonicalId;
  factKey: EdgeFactKey;
  repositoryId: EntityId;
  revisionId: EntityId;
  kind: CodeEdgeKind;
  source: CanonicalNodeRef;
  target: CanonicalTarget;
  sourceRange: SourceRange | null;
  confidence: Confidence;
}
```

Canonical facts contain no `ProviderId`, `ProviderFactId`, `providerSnapshotId`, or Provider-native kind. FactKey uniqueness and target existence are graph-level responsibilities.

## Confidence and Evidence boundary

Every Provider and Canonical fact requires a Common IR `Confidence`; this task only validates the supplied value. Resolution belongs to an Edge target and is not duplicated. Nodes carry no artificial resolution.

P0-W1-003 adds no evidence IDs, supports, bindings, lifecycle states, or aggregation. P0-W1-004 defines independent Evidence relations. P05-W4-002 later derives Canonical Confidence from support.

## Validation and errors

All public objects are strict, JSON-safe Zod contracts. Required nullable fields must be present with a valid value or `null`; explicit `undefined` is rejected.

Public parsing reuses existing typed errors:

- structural, enum, brand, uniqueness, and cross-field failures use `IR_VALIDATION_FAILED`;
- envelope schema disagreement uses `SCHEMA_MISMATCH`;
- envelope version disagreement uses `UNSUPPORTED_SCHEMA_VERSION`.

Relationship paths include:

- `['source', 'providerId']`;
- `['target', 'target', 'providerId']`;
- `['target', 'candidates', 1]`;
- `['target', 'candidates']`.

Controlled messages are at most 128 characters and never copy rejected IDs, names, hints, or source text. Failure returns no partial fact and mutates no state.

## Fixture and tests

The executable Fixture index is exactly:

```json
{
  "schemaVersion": 1,
  "id": "p0-code-fact-ir-v1",
  "task": "P0-W1-003",
  "governingSpec": "docs/handoff/specs/CANONICAL_IR.md",
  "acceptance": "Provider/canonical identity remains separate",
  "validCases": "valid/cases.json",
  "invalidCases": "invalid/cases.json"
}
```

The runner asserts the metadata and resolves both child files through the index.

Required valid coverage:

- ProviderNode cases with representative Provider-native kinds;
- CanonicalNode cases covering all top-level kinds and representative TYPE/SYMBOL subkinds, including class, interface, method, field, and function;
- ProviderEdge cases with representative Provider-native kinds and every target-resolution variant;
- CanonicalEdge cases covering all five Canonical edge kinds and every target-resolution variant;
- `EXACT` and `HEURISTIC` resolved targets;
- `AMBIGUOUS` with at least two candidates;
- `UNRESOLVED` with zero candidates and with retained candidates;
- `UNSUPPORTED` with zero candidates;
- nullable qualified names and source ranges;
- JSON round-trips for every case;
- all four fact payloads through test-local version-1 descriptors and both Common envelope APIs.

Required invalid coverage:

- compile-time separation of ProviderId, ProviderFactId, CanonicalId, EntityId, NodeFactKey, and EdgeFactKey;
- Provider fields on Canonical facts and Canonical fields on Provider facts;
- ProviderEdge source, resolved-target, and candidate Provider mismatches;
- Edge references used as sources or targets;
- missing, wrong, cross-kind, or forbidden TYPE/SYMBOL subkind fields;
- unknown kind, subkind, resolution, state, and object fields;
- resolved targets carrying hints/candidates;
- insufficient or duplicate AMBIGUOUS candidates;
- duplicate UNRESOLVED candidates;
- UNSUPPORTED with candidates;
- blank or padded IDs, FactKeys, names, qualified names, Provider kinds, and hints;
- missing or explicit `undefined` required nullable fields;
- structured envelope payload rejection and schema-before-version-before-payload ordering.

No test may weaken Common IR strictness, silently replace an existing baseline, or rely only on compile-time typing for runtime identity separation.

## Quality Gates

Completion requires fresh evidence for:

- focused Code Fact runtime and brand tests;
- executable `p0-code-fact-ir-v1` Fixture;
- Common and Source/Revision IR regressions;
- schema-specific version-1 envelope behavior;
- root Node tests and all 16 TypeScript builds;
- the 17-project architecture check;
- formatting, `git diff --check`, Rust format/build/Clippy, and native smoke tests;
- explicit Guardrail and Deferred-scope audits;
- hosted CI for the exact final feature-branch SHA.

`CURRENT_STATUS.md` records actual counts only after execution. A failure is classified as implementation, Fixture, or design error; tests, Gates, Canonical identity, uncertainty, and Evidence boundaries may not be weakened.

## Documentation and traceability

Completion synchronizes:

- the Code IR section of `docs/handoff/specs/CANONICAL_IR.md`;
- the existing P0-W1-003 row in `docs/handoff/DESIGN_TRACEABILITY.md`, including Fixture index/children, runtime/type tests, ADR-002, spec, and acceptance;
- `docs/handoff/CURRENT_STATUS.md` with reproducible local/hosted evidence and the next task.

The Fixture baseline is deliberately created by this task. Later changes require explicit review and synchronized evidence. A frozen-decision conflict requires an ADR or Design Change Proposal before implementation.
