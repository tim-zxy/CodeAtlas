# P0-W1-002 Source and Revision IR Design

**Date:** 2026-09-14  
**Status:** Approved for implementation planning  
**Task:** P0-W1-002 Source and revision IR  
**Phase:** Phase 0

## Purpose

Define the smallest schema-first, provider-independent Source IR contract that later repository discovery, source scanning, native analysis, Provider SPI, storage, and incremental reconciliation can share. The task adds Repository, Revision, SourceFile, and ProviderSnapshot schemas plus pure relationship validators. It proves that a mutable worktree identity behaves differently from immutable commit and snapshot identities without implementing discovery, persistence, analysis, or activation.

## Governing authority

- `docs/handoff/adr/ADR-002-provider-independent-canonical-ir.md`
- `docs/handoff/adr/ADR-003-sqlite-authority-derived-indexes.md`
- `docs/handoff/adr/ADR-011-repo-workspace-database-split.md`
- `docs/handoff/adr/ADR-012-evaluation-phase-gate.md`
- `docs/handoff/specs/CANONICAL_IR.md`
- `docs/handoff/specs/MODULE_BOUNDARIES.md`
- `docs/handoff/specs/SECURITY.md`
- `docs/handoff/specs/SQLITE_SCHEMA.md`
- `docs/handoff/WORK_BREAKDOWN.md`, task P0-W1-002
- `docs/handoff/PHASE_ACCEPTANCE.md`, Phase 0 Canonical schema gate
- `docs/handoff/DESIGN_TRACEABILITY.md`, P0-W1-002 row

This design fills a field-level gap in the existing Source IR section. It is a compatible extension of ADR-002 and does not change a frozen decision, storage ownership, phase boundary, or published schema version. No new ADR is required.

## Scope

### Included

- strict Zod schemas and inferred TypeScript types for Repository, the three Revision variants, SourceFile, SourceFile classification, ProviderSnapshot, capability observations, and safe diagnostics;
- branded opaque strings for repository roots, repository-relative paths, content fingerprints, commit identities, Provider IDs, and versions;
- pure validation of revision transitions and ProviderSnapshot-to-Revision matching;
- JSON round-trip, boundary, identity, and relationship fixtures under `p0-source-revision-ir-v1`;
- compile-time brand-separation tests;
- root test registration and controlling documentation updates.

### Excluded

- Workspace and RevisionSet entities or frozen RevisionSet persistence;
- Git discovery, branch/HEAD inspection, recursive scanning, ignore handling, classification detection, binary detection, fingerprint calculation, or change detection;
- Provider or Plugin SPI, provider execution, routing, normalization, FactMerger, evidence, code facts, or graph activation;
- SQLite tables, migrations, repositories, transactions, staging, or active-revision mutation;
- Native IPC, Rust schema consumers, Java parsing, network, watchers, daemon behavior, LLMs, embeddings, Knowledge, or Phase 1+ behavior;
- rename identity tracking. Phase 0.5 may represent a rename as delete plus add.

## Design principles

1. All public Source IR schemas are strict, JSON-safe, and provider-independent.
2. Stable IDs are assigned opaque identities. Paths, Provider IDs, fingerprints, names, and model text never generate or substitute for EntityId or CanonicalId.
3. Revision kind is an explicit discriminant. Illegal cross-kind field combinations are structurally unrepresentable.
4. Mutable identity and immutable content are separate concepts. A worktree keeps one identity while its observed content changes; a commit or snapshot cannot change under the same identity.
5. ProviderSnapshot records an immutable observation attempt, not Canonical activation or truth.
6. Optional wire semantics use explicit `null` where absence is meaningful. Explicit `undefined` and silently stripped keys are rejected.
7. This task accepts precomputed paths, fingerprints, classifications, and observations. Their discovery algorithms remain in later tasks.

## Package structure

```text
packages/ir/
  src/
    source-identity.ts
    repository.ts
    revision.ts
    source-file.ts
    provider-snapshot.ts
    index.ts
  test/
    source-revision-ir.test.mjs
  type-test/
    source-revision-brands.test.ts
fixtures/
  ir/
    source-revision-v1/
      cases.json
      valid/cases.json
      invalid/cases.json
```

The implementation uses the file split above. Every public schema and type is exported from `@codeatlas/ir`, and the package retains no dependency on another project package.

## Supporting scalar contracts

All supporting strings are non-empty, non-blank, and free of leading or trailing whitespace. Parsing rejects rather than trims.

