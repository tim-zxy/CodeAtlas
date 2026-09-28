# Canonical IR Specification

## Contract

Canonical IR is the versioned, provider-independent interchange and persistence contract. Provider-native payloads may retain extra properties but cannot leak into public APIs without normalization. All entities use opaque stable IDs, explicit references, source revision context, evidence, confidence, and resolution.

## Common primitives

The Zod schemas exported by `@codeatlas/ir` are the executable contracts. The
exported TypeScript types are inferred from those schemas and are not separate
wire definitions. The schema-specific Common IR schemas and
`parseSchemaEnvelope` validate JSON-compatible values. `parseIr` is a generic
typed validation adapter whose output follows the supplied schema; JSON safety
comes from using the exported Canonical IR schemas with it, not from arbitrary
caller-supplied schemas.

`EntityId` and `CanonicalId` are distinct TypeScript-branded forms of the same
opaque, non-empty string representation. Whitespace-only values and values with
leading or trailing whitespace are rejected. Accepted IDs retain their string
JSON representation; validation does not trim, rewrite, or infer meaning from
UUID shape, prefixes, provider identity, names, or source text.

`EntityRef` is a strict object with a non-blank, trimmed-string `kind`, a
validated `id`, and an optional validated `revisionId`. An absent revision must
omit `revisionId`; an explicit `undefined` is rejected rather than removed.
Unknown object keys are rejected. The `kind` value remains open in P0-W1-001; later task-specific
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

Negative zero (`-0`) is rejected by confidence scores, source coordinates,
epoch milliseconds, and the generic JSON boundary. Positive zero remains valid.
This preserves the validated value across JSON serialization without implicit
normalization, including JSON bytes containing the numeric literal `-0`.

## Source IR

P0-W1-002 exports strict Zod schemas and schema-inferred TypeScript types for
Repository, Revision, SourceFile, and ProviderSnapshot. These contracts accept
already-observed values; they do not discover repositories or files, calculate
fingerprints, run Providers, persist state, or activate a revision.

### Source identity scalars

The following exported scalars are separately TypeScript-branded opaque
strings. Each must be non-empty, non-blank, and free of leading or trailing
whitespace. Parsing preserves the exact string and rejects rather than trims,
normalizes, or interprets it.

- `RepositoryRootPath` is a host-local repository locator. Its syntax is opaque
  in this contract and it is not repository identity.
