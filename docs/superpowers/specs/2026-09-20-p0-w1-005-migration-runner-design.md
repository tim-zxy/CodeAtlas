# P0-W1-005 Migration Runner Design

## Status

Approved in conversation on 2026-09-20. This document is the implementation design for
`P0-W1-005 Migration runner`; it does not mark the task complete.

## Governing authority

- `docs/handoff/adr/ADR-003-sqlite-authority-derived-indexes.md`
- `docs/handoff/adr/ADR-011-repo-workspace-database-split.md`
- `docs/handoff/adr/ADR-012-evaluation-phase-gate.md`
- `docs/handoff/specs/SQLITE_SCHEMA.md`
- `docs/handoff/specs/MODULE_BOUNDARIES.md`
- `docs/handoff/PHASE_ACCEPTANCE.md`
- `docs/handoff/WORK_BREAKDOWN.md`
- `docs/handoff/DESIGN_TRACEABILITY.md`

## Intent

Provide the storage-owned migration mechanism that later repository and workspace schema tasks
can use without weakening SQLite authority, transaction safety, or the repository/workspace
database split. The runner must prove that a valid database advances only through declared,
immutable, checksummed migrations and that a failed, competing, corrupted, or incompatible run
does not advertise an unapplied version.

The task is complete only when its unit tests, declared Fixtures, full workspace gates,
Architecture Guardrails, documentation, and fresh status evidence all pass. Code alone is not
completion.

## Compatibility and authority classification

This task implements accepted decisions; it does not amend them.

- SQLite remains the authoritative local state store.
- Repository and workspace databases keep separate manifests and version lines.
- SQL and migration ownership stays in `@codeatlas/storage`.
- Rust and Providers gain no SQLite dependency or database mutation path.
- FTS5 and any future vector index remain derived concerns and are not introduced here.
- No accepted ADR, Frozen invariant, Phase Acceptance threshold, or Canonical IR schema changes.

The exact manifest shape, checksum canonicalization, and typed migration errors below are a
compatible elaboration of the existing Migration Mechanics section in `SQLITE_SCHEMA.md`.

## Scope

P0-W1-005 includes:

- strict repository and workspace migration manifests;
- immutable SQL migration-file loading and SHA-256 verification;
- `PRAGMA user_version` compatibility and progress tracking;
- ordered, gap-free migration planning;
- SQLite write-lock acquisition and bounded lock failure;
- one transaction per migration;
- rerun and concurrent-run safety;
- rollback of the failing migration and its `user_version` update;
- stable typed errors, including `DATABASE_TOO_NEW`;
- executable `migration-empty`, `migration-upgrade`, `migration-failure`, and
  `database-too-new` Fixtures;
- explicit lock-contention and checksum-mismatch checks within the declared Fixture suite.

P0-W1-005 excludes:

- repository migrations R001-R007, owned by P0-W1-006;
- workspace migrations W001-W003, owned by P0-W1-007;
- repository or workspace business tables, indexes, repositories, and query APIs;
- `CanonicalFactStore`, analysis staging, graph activation, or patch application;
- WAL policy, connection pooling, database discovery, and runtime composition;
- performing backups or copying database files;
- FTS5 tables, embeddings, Zvec, or any derived-index rebuild;
- Provider execution, Native IPC, Java parsing, Knowledge, LLM, daemon, or network behavior;
- Phase 0.5 and Phase 1+ capabilities.

The checked-in repository and workspace manifests therefore start at version zero with empty
`migrations` arrays. Later tasks append their owned migrations without changing runner semantics.

## Technology decision

Use the Node 24 built-in `node:sqlite` `DatabaseSync` API inside `@codeatlas/storage`.

Reasons:

- the repository already pins Node `>=24 <25`;
- SQLite remains local and storage-owned without adding an ORM;
- no additional native addon, installer, ABI, or package lifecycle is introduced;
- the API exposes a connection busy timeout, `exec`, prepared statements, and transaction state;
- synchronous database calls make it possible to guarantee that no asynchronous callback occurs
  while a migration transaction is open.

Manifest and migration files are loaded and validated before the first transaction. Once database
application begins, the migration loop performs no network call, LLM call, Native Analyzer call,
backup callback, or other asynchronous work.