- `RepositoryRootPath`: opaque host-local repository root locator. P0-W1-002 does not normalize host path syntax or use the root as identity.
- `RepositoryRelativePath`: canonical `/`-separated path. It rejects leading `/`, trailing `/`, `\\`, empty segments, `.` segments, `..` segments, NUL, and surrounding whitespace. It performs no rewriting.
- `ContentFingerprint`: opaque precomputed content/revision fingerprint. The hash algorithm and encoding remain outside this task.
- `CommitIdentity`: opaque source-control commit identity. No SHA length or algorithm is assumed.
- `ProviderId`: opaque Provider identity, branded separately from EntityId and CanonicalId.
- `ProviderVersion` and `RuntimeVersion`: opaque exact versions; no semantic-version coercion is performed.

## Repository

`Repository` is a strict object containing:

- `id: EntityId` — stable repository identity;
- `rootPath: RepositoryRootPath` — local locator independent from a workspace root.

Repository has no workspace ID because a repository can be registered by more than one workspace. Root relocation does not authorize regenerating the repository ID. Display names and source-control discovery metadata remain outside this contract.

## Revision

`RevisionKind` is exactly `COMMIT | WORKTREE | SNAPSHOT`. `Revision` is a strict discriminated union. Every variant contains:

- `id: EntityId`;
- `repositoryId: EntityId`;
- `kind`;
- `contentFingerprint: ContentFingerprint`.

Variant-specific fields are:

- `CommitRevision`: `kind: COMMIT`, `commitIdentity: CommitIdentity`;
- `WorktreeRevision`: `kind: WORKTREE`, `baseRevisionId: EntityId | null`;
- `SnapshotRevision`: `kind: SNAPSHOT`, `sourceRevisionId: EntityId | null`.

An explicit `null` means that the base or source revision is not known in the current repository context. An explicit `undefined` is invalid. Fields belonging to another revision variant are unknown keys and fail validation.

### Revision transition semantics

`validateRevisionTransition(previous, next)` is a pure validator returning the validated `next` revision or throwing `IrValidationError`.

- Both values must have the same repository ID, revision ID, and revision kind to describe an update of one identity.
- `WORKTREE` may change `contentFingerprint` and `baseRevisionId` under that stable identity.
- Identical `COMMIT` and `SNAPSHOT` values are valid idempotent observations.
- Any field change under the same `COMMIT` or `SNAPSHOT` identity is rejected.
- A different ID, repository, or kind is a different revision identity, not a transition.

The validator performs no persistence or optimistic concurrency. Later stores must enforce the same rule when mutations are introduced.

## SourceFile

`SourceFile` is a strict revision-scoped representation containing:

- `id: EntityId` — stable logical-path identity within one repository;
- `repositoryId: EntityId`;
- `revisionId: EntityId`;
- `path: RepositoryRelativePath`;
- `contentFingerprint: ContentFingerprint`;
- `classification`;
- `languageHint: string | null` — an open, exact, non-blank hint such as a language identifier, not a Provider enum;
- `sensitivity: PUBLIC | INTERNAL | SENSITIVE | SECRET` from the Security specification.

`classification` is a strict object with orthogonal dimensions:

- `role: SOURCE | TEST | OTHER`;
- `provenance: AUTHORED | GENERATED | VENDOR`;
- `contentKind: TEXT | BINARY`.

P0-W1-002 validates declared values only. Phase 0.5 source scanning determines them. The same SourceFile ID may appear at different revisions with different path-scoped content fingerprints. Rename tracking is not inferred; Phase 0.5 may emit delete plus add.

## ProviderSnapshot

`ProviderSnapshot` is a strict immutable run record containing:

- `id: EntityId`;
- `repositoryId: EntityId`;
- `providerId: ProviderId`;
- `providerVersion: ProviderVersion`;
- `runtimeVersion: RuntimeVersion`;
- `requestedRevisionId: EntityId`;
- `requestedRevisionFingerprint: ContentFingerprint`;
- `startedAt: UtcInstant`;
- `completedAt: UtcInstant`;
- `capabilities: ProviderCapabilityObservation[]`;
- `diagnostics: ProviderSnapshotDiagnostic[]`;
- `outcome: SUCCEEDED | PARTIAL | FAILED | CANCELLED`.

Completion must not precede start. Capability names are open exact strings and must be unique within one snapshot. Each capability observation contains:

- `name`;
- `support: SUPPORTED | UNSUPPORTED`;
- `coverage: COMPLETE | PARTIAL | NONE | UNKNOWN`.

Each diagnostic contains:

- exact non-blank `code`;
- `severity: INFO | WARNING | ERROR`;
- exact non-blank `message` of at most 128 characters;
- `sourceRange: SourceRange | null`.

Diagnostics do not retain Provider-native objects, source text, secrets, stack traces, or unrestricted prose. Their array order is preserved; the schema does not infer outcome from diagnostic severity.

### Requested-revision matching

`validateProviderSnapshotRevision(snapshot, revision)` is a pure validator returning the validated snapshot or throwing `IrValidationError`. It requires equal repository ID, revision ID, and content fingerprint. This prevents a result created for an earlier state of a stable WORKTREE identity from being treated as matching its newer content. The helper does not activate facts or write state; later application workflows must call an equivalent validated boundary before atomic application.