- `RepositoryRelativePath` is a canonical `/`-separated logical path. It
  rejects a leading or trailing `/`, a drive-absolute prefix, `\`, NUL, empty
  segments, and `.` or `..` segments. It performs no rewriting.
- `ContentFingerprint` is an opaque, precomputed content or revision
  fingerprint. This contract specifies no hash algorithm or encoding.
- `CommitIdentity` is an opaque source-control commit identity. This contract
  assumes no hash algorithm or length.
- `ProviderId` is an opaque Provider identity and is branded separately from
  `EntityId` and `CanonicalId`.
- `ProviderVersion` and `RuntimeVersion` are opaque exact versions. No semantic
  version parsing or coercion occurs.

### Repository

`Repository` is a strict object with `id: EntityId` and
`rootPath: RepositoryRootPath`. The ID is the stable repository identity;
`rootPath` is a relocatable local locator independent from any workspace root.
Moving a repository root does not authorize regenerating its ID. Workspace
membership, display names, and source-control discovery metadata are outside
this contract.

### Revision

`RevisionKind` is exactly `COMMIT | WORKTREE | SNAPSHOT`. `Revision` is a strict
discriminated union. Every variant has `id: EntityId`,
`repositoryId: EntityId`, `kind`, and
`contentFingerprint: ContentFingerprint`. The variant-specific fields are:

- `CommitRevision`: `kind: COMMIT` and `commitIdentity: CommitIdentity`;
- `WorktreeRevision`: `kind: WORKTREE` and
  `baseRevisionId: EntityId | null`;
- `SnapshotRevision`: `kind: SNAPSHOT` and
  `sourceRevisionId: EntityId | null`.

`null` records an unknown base or source revision in the current repository
context. The nullable fields are required: explicit `undefined` is invalid, and
a field belonging to another variant is an unknown key and is rejected.

`validateRevisionTransition(previous, next)` parses both inputs and validates
an update of one revision identity. Repository ID, revision ID, and kind must
remain equal. A `WORKTREE` may change `contentFingerprint` and
`baseRevisionId` under that stable identity. A `COMMIT` or `SNAPSHOT` permits an
idempotent observation only: its fingerprint and `commitIdentity` or
`sourceRevisionId` cannot change. A different repository, ID, or kind denotes a
different revision identity rather than a valid transition. This validator is
pure and performs no persistence or concurrency control.

### SourceFile

`SourceFile` is a strict, revision-scoped object with `id: EntityId`,
`repositoryId: EntityId`, `revisionId: EntityId`,
`path: RepositoryRelativePath`,
`contentFingerprint: ContentFingerprint`, `classification`,
`languageHint: LanguageHint | null`, and `sensitivity: SourceSensitivity`.
The ID represents stable logical-path identity within one repository. The same
logical SourceFile ID may appear at different revisions while `revisionId` and
the path-scoped fingerprint change.

`SourceFileClassification` is a strict object whose dimensions are
orthogonal:

- `role: SOURCE | TEST | OTHER`;
- `provenance: AUTHORED | GENERATED | VENDOR`;
- `contentKind: TEXT | BINARY`.

`LanguageHint` is an open exact, non-blank string rather than a Provider enum;
`null` means no hint is declared. `SourceSensitivity` is exactly
`PUBLIC | INTERNAL | SENSITIVE | SECRET` and follows the Security
specification. P0-W1-002 validates declared values only. It does not scan or
classify files, infer language, or access their contents. Rename identity is
not inferred; Phase 0.5 represents rename as delete plus add.

### ProviderSnapshot

`ProviderSnapshot` is a strict record of one Provider observation attempt. It
contains:

- `id: EntityId`, `repositoryId: EntityId`, `providerId: ProviderId`,
  `providerVersion: ProviderVersion`, and `runtimeVersion: RuntimeVersion`;
- `requestedRevisionId: EntityId` and
  `requestedRevisionFingerprint: ContentFingerprint`;
- `startedAt: UtcInstant` and `completedAt: UtcInstant`;
- `capabilities: ProviderCapabilityObservation[]`;
- `diagnostics: ProviderSnapshotDiagnostic[]`;
- `outcome: SUCCEEDED | PARTIAL | FAILED | CANCELLED`.

Completion cannot precede start; both fields retain the Common IR exact UTC
millisecond representation. Capability names are open exact, non-blank strings
and must be unique within one snapshot. Each capability observation is a strict
object with `name`, `support: SUPPORTED | UNSUPPORTED`, and
`coverage: COMPLETE | PARTIAL | NONE | UNKNOWN`.

Each diagnostic is a strict object with an exact, non-blank `code`,
`severity: INFO | WARNING | ERROR`, an exact, non-blank `message` of at most 128
characters, and `sourceRange: SourceRange | null`. This bounded shape has no
field for Provider-native objects, source text, stack traces, or unrestricted
prose; producers must not place secrets in diagnostic strings. Diagnostic array
order is preserved, and the schema does not derive `outcome` from severity.

`validateProviderSnapshotRevision(snapshot, revision)` parses both inputs and
requires equal repository ID, requested revision ID, and requested revision
fingerprint. The fingerprint check prevents an observation for an earlier
state of a stable `WORKTREE` identity from matching a newer state. The helper
returns the validated snapshot or raises `IR_VALIDATION_FAILED` with a
structured mismatch path. It does not activate Canonical State, apply facts,
or write storage.

### Source IR boundaries

ProviderSnapshot is observation metadata, not proof of canonical truth or an
activation decision. Provider-native data must still be normalized before it
can enter provider-independent Canonical IR. Evidence remains separate from
claims, candidates, and published Knowledge, and LLM output remains
candidate-only. P0-W1-002 introduces no SQLite schema or write path; SQLite
remains the authority when later storage tasks persist canonical state, while
search and vector indexes remain derived and rebuildable.

Workspace and RevisionSet remain outside the P0-W1-002 executable contract, as
do repository/file discovery, fingerprint calculation, Provider execution,
FactMerger behavior, persistence, graph activation, native IPC, and later-phase
Knowledge or Runtime behavior.

## Code IR

P0-W1-003 defines strict, JSON-safe Provider Fact and Canonical Code Fact
contracts. They validate already-observed fact values only; they do not
normalize, merge, persist, activate, or otherwise publish facts. Provider and
Canonical facts are deliberately separate shapes: a Provider fact never
substitutes for a Canonical fact, and no public fact carries an arbitrary
attributes or Provider-payload bag.

### Code Fact identity and references

The following exported schemas and schema-inferred types are separately
branded, exact, non-empty, non-blank strings without surrounding whitespace:
`ProviderFactIdSchema` / `ProviderFactId`, `NodeFactKeySchema` / `NodeFactKey`,
`EdgeFactKeySchema` / `EdgeFactKey`, `CodeFactNameSchema` / `CodeFactName`,
`QualifiedCodeFactNameSchema` / `QualifiedCodeFactName`,
`ProviderFactKindSchema` / `ProviderFactKind`, and
`UnresolvedTargetHintSchema` / `UnresolvedTargetHint`. Parsing preserves each
accepted string exactly: it does not trim, normalize, interpret a prefix,
derive identity, or compute a FactKey.

`ProviderFactId`, `NodeFactKey`, `EdgeFactKey`, `EntityId`, `CanonicalId`, and
`ProviderId` are non-interchangeable identity families. `FactTypeSchema` /
`FactType` is exactly `NODE | EDGE`. `ProviderFactRefSchema` /
`ProviderFactRef` contains `factType`, `providerId: ProviderId`, and
`providerFactId: ProviderFactId`; `CanonicalFactRefSchema` /
`CanonicalFactRef` contains `factType` and `id: CanonicalId`.
`ProviderNodeRefSchema` / `ProviderNodeRef` and `CanonicalNodeRefSchema` /
`CanonicalNodeRef` narrow `factType` to `NODE`. Edge sources, resolved targets,
and target candidates use only the corresponding Node reference; an edge
reference cannot be a graph endpoint.

`providerSnapshotId: EntityId` is observation provenance on a Provider fact.
It is not part of Provider Fact identity or `ProviderFactRef`. References do
not assert that a referenced fact exists, belongs to a repository or revision,
or is graph-consistent; those checks require graph or storage context.

### Target resolution

`ProviderTargetSchema` / `ProviderTarget` and `CanonicalTargetSchema` /
`CanonicalTarget` are parallel strict discriminated unions with their respective
Node references. A resolved target is exactly
`{ state: 'RESOLVED', resolution: 'EXACT' | 'HEURISTIC', target }`; it carries
no hint or candidates. A non-resolved target is exactly
`{ state: 'UNRESOLVED', resolution: 'AMBIGUOUS' | 'UNRESOLVED' |
'UNSUPPORTED', originalHint, candidates }`.

`AMBIGUOUS` requires at least two unique candidates, `UNRESOLVED` permits zero
or more unique candidates, and `UNSUPPORTED` requires exactly zero candidates.
Provider candidates are unique by `(providerId, providerFactId)`; Canonical
candidates are unique by `CanonicalId`. Candidate array order is preserved.
Validation neither sorts nor deduplicates candidates, infers a resolution from
candidate count, nor auto-selects or promotes a candidate. No normalizer may
invent a target to satisfy a non-null constraint.

### Provider facts

`ProviderNodeSchema` / `ProviderNode` is a strict record containing
`providerId`, `providerFactId`, `providerSnapshotId`, `repositoryId`,
`revisionId`, `providerKind`, `name`, `qualifiedName`, `sourceRange`, and
`confidence`. `ProviderEdgeSchema` / `ProviderEdge` is a strict record
containing `providerId`, `providerFactId`, `providerSnapshotId`, `repositoryId`,
`revisionId`, `providerKind`, `source`, `target`, `sourceRange`, and
`confidence`. `qualifiedName` and `sourceRange` are required nullable fields:
they must contain a valid value or `null`, and explicit `undefined` is rejected.

Provider facts retain opaque Provider-native `providerKind` but contain no
`CanonicalId`, `NodeFactKey`, or `EdgeFactKey`. For a `ProviderEdge`, its
source, resolved target, and every non-resolved candidate must have the same
`providerId` as the edge. A mismatch is rejected at the nested reference's
`providerId` path; validation performs no Provider lookup or Provider-ID-format
interpretation.

### Canonical facts

`CodeNodeKindSchema` / `CodeNodeKind` is exactly `REPOSITORY | MODULE | PACKAGE
| TYPE | SYMBOL`. Every Canonical node has `id: CanonicalId`,
`factKey: NodeFactKey`, `repositoryId`, `revisionId`, `name`, `qualifiedName`,
`sourceRange`, and required `confidence`. `CanonicalNodeSchema` /
`CanonicalNode` is a strict discriminated union: `REPOSITORY`, `MODULE`, and
`PACKAGE` have no subkind; `TYPE` requires `typeKind` and rejects `symbolKind`;
and `SYMBOL` requires `symbolKind` and rejects `typeKind`.

Canonical-node `qualifiedName` and the Canonical node and edge `sourceRange`
fields are required nullable fields: each must contain a valid value or `null`,
and explicit `undefined` is rejected.

`CodeTypeKindSchema` / `CodeTypeKind` is exactly `CLASS | INTERFACE | ENUM |
RECORD | ANNOTATION | TRAIT | STRUCT | UNION | OTHER`.
`CodeSymbolKindSchema` / `CodeSymbolKind` is exactly `METHOD | CONSTRUCTOR |
FUNCTION | FIELD | PROPERTY | VARIABLE | PARAMETER | CONSTANT | OTHER`.
Unknown, cross-kind, missing, and forbidden subkind fields are invalid. These
are language-neutral Canonical categories; Provider-specific kinds remain on
Provider facts until normalization.

`CodeEdgeKindSchema` / `CodeEdgeKind` is exactly `IMPORT | REFERENCE | CALL |
INHERITANCE | OVERRIDE`. `CanonicalEdgeSchema` / `CanonicalEdge` is a strict
record containing `id: CanonicalId`, `factKey: EdgeFactKey`, `repositoryId`,
`revisionId`, `kind`, `source: CanonicalNodeRef`, `target: CanonicalTarget`,
`sourceRange`, and required `confidence`. Canonical facts contain no
`ProviderId`, `ProviderFactId`, `providerSnapshotId`, or Provider-native kind.
FactKey uniqueness and target existence are graph-level responsibilities, not
single-object parsing rules.

Every Provider and Canonical fact requires Common IR `Confidence`; this task
validates only the supplied value. Resolution belongs solely to an edge target,
and nodes carry no artificial resolution.

### Validation, errors, and phase boundary

All public Code Fact objects are strict and JSON-safe. Unknown fields, invalid
brands or enums, target cardinality or uniqueness failures, and cross-field
Provider-edge failures use `IR_VALIDATION_FAILED`; envelope schema disagreement
uses `SCHEMA_MISMATCH`; and envelope version disagreement uses
`UNSUPPORTED_SCHEMA_VERSION`. Structured paths identify the relevant field;
messages are controlled and at most 128 characters, do not copy rejected values
or source text, and failed parsing returns no partial fact or mutated state.

This task explicitly excludes FactKey computation, hashing, canonicalization,
normalization, graph-wide uniqueness, referential integrity, Evidence,
`FactEvidence`, `ProviderFactBinding`, merge or aggregation, storage,
activation, SQLite, migrations, Native IPC, parsing, scanning, Provider or
plugin execution, graph queries, `ExecutionGraph`, `RuntimeFlow`,
`BusinessFlow`, Knowledge, LLM, embedding, network, watcher, and daemon
behavior. Evidence belongs to P0-W1-004. P05-W4-001 performs normalization and
FactKey generation; P05-W4-002 performs merge and Confidence aggregation.

### Phase 0.5 Java normalization profile

P05-W4-001 adds a pure `@codeatlas/providers` normalizer for complete v1/v2
Native `ANALYZE` results with `ANALYSIS_COMPLETED` outcome `SUCCEEDED` or
`PARTIAL`. A partial observation can yield Canonical candidate facts but does
not authorize graph publication. The accepted
[`P05-W4-001 design`](../../superpowers/specs/2026-09-28-p05-w4-001-canonical-normalization-design.md)
defines the exact version-1 identity tuples and SHA-256 encoding; the registered
`canonical-normalization` Fixture pins their resulting opaque keys and IDs.

`java.package` and synthetic `java.package_container` map to one `PACKAGE`
identity by qualified name while retaining separate Provider support and
nullable display ranges. `java.compilation_unit` maps to a file-scoped `MODULE`,
not a language/build module. Java class/interface map to `TYPE`; method,
constructor, and field map to `SYMBOL`. Imports, calls, inheritance, and
references map to their existing Canonical edge kinds. Resolution state,
original hints, ordered unique Canonical candidates, confidence, and callsite
are preserved. Unknown kinds, detached source locations, missing references,
and contradictory ambiguity fail as controlled all-or-nothing normalization
errors; no inferred target is added.

Current ProviderNode v1 has no signature field, so source name position
distinguishes same-qualified-name overloads. Pure line movement may therefore
change a FactKey. This limitation is not a claim of cross-revision semantic
identity; changing it requires reviewed compatibility, Fixture, and migration
analysis. No Code IR schema, ProviderSnapshot, Native IPC, Evidence, or SQLite
contract is changed by P05-W4-001.

## Evidence IR

P0-W1-004 defines provider-origin Evidence v1 as a pure, JSON-safe wire
contract. The exported schema/type pairs are `EvidenceIdSchema` / `EvidenceId`,
`EvidenceStatusSchema` / `EvidenceStatus`, `EvidenceSchema` / `Evidence`,
`FactEvidenceSchema` / `FactEvidence`, and `ProviderFactBindingSchema` /
`ProviderFactBinding`. Types are inferred from the schemas. Evidence is an
independently identified observation, separate from a Claim, KnowledgeCandidate,
or published KnowledgeRevision. Only Provider Fact Evidence is accepted in v1;
source, document, and human Evidence variants require an explicit compatible
contract or a new schema version.

### Evidence identity, status, and records

`EvidenceId` is a separately branded opaque string, non-empty, non-blank, and
without surrounding whitespace. It is not interchangeable with `EntityId`,
`CanonicalId`, or `ProviderFactId`. Parsing preserves its exact value and never
trims, derives, or interprets identity from Provider identity or source content.

`EvidenceStatus` is exactly `ACTIVE | SUPERSEDED | INVALIDATED`. `ACTIVE`
means the observation is available as support. `SUPERSEDED` means a later
observation replaced it without asserting that the older observation was false.
`INVALIDATED` means it must not be treated as reliable support. Both non-active
states retain provenance; neither state deletes a record or determines a
Canonical Fact's existence or Confidence.

The strict records contain exactly these required fields:

```ts
interface Evidence {
  id: EvidenceId;
  repositoryId: EntityId;
  revisionId: EntityId;
  providerSnapshotId: EntityId;
  providerFact: ProviderFactRef;
  status: EvidenceStatus;
}