## File structure

The implementation should keep responsibilities focused:

- `packages/storage/src/migrations/types.ts`: public manifest, result, and database-kind types.
- `packages/storage/src/migrations/errors.ts`: stable migration error codes and error class.
- `packages/storage/src/migrations/manifest.ts`: JSON shape validation, safe path resolution,
  canonical SQL decoding, and checksum verification.
- `packages/storage/src/migrations/runner.ts`: version compatibility, locking, transaction, and
  rerun behavior.
- `packages/storage/src/migrations/index.ts`: focused migration exports.
- `packages/storage/src/index.ts`: package-level re-exports only.
- `packages/storage/migrations/repository/manifest.json`: empty Phase 0 repository manifest.
- `packages/storage/migrations/workspace/manifest.json`: empty Phase 0 workspace manifest.
- `packages/storage/test/migration-runner.test.mjs`: unit and real-SQLite behavior tests.
- `fixtures/storage/migrations/cases.json`: authoritative P0-W1-005 Fixture index.
- `fixtures/storage/migrations/<fixture-id>/`: immutable scenario manifests and SQL inputs.

Production migration manifests and SQL files are package assets. `packages/storage/package.json`
must publish/copy them with the built package even though this repository is currently private.

## Manifest contract

The version-1 JSON contract is:

```ts
type MigrationDatabaseKind = 'REPOSITORY' | 'WORKSPACE';

interface MigrationManifestV1 {
  readonly schemaVersion: 1;
  readonly databaseKind: MigrationDatabaseKind;
  readonly migrations: readonly MigrationManifestEntryV1[];
}

interface MigrationManifestEntryV1 {
  readonly version: number;
  readonly name: string;
  readonly file: string;
  readonly checksum: `sha256:${string}`;
  readonly backupRequired: boolean;
}
```

Validation is strict and rejects unknown, missing, or explicitly `undefined` fields when called
from TypeScript. JSON input additionally rejects invalid JSON before shape validation.

Contract rules:

- `schemaVersion` is exactly `1`.
- `databaseKind` is exactly `REPOSITORY` or `WORKSPACE` and must match the runner request.
- `migrations` may be empty; otherwise versions are safe positive integers contiguous from `1`.
- entries are ordered by ascending version in the file; the loader does not silently sort them.
- names are non-empty, trimmed, unique strings.
- files are non-empty, trimmed, unique POSIX-relative paths.
- absolute paths, backslashes, empty segments, `.` segments, and `..` segments are rejected.
- the resolved file must remain below the manifest directory.
- checksum syntax is `sha256:` followed by exactly 64 lowercase hexadecimal characters.
- `backupRequired` is required even when false.
- the latest supported database version is the last entry version, or `0` for an empty manifest.

A repository manifest cannot be passed to a workspace runner or vice versa. This is checked before
opening a transaction.

## Canonical SQL and checksum rules

Migration SQL is decoded as strict UTF-8. Invalid byte sequences and UTF-8 BOMs are rejected.

To keep manifests stable across Git checkout policies and operating systems:

1. decode strict UTF-8;
2. normalize CRLF and standalone CR to LF;
3. do not trim, append a newline, or otherwise rewrite the text;
4. encode the normalized text as UTF-8;
5. calculate SHA-256 over those canonical bytes;
6. compare with the manifest using a constant-time byte comparison;
7. execute the same canonical text that was checksummed.

Every file in the manifest is decoded and checksummed before any migration transaction begins,
including already-applied files. A changed published migration therefore blocks the run before
database mutation. `user_version` records progression; it does not excuse a checksum mismatch.

## Public operation

The public entry point is asynchronous only for manifest/file loading:

```ts
interface RunMigrationsRequest {
  readonly databasePath: string;
  readonly databaseKind: MigrationDatabaseKind;
  readonly manifestUrl: URL;
  readonly lockTimeoutMs?: number;
}

interface MigrationRunResult {
  readonly databaseKind: MigrationDatabaseKind;
  readonly initialVersion: number;
  readonly finalVersion: number;
  readonly appliedVersions: readonly number[];
}

function runMigrations(request: RunMigrationsRequest): Promise<MigrationRunResult>;
```

Rules:

