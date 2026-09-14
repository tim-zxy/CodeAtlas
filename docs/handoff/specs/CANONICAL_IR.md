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