interface FactEvidence {
  fact: CanonicalFactRef;
  evidenceId: EvidenceId;
}

interface ProviderFactBinding {
  providerFact: ProviderFactRef;
  providerSnapshotId: EntityId;
  canonicalFact: CanonicalFactRef;
  evidenceId: EvidenceId;
}
```

Unknown keys, missing fields, explicit `undefined`, and `null` are invalid.
The existing strict `ProviderFactRef` and `CanonicalFactRef` contracts preserve
their distinct identity families and accept both `NODE` and `EDGE` references.
`ProviderFactBinding.providerFact.factType` must equal
`canonicalFact.factType`; a mismatch is rejected at
`['canonicalFact', 'factType']`.

`FactEvidence` and `ProviderFactBinding` remain separate relations.
`FactEvidence` connects a Canonical Fact to an Evidence ID without introducing
Provider identity into the Canonical Fact. `ProviderFactBinding` records the
Provider-to-Canonical mapping together with its Evidence ID and observation
snapshot. Two Providers may support one Canonical Fact through distinct
Evidence records and separate relation rows. One support may be non-active
while another remains `ACTIVE`; neither relation embeds a support array in the
Canonical Fact or selects a Provider as canonical authority.

Evidence does not duplicate Provider Fact Confidence or SourceRange, or
ProviderSnapshot timestamps. It has no raw Provider payload, source text,
diagnostic prose, arbitrary metadata, or generic `EntityRef` source escape hatch.

### Pure lifecycle transition

`validateEvidenceTransition(previous: unknown, next: unknown): Evidence`
parses both inputs and returns the validated next Evidence or throws
`IrValidationError`. It performs no I/O, mutation, clock read, or persistence.
After both records parse, `id`, `repositoryId`, `revisionId`,
`providerSnapshotId`, and the exact `providerFact` tuple
`(factType, providerId, providerFactId)` must remain equal, in that check order.
Identity and source checks precede status checks. Transition violations have
paths rooted at `['next', ...]`; malformed input records retain their schema
validation paths.

| Previous status | Allowed next statuses |
|---|---|
| `ACTIVE` | `ACTIVE`, `SUPERSEDED`, `INVALIDATED` |
| `SUPERSEDED` | `SUPERSEDED` |
| `INVALIDATED` | `INVALIDATED` |

Same-status transitions are idempotent only when identity and provenance are
unchanged. Both non-active statuses are terminal: reactivation and transitions
between terminal statuses are rejected. A new observation uses a new Evidence
ID rather than recycling a terminal record. Validation of the declared
transition does not prove that replacement Evidence exists or a ProviderSnapshot
succeeded, and failure returns no partially accepted Evidence.

### Validation, versioning, and later responsibilities

The schemas preserve exact JSON values without coercion, unknown-key stripping,
status promotion, or relationship repair. Through `parseIr` and the transition
helper, invalid IDs, enums, record fields, fact-type mismatches, and illegal
transitions raise `IR_VALIDATION_FAILED` with structured paths and controlled
messages of at most 128 characters that do not echo rejected values. Direct Zod
schema composition retains Zod's own error interface, as specified under
Compatibility.

The three record payloads use the Common IR exact-version envelope contract.
Version-1 Fixture descriptors exercise both `parseSchemaEnvelope` and
`createSchemaEnvelopeSchema`, including JSON round-trips, structured-payload
rejection, and schema-before-version-before-payload precedence.
`SCHEMA_MISMATCH` and `UNSUPPORTED_SCHEMA_VERSION` retain their existing
meaning. These descriptors are test-local; this task introduces no production
schema registry, IPC schema name, or version adapter.

Relation-row uniqueness, referenced-record existence, consistency between
Evidence and binding source tuples, and repository/revision/snapshot integrity
across records require later application/storage context. P0-W1-006 owns
repository Evidence persistence under the SQLite Schema specification; SQLite
remains the authoritative store when implemented, and P0-W1-004 implements no
tables, migrations, transactions, or writes. P05-W4-002 owns support
recomputation, FactMerger behavior, Confidence aggregation, and support-based
Canonical Fact lifetime. This task neither derives IDs nor creates, normalizes,
merges, activates, or publishes facts or Knowledge.

The `p0-evidence-ir-v1` Fixture and its runtime and brand tests are mapped in
`DESIGN_TRACEABILITY.md`. Its acceptance is
`One canonical fact retains independent supports`. This proves representation
and independent lifecycle, not the later storage or FactMerger lifetime decision.

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

The JSON boundary rejects circular references with the path of the circular
edge; shared acyclic children are allowed. JSON safety is checked before and
after the supplied payload schema in both `createSchemaEnvelopeSchema` and
`parseSchemaEnvelope`. Payload schemas must preserve the input's JSON value:
changes in type, value, or object fields are rejected, including stripping or
in-place mutation. A new object with the same fields and values is allowed;
object key order is immaterial. No payload transform runs before the helper's
schema-name and version checks pass.

The public typed failures are `IR_VALIDATION_FAILED` for primitive, envelope,
or payload violations, `SCHEMA_MISMATCH` for an unexpected schema name, and
`UNSUPPORTED_SCHEMA_VERSION` for an unsupported version. Validation failures
retain structured field paths and controlled messages of at most 128 characters
per issue. Typed parsing helpers select fixed messages by issue category rather
than copying arbitrary Zod or custom-refinement prose, including rejected key
names or values. They do not retain raw rejected payloads. Direct Zod schemas
remain available for composition; this typed-error policy does not replace
Zod's own error interface.

P0-W1-001 supports exact version matching only. It adds no implicit adapter,
downgrade, upgrade, provider-extension coercion, or best-effort normalization.
Unknown enum values and unknown strict-object keys are rejected at the public
boundary. Breaking changes require an ADR, migration path, fixture updates, and
a major schema version.