- `databasePath` must be a non-empty explicit path or `:memory:`; the runner does not discover it.
- `lockTimeoutMs` defaults to `0` for deterministic contention behavior and must be a finite,
  non-negative safe integer.
- the runner owns and closes the connection it opens.
- result objects and `appliedVersions` are frozen before return.
- the connection closes on success and every failure path.
- no partially constructed result escapes.

The API does not accept arbitrary SQL, caller-owned migration objects, or a caller-owned open
connection. Fixture-only helpers may exercise an open connection internally but are not exported.

## Backup-required entries

The manifest records `backupRequired`, but P0-W1-005 does not invent a backup storage policy or
perform filesystem copying inside a transaction. If any pending entry has
`backupRequired: true`, the runner fails before lock acquisition with
`MIGRATION_BACKUP_REQUIRED`, naming the first required version. No current Phase 0 manifest uses
`true`.

A later task may add an application-owned, evidence-bearing backup workflow before such a
migration is published. That change must preserve version revalidation under the SQLite write lock
and must not perform a long external call inside the transaction.

## Version and transaction algorithm

After complete manifest preflight:

1. Open the SQLite connection with foreign keys enabled, extensions disabled, and the requested
   busy timeout.
2. Read `PRAGMA user_version` as a safe non-negative integer.
3. If it exceeds the manifest latest version, fail `DATABASE_TOO_NEW` with no transaction.
4. Record it as `initialVersion`.
5. Select the next entry at `currentVersion + 1`.
6. Execute `BEGIN IMMEDIATE` to acquire the SQLite write lock.
7. Re-read `user_version` inside the transaction.
8. If another successful runner advanced it, roll back the empty transaction, update the observed
   version, repeat the too-new check, and re-plan without replaying the migration.
9. If the locked version is not exactly the selected entry's predecessor and is not a legitimate
   concurrent advance, roll back and fail `MIGRATION_VERSION_CHANGED`.
10. Execute the selected canonical SQL.
11. Confirm the connection is still in the runner-owned transaction.
12. Set `PRAGMA user_version` to the validated literal migration version.
13. Re-read and require the exact new version.
14. Commit and append the version to `appliedVersions`.
15. Continue until the database and manifest versions match.

Each migration is an independent transaction. If version 1 commits and version 2 fails, version 1
remains committed, version 2 is rolled back, and `user_version` remains `1`. A corrected future run
starts from version 2. This is the specified sequential-upgrade and rerun behavior; the runner does
not roll back previously successful published migrations.

Migration SQL must not control transactions or write `user_version`. The implementation uses the
SQLite authorizer during migration execution to reject transaction-control operations and
`PRAGMA user_version`, then restores the runner's authorizer state. This prevents a migration from
committing independently or advertising its version before runner validation.

## Lock behavior

`BEGIN IMMEDIATE` is the migration lock. No lock table, process mutex, PID file, or network lease is
introduced.

- SQLite serializes writers for the database file.
- `lockTimeoutMs` bounds how long the connection waits.
- SQLite busy/locked failures during acquisition map to `MIGRATION_LOCKED`.
- the runner never deletes, steals, or waits indefinitely for a lock.
- after acquiring the lock it re-reads `user_version`, so two runners cannot both apply the same
  version even if both planned from the same initial state.

## Error model

`StorageMigrationError` contains a stable `code`, human-readable `message`, and optional structured
details. It preserves the original error as `cause` without exposing raw SQL in the message.

Required codes:

- `MIGRATION_MANIFEST_INVALID`
- `MIGRATION_DATABASE_KIND_MISMATCH`
- `MIGRATION_FILE_INVALID`
- `MIGRATION_CHECKSUM_MISMATCH`
- `MIGRATION_BACKUP_REQUIRED`
- `DATABASE_VERSION_INVALID`
- `DATABASE_TOO_NEW`
- `MIGRATION_LOCKED`
- `MIGRATION_VERSION_CHANGED`
- `MIGRATION_TRANSACTION_ESCAPED`
- `MIGRATION_FAILED`

Manifest/file/checksum/backup failures occur before mutation. A database compatibility failure does
not start a migration transaction. SQL, authorizer, postcondition, or commit failures trigger a
rollback whenever the connection still owns a transaction. If rollback itself fails, the primary
error remains `MIGRATION_FAILED` and the rollback failure is retained in structured details or
cause context; success is never reported.