## Errors and JSON behavior

All entities compose the Common IR JSON boundary. Unknown keys, invalid discriminants, non-JSON values, negative zero, explicit undefined, and non-canonical strings fail without coercion. Public helpers reuse `IR_VALIDATION_FAILED`, structured paths, bounded controlled messages, and no raw rejected payload retention.

No new error-code family is introduced. Revision-transition errors identify the changed identity or immutable field under `next`. Snapshot matching errors identify the mismatched snapshot field. Tests assert codes and paths rather than entire prose.

Accepted entities and helper outputs must remain deeply equal after `JSON.stringify`, JSON parse, and validation. TypeScript brands have no runtime representation.

## Envelope behavior

P0-W1-002 reuses the versioned Common IR envelope and exact validation order. Entity fixtures exercise Repository, Revision, SourceFile, and ProviderSnapshot payload schemas through schema-specific test descriptors using version 1. The task does not introduce an implicit global schema registry, adapter, or IPC envelope name. Production IPC names and compatibility negotiation remain P0-W3-001 scope.

## Fixture design

The canonical Fixture ID is `p0-source-revision-ir-v1`. It is a task-local executable fixture index, not the registry manifest deferred to P0-W9-001.

Valid cases cover:

- Repository and root relocation without changing repository ID;
- COMMIT, WORKTREE, and SNAPSHOT JSON round-trips;
- an idempotent immutable revision observation;
- one WORKTREE identity before and after content/base changes;
- SourceFile logical identity across revisions;
- orthogonal SourceFile classification combinations;
- nullable language hints and all four sensitivity levels;
- successful, partial, failed, and cancelled ProviderSnapshot outcomes;
- supported/unsupported capabilities and every coverage state;
- ProviderSnapshot matching the requested immutable or worktree revision.

Invalid cases cover:

- blank, padded, absolute, backslash, empty-segment, dot-segment, parent-traversal, NUL, and trailing-slash paths;
- unknown object keys and explicit undefined values in programmatic regression tests;
- missing or cross-kind Revision fields;
- changes to COMMIT or SNAPSHOT content under one identity;
- WORKTREE transitions that change ID, repository, or kind;
- SourceFile classification, language hint, or sensitivity violations;
- duplicate capability names;
- invalid capability, coverage, outcome, severity, timestamp, and diagnostic boundaries;
- ProviderSnapshot repository, revision ID, or requested fingerprint disagreement.

Compile-time tests prove that ProviderId, ContentFingerprint, RepositoryRelativePath, EntityId, and CanonicalId are not assignable to each other without validation.

## Acceptance and quality gates

P0-W1-002 is complete only when fresh evidence proves:

- focused unit and Fixture tests pass;
- all `p0-source-revision-ir-v1` valid and invalid cases pass;
- WORKTREE mutation and COMMIT/SNAPSHOT immutability cases pass;
- ProviderSnapshot stale-revision matching cases pass;
- all new public types pass compile-time brand tests;
- `@codeatlas/ir` builds independently;
- full `pnpm verify` passes, including all TypeScript projects, Rust formatting/build/Clippy/tests, and the 17-project architecture check;
- hosted TypeScript and Rust CI succeeds for the final revision;
- no Deferred capability, architecture violation, weakened gate, or removed baseline is present;
- Canonical IR, traceability, Fixture records, and `CURRENT_STATUS.md` are synchronized.

The completion record must name P0-W1-002, `p0-source-revision-ir-v1`, the Canonical IR specification, the `Mutable and immutable revision semantics differ` acceptance result, exact commands and pass counts, schema impact, failure behavior, limitations, revisions, hosted CI, and next unblocked task.

## Documentation and traceability

Implementation expands the Source IR section of `CANONICAL_IR.md` with the approved field and relationship contracts. `DESIGN_TRACEABILITY.md` names `p0-source-revision-ir-v1` while retaining the existing task, acceptance, and governing specification. `CURRENT_STATUS.md` changes only with fresh reproducible evidence.

This design is a compatible addition under ADR-002. If implementation evidence requires deriving canonical IDs from paths or Provider identities, weakening immutability, changing the security classification, introducing storage mutation, or expanding a Deferred phase capability, implementation stops for governed design review rather than altering tests or gates.

## Failure, recovery, and security

All operations are pure parsing or relationship validation. Failure returns no partial value and mutates no database, active graph, Provider state, or published knowledge. No rollback mechanism is needed in this task.

Repository roots and paths are validated but never accessed. ProviderSnapshot diagnostics are bounded and contain no raw Provider payload. The task reads no environment variables, spawns no process, opens no network connection, and persists no secret or source content.