## Fixtures and Evaluation

`fixtures/storage/migrations/cases.json` is the authoritative Fixture index and contains:

```json
{
  "schemaVersion": 1,
  "id": "p0-migration-runner-v1",
  "task": "P0-W1-005",
  "governingSpec": "docs/handoff/specs/SQLITE_SCHEMA.md",
  "acceptance": "Sequential, rollback, rerun, lock, checksum gates",
  "cases": [
    "migration-empty",
    "migration-upgrade",
    "migration-failure",
    "database-too-new"
  ]
}
```

Fixture ownership:

- `migration-empty`: both empty production-kind manifests leave a new database at version 0; kind
  mismatch and strict-manifest boundaries fail without mutation.
- `migration-upgrade`: fresh-to-latest, each sequential boundary, rerun with no replay, concurrent
  advance recheck, canonical LF checksum behavior, checksum mismatch with zero mutation, and lock
  contention with a second connection.
- `migration-failure`: the failing migration's DDL/data and `user_version` roll back; a previously
  committed version remains usable; transaction-control, `user_version`, and backup-required
  attempts fail safely.
- `database-too-new`: a database above the manifest maximum returns `DATABASE_TOO_NEW`, preserves
  its version and rows, and performs no migration SQL.

Tests use real temporary SQLite files rather than an in-memory fake for transaction, lock, and
cross-connection behavior. Temporary directories are unique per test and are removed only after
all database connections close.

The focused command will be:

```text
pnpm --filter @codeatlas/storage build && node --test packages/storage/test/migration-runner.test.mjs
```

The root `test` script must include the focused storage suite so `pnpm verify` covers it in CI.

## Architecture Guardrails

The implementation must demonstrate:

- `node:sqlite`, SQL, and migration files occur only in `@codeatlas/storage` and storage Fixtures;
- apps do not import the concrete runner;
- Runtime/Application composition is not added in this task;
- no Rust manifest gains any SQLite dependency or feature;
- no package above storage receives a concrete SQLite type;
- no transaction contains asynchronous, network, LLM, or Native Analyzer work;
- no Canonical IR identity is derived from database row IDs or migration versions;
- no Phase 0.5 or later table, knowledge model, projection, or derived vector index is created.

Existing architecture tests and the real-workspace dependency check remain mandatory.

## Documentation and traceability

At implementation completion:

- refine the Migration Mechanics section of `SQLITE_SCHEMA.md` with the manifest/checksum/error
  behavior actually implemented;
- update the P0-W1-005 row in `DESIGN_TRACEABILITY.md` with exact Fixture and test paths without
  changing its task, governing spec, or acceptance meaning;
- append `CURRENT_STATUS.md` with task ID, commit, exact commands, Fixture counts, transaction and
  failure evidence, schema-version impact, Architecture Guardrail audit, Deferred-scope audit,
  known limitations, hosted CI status, and next unblocked task;
- do not modify ADR-003, ADR-011, ADR-012, or Phase Acceptance unless implementation evidence shows
  a real design conflict and the governed design-change process is followed first.

## Completion gates

P0-W1-005 is complete only when all of the following have fresh evidence:

- production implementation is complete;
- focused unit and Fixture tests pass;
- all four declared Fixture scenarios pass;
- sequential, failure rollback, rerun, lock, checksum, and too-new assertions pass;
- `pnpm verify` passes without weakening prior tests or gates;
- architecture dependency checks pass;
- no Deferred capability or P0-W1-006/P0-W1-007 schema is present;
- changed documentation and traceability agree;
- `CURRENT_STATUS.md` is updated;
- the exact final SHA has hosted CI evidence before claiming hosted completion.

## Implementation risks to pin in the plan

- Windows checkout line endings must not invalidate a canonical SQL checksum.
- a second runner may advance `user_version` between preflight and lock acquisition.
- migration SQL may try to escape the runner-owned transaction or write `user_version`.
- SQLite busy/locked errors may occur at acquisition or commit and must never be reported as
  success.
- a manifest may be structurally valid JSON while containing unsafe paths, duplicate files,
  version gaps, or a database-kind mismatch.
