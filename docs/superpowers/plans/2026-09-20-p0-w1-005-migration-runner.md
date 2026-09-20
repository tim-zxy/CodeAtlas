# P0-W1-005 Migration Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the storage-owned, checksummed SQLite migration runner required by P0-W1-005 and prove sequential upgrade, rollback, rerun, lock, checksum, and too-new behavior with real SQLite Fixtures.

**Architecture:** `@codeatlas/storage` loads and freezes a strict repository or workspace migration plan before opening a transaction. The runner uses Node 24 `node:sqlite`, applies one version per `BEGIN IMMEDIATE` transaction, rechecks `PRAGMA user_version` under the write lock, and owns connection cleanup on every path.

**Tech Stack:** TypeScript 7, Node.js 24 `node:sqlite`, Node test runner, `node:crypto` SHA-256, pnpm 11, real temporary SQLite files.

**Spec:** `docs/superpowers/specs/2026-09-20-p0-w1-005-migration-runner-design.md`

## Global Constraints

- Implement only P0-W1-005. R001-R007, W001-W003, graph activation, Runtime/Application integration, Provider/IPC behavior, Knowledge, LLM, FTS, vectors, and Phase 0.5+ behavior remain absent.
- SQLite and SQL ownership stays in `@codeatlas/storage`; Rust and other TypeScript packages gain no SQLite dependency.
- Use built-in `node:sqlite` on the existing Node `>=24 <25` baseline; add no ORM or native npm addon.
- Manifest schema is exactly version `1`; kinds are exactly `REPOSITORY | WORKSPACE`.
- Versions are safe positive integers, file-ordered, unique, and contiguous from `1`.
- SQL is strict UTF-8, rejects BOM, normalizes CRLF/CR to LF, and is otherwise byte-preserving.
- Verify every declared SQL file and checksum before the first transaction.
- Apply one migration per `BEGIN IMMEDIATE` transaction and update `user_version` only after SQL succeeds.
- Perform no asynchronous, network, LLM, backup, or Native Analyzer work inside a transaction.
- Reject migration-owned transaction control and `PRAGMA user_version` writes.
- Reject a pending `backupRequired: true` entry before mutation; backup orchestration is out of scope.
- Preserve every existing test, Fixture, Quality Gate, Architecture Guardrail, and Frozen decision.

## Review Focus

- Request boundaries: blank/padded database paths and negative, fractional, non-finite, or unsafe lock timeouts must fail before SQLite opens; Task 3 owns these cases.
- Near-valid unsafe manifests: wrong keys/types, duplicates, gaps, unsafe paths, invalid UTF-8/BOM, and malformed checksums must fail before mutation; Task 2 owns these cases.
- Transaction escape: `COMMIT`, `ROLLBACK`, and `PRAGMA user_version` in migration SQL must not leak state or progress; Task 4 owns these cases.
- Resource cleanup: every success and failure test must close connections strongly enough that Windows can immediately remove its temporary directory; Tasks 3 and 4 own these assertions.
- Concurrent advance: a version committed between initial observation and lock acquisition must be re-read and not replayed; Task 4 owns this case.

---

## Shared test support used by Tasks 2-4

Extend `packages/storage/test/migration-runner.test.mjs` imports as the tasks need them:

```js
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
```

Use these exact helpers:

```js
async function createTemporaryDirectory(prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  return {
    directory,
    remove: () => rm(directory, { recursive: true }),
  };
}

async function createDatabasePath() {
  const temporary = await createTemporaryDirectory('codeatlas-migration-db-');
  return {
    databasePath: join(temporary.directory, 'fixture.sqlite'),
    remove: temporary.remove,
  };
}

async function writePlanFixture(t, manifest, files) {
  const temporary = await createTemporaryDirectory('codeatlas-migration-plan-');
  t.after(temporary.remove);
  await writeFile(join(temporary.directory, 'manifest.json'), JSON.stringify(manifest), 'utf8');
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(join(temporary.directory, name), contents);
  }
  return pathToFileURL(join(temporary.directory, 'manifest.json'));
}

function readVersion(database) {
  return database.prepare('PRAGMA user_version').get().user_version;
}

function tableExists(database, name) {
  return (
    database
      .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name)?.present === 1
  );
}

async function assertMigrationError(code, operation) {
  await assert.rejects(operation, (error) => {
    assert.equal(error?.name, 'StorageMigrationError');
    assert.equal(error?.code, code);
    return true;
  });
}
```

### Task 1: Freeze Fixture metadata, public types, and typed errors

**Files:**
- Create: `fixtures/storage/migrations/cases.json`
- Create: `packages/storage/src/migrations/types.ts`
- Create: `packages/storage/src/migrations/errors.ts`
- Create: `packages/storage/src/migrations/index.ts`
- Create: `packages/storage/test/migration-runner.test.mjs`
- Modify: `packages/storage/src/index.ts`

**Interfaces:**
- Consumes: the P0-W1-005 traceability row.
- Produces: migration request/result/manifest types and the closed typed-error family.

- [ ] **Step 1: Add Fixture metadata and failing export tests**

Create `fixtures/storage/migrations/cases.json`:

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

Add tests that deep-equal this complete object and require `StorageMigrationError` and
`runMigrations` to be exported functions from `../dist/index.js`.

- [ ] **Step 2: Run RED**

```powershell
pnpm --filter @codeatlas/storage build
node --test packages/storage/test/migration-runner.test.mjs
```

Expected: Fixture metadata passes; export test fails because both exports are absent.

- [ ] **Step 3: Implement exact public types**

Create `types.ts`:

```ts
export type MigrationDatabaseKind = 'REPOSITORY' | 'WORKSPACE';

export interface MigrationManifestEntryV1 {
  readonly version: number;
  readonly name: string;
  readonly file: string;
  readonly checksum: `sha256:${string}`;
  readonly backupRequired: boolean;
}

export interface MigrationManifestV1 {
  readonly schemaVersion: 1;
  readonly databaseKind: MigrationDatabaseKind;
  readonly migrations: readonly MigrationManifestEntryV1[];
}

export interface RunMigrationsRequest {
  readonly databasePath: string;
  readonly databaseKind: MigrationDatabaseKind;
  readonly manifestUrl: URL;
  readonly lockTimeoutMs?: number;
}

export interface MigrationRunResult {
  readonly databaseKind: MigrationDatabaseKind;
  readonly initialVersion: number;
  readonly finalVersion: number;
  readonly appliedVersions: readonly number[];
}
```

- [ ] **Step 4: Implement the closed error family and exports**

Create `errors.ts` with codes:

```ts
export type StorageMigrationErrorCode =
  | 'MIGRATION_MANIFEST_INVALID'
  | 'MIGRATION_DATABASE_KIND_MISMATCH'
  | 'MIGRATION_FILE_INVALID'
  | 'MIGRATION_CHECKSUM_MISMATCH'
  | 'MIGRATION_BACKUP_REQUIRED'
  | 'DATABASE_VERSION_INVALID'
  | 'DATABASE_TOO_NEW'
  | 'MIGRATION_LOCKED'
  | 'MIGRATION_VERSION_CHANGED'
  | 'MIGRATION_TRANSACTION_ESCAPED'
  | 'MIGRATION_FAILED';
```

`StorageMigrationError` extends `Error`, freezes `code` and a copied
`Readonly<Record<string, string | number | boolean>>`, accepts optional `cause`, sets name exactly
`StorageMigrationError`, and freezes the instance. Export it and all public types from both index
files. Add a temporary `runMigrations` export that throws code `MIGRATION_FAILED` with message
`Migration runner is not implemented`; Task 3 replaces the temporary body.

- [ ] **Step 5: Run GREEN and commit**

```powershell
pnpm --filter @codeatlas/storage build
node --test packages/storage/test/migration-runner.test.mjs
pnpm exec prettier --write fixtures/storage/migrations/cases.json packages/storage/src packages/storage/test/migration-runner.test.mjs
git diff --check
git add fixtures/storage/migrations/cases.json packages/storage/src packages/storage/test/migration-runner.test.mjs
git commit -m "feat(storage): define migration contracts"
```

### Task 2: Validate manifests and canonical SQL checksums

**Files:**
- Create: `packages/storage/src/migrations/manifest.ts`
- Create: `fixtures/storage/migrations/migration-empty/repository-manifest.json`
- Create: `fixtures/storage/migrations/migration-empty/workspace-manifest.json`
- Create: `fixtures/storage/migrations/migration-upgrade/manifest.json`
- Create: `fixtures/storage/migrations/migration-upgrade/001-create-probe.sql`
- Create: `fixtures/storage/migrations/migration-upgrade/002-add-revision.sql`
- Modify: `packages/storage/src/migrations/index.ts`
- Modify: `packages/storage/test/migration-runner.test.mjs`

**Interfaces:**
- Consumes: Task 1 manifest types and errors.
- Produces: `LoadedMigration`, `LoadedMigrationPlan`, and `loadMigrationPlan(URL, kind)`.

- [ ] **Step 1: Add immutable Fixture files**

Empty manifests use kind `REPOSITORY` and `WORKSPACE`, respectively, with empty migration arrays.

`001-create-probe.sql` contains one LF-terminated line:

```sql
CREATE TABLE migration_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
```

Checksum: `sha256:755e9ebfe0d0a94b522656969191fa06cbd9956baa1b8edb2d71c764a680eb10`.

`002-add-revision.sql` contains:

```sql
ALTER TABLE migration_probe ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
INSERT INTO migration_probe (id, value) VALUES (1, 'ready');
```

Checksum: `sha256:9f8fbdb113edfabba6898a298114045b55e63d1fd6526d9063941ca79e918897`.

The upgrade manifest declares versions 1 and 2 in that order, names `create_probe` and
`add_revision`, these file names/checksums, and `backupRequired: false` for both.

- [ ] **Step 2: Add RED loader tests**

Require the valid plan to be deeply frozen, latest version `2`, and SQL text exactly LF-normalized.
Using `writePlanFixture`, write CRLF and CR-only copies with unchanged checksums and require both to
load.

Use these exact base entries to materialize invalid manifests:

```js
const firstEntry = {
  version: 1,
  name: 'create_probe',
  file: '001-create-probe.sql',
  checksum: 'sha256:755e9ebfe0d0a94b522656969191fa06cbd9956baa1b8edb2d71c764a680eb10',
  backupRequired: false,
};
const secondEntry = {
  version: 2,
  name: 'add_revision',
  file: '002-add-revision.sql',
  checksum: 'sha256:9f8fbdb113edfabba6898a298114045b55e63d1fd6526d9063941ca79e918897',
  backupRequired: false,
};
```

Assert `MIGRATION_MANIFEST_INVALID` for: an extra manifest key; schema version `2`; versions
`[1, 3]`; duplicate `create_probe`; duplicate `001-create-probe.sql`; file paths `C:/001.sql`,
`nested\\001.sql`, `./001-create-probe.sql`, `../001.sql`, `nested//001.sql`; checksum
`sha256:ABC`; padded/blank name; non-boolean `backupRequired`; unsorted versions `[2, 1]`.

Write raw bytes `[0xc3, 0x28]` and `[0xef, 0xbb, 0xbf, ...validSqlBytes]`; require
`MIGRATION_FILE_INVALID`. Change one valid checksum nibble; require
`MIGRATION_CHECKSUM_MISMATCH`. Pass the repository manifest with expected kind `WORKSPACE`; require
`MIGRATION_DATABASE_KIND_MISMATCH`.

- [ ] **Step 3: Run RED**

Expected: tests fail because `loadMigrationPlan` is absent.

- [ ] **Step 4: Implement strict loading**

Define:

```ts
export interface LoadedMigration extends MigrationManifestEntryV1 {
  readonly sql: string;
}

export interface LoadedMigrationPlan {
  readonly schemaVersion: 1;
  readonly databaseKind: MigrationDatabaseKind;
  readonly latestVersion: number;
  readonly migrations: readonly LoadedMigration[];
}
```

Use `readFile`, `TextDecoder('utf-8', { fatal: true })`, `createHash('sha256')`, and
`timingSafeEqual`. Require exact sorted keys `databaseKind,migrations,schemaVersion` and
`backupRequired,checksum,file,name,version`. Reject non-plain objects, unsafe paths, duplicate
names/files, and non-contiguous order.

Canonicalization is exactly:

```ts
const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
if (text.charCodeAt(0) === 0xfeff) {
  throw new StorageMigrationError('MIGRATION_FILE_INVALID', 'Migration SQL must not contain a BOM');
}
const sql = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
const checksum = `sha256:${createHash('sha256').update(sql, 'utf8').digest('hex')}`;
```

Freeze every entry, array, and plan. Do not silently sort or repair input.

- [ ] **Step 5: Run GREEN and commit**

```powershell
pnpm --filter @codeatlas/storage build
node --test packages/storage/test/migration-runner.test.mjs
git diff --check
git add fixtures/storage/migrations packages/storage/src packages/storage/test/migration-runner.test.mjs
git commit -m "feat(storage): validate migration manifests"
```

### Task 3: Apply empty and sequential migrations safely

**Files:**
- Create: `packages/storage/src/migrations/runner.ts`
- Create: `packages/storage/migrations/repository/manifest.json`
- Create: `packages/storage/migrations/workspace/manifest.json`
- Modify: `packages/storage/src/migrations/index.ts`
- Modify: `packages/storage/src/index.ts`
- Modify: `packages/storage/test/migration-runner.test.mjs`

**Interfaces:**
- Consumes: Task 2 loaded plans.
- Produces: public `runMigrations` and internal `applyMigrationPlan(database, plan, hooks?)`.

- [ ] **Step 1: Add empty production manifests**

Both contain schema version `1`, their exact kind, and `migrations: []`. Add no SQL file or business
table.

- [ ] **Step 2: Add RED runner tests**

For both production manifests, run against unique database paths and require frozen results with
initial/final version `0` and an empty frozen applied-version array. Reopen, require
`PRAGMA user_version = 0`, close, and immediately remove the directory.

For the upgrade Fixture require the first result:

```js
{
  databaseKind: 'REPOSITORY',
  initialVersion: 0,
  finalVersion: 2,
  appliedVersions: [1, 2],
}
```

Require the second run to return initial/final `2` and no applied versions. Reopen and require:

```js
assert.deepEqual(database.prepare('SELECT id, value, revision FROM migration_probe').get(), {
  id: 1,
  value: 'ready',
  revision: 1,
});
```

Create a one-entry copy of the upgrade manifest, migrate to version 1, then use the full manifest
and require only version 2 to apply.

Table-drive invalid requests: database paths `''` and `' database.sqlite '`; runtime kind `REPO`;
runtime manifest URL string; timeouts `-1`, `0.5`, `NaN`, `Infinity`, and
`Number.MAX_SAFE_INTEGER + 1`. Require `MIGRATION_MANIFEST_INVALID` before a database file exists.
Require timeout values `0` and `250` to succeed.

- [ ] **Step 3: Run RED**

Expected: temporary Task 1 runner returns `MIGRATION_FAILED`.

- [ ] **Step 4: Implement connection ownership and the sequential loop**

Public entry:

```ts
export async function runMigrations(request: RunMigrationsRequest): Promise<MigrationRunResult> {
  const normalized = validateRunRequest(request);
  const plan = await loadMigrationPlan(normalized.manifestUrl, normalized.databaseKind);
  const database = new DatabaseSync(normalized.databasePath, {
    allowExtension: false,
    enableForeignKeyConstraints: true,
    timeout: normalized.lockTimeoutMs,
  });
  try {
    return applyMigrationPlan(database, plan);
  } finally {
    database.close();
  }
}
```

Define internal hooks:

```ts
interface MigrationApplicationHooks {
  readonly beforeAcquire?: (context: {
    readonly selectedVersion: number;
    readonly observedVersion: number;
  }) => void;
}
```

Read `PRAGMA user_version` through a prepared statement and require one safe non-negative integer.
For each pending entry: `BEGIN IMMEDIATE`; read locked version; execute SQL; verify
`database.isTransaction`; set the validated literal `PRAGMA user_version = N`; re-read; `COMMIT`.
On failure, `ROLLBACK` only while `database.isTransaction` is true. Freeze the returned object and
a copied applied-version array.

- [ ] **Step 5: Run GREEN and commit**

Run focused tests twice to expose connection leaks, then:

```powershell
pnpm exec prettier --write packages/storage/src packages/storage/test packages/storage/migrations
git diff --check
git add packages/storage/src packages/storage/test packages/storage/migrations
git commit -m "feat(storage): apply sequential SQLite migrations"
```

### Task 4: Prove rollback, lock, transaction ownership, concurrency, and too-new behavior

**Files:**
- Create: `fixtures/storage/migrations/migration-failure/manifest.json`
- Create: `fixtures/storage/migrations/migration-failure/001-stable.sql`
- Create: `fixtures/storage/migrations/migration-failure/002-fail.sql`
- Create: `fixtures/storage/migrations/database-too-new/manifest.json`
- Modify: `packages/storage/src/migrations/runner.ts`
- Modify: `packages/storage/test/migration-runner.test.mjs`

**Interfaces:**
- Consumes: Task 3 application loop and hooks.
- Produces: stable recovery/error semantics for every mandatory failure gate.

- [ ] **Step 1: Add failure Fixtures**

Version 1 SQL and checksum:

```sql
CREATE TABLE stable_probe (id INTEGER PRIMARY KEY);
```

`sha256:ac8fffc73f5b96706867cb0f3e556240ef96bd2052d98d74235975dd8f2f0360`

Version 2 SQL and checksum:

```sql
CREATE TABLE rolled_back_probe (id INTEGER PRIMARY KEY);
INSERT INTO missing_table (id) VALUES (1);
```

`sha256:671f58bf6e949ab7653b2af00a974fec7361115273aa7a6cbfb009427dc13c7f`

The failure manifest declares both versions with `backupRequired: false`. The too-new manifest is
an empty repository manifest.

- [ ] **Step 2: Add RED failure/recovery tests**

Require failed version 2 to return `MIGRATION_FAILED`, preserve version 1 and `stable_probe`, and
leave no `rolled_back_probe` table.

Seed an empty-manifest DB with a `sentinel` row and `user_version = 1`; require
`DATABASE_TOO_NEW`, version 1, and the same row afterward.

Hold `BEGIN IMMEDIATE` on a second connection, run with timeout 0, require `MIGRATION_LOCKED`, then
release and prove version 0/no `migration_probe`.

Create one-entry temporary manifests for these canonical SQL inputs:

- `COMMIT;\n` -> `sha256:e83e8c1f4ad612a5bd92067c29bdb9b1597fd541ebed41026079aabd6a4a5bf3`
- `PRAGMA user_version = 99;\n` -> `sha256:529605d91a3dd923edef61d4cc9d78bae6f95649491574828c68dcedf0137a5e`
- `CREATE TABLE backup_probe (id INTEGER PRIMARY KEY);\n` ->
  `sha256:5a76e7f3bdd7a570f20026059fd5f413a44ca9cc1de1477cef4c61deeae2c35a`

Compute the canonical SHA-256 for `ROLLBACK;\n` in the test using `createHash`, write it to the
temporary manifest, and assert behavior rather than duplicating an unchecked literal.

Require transaction-control and direct-version files to return `MIGRATION_FAILED`, leave version
0, and create no application table. Set `backupRequired: true` for the backup input and require
`MIGRATION_BACKUP_REQUIRED` before `backup_probe` exists.

Call internal `applyMigrationPlan` with `beforeAcquire`. On the first callback, use a second
connection and a one-entry plan to commit version 1. Require the first connection to re-read,
apply only version 2, and return `appliedVersions: [2]` without duplicate-table failure.

- [ ] **Step 3: Run RED**

Expected: raw SQLite failures leak, backup-required SQL executes, and the concurrent advance case
fails its applied-version assertion.

- [ ] **Step 4: Implement authorizer and stable recovery mapping**

During only migration SQL execution set:

```ts
database.setAuthorizer((actionCode, argument1) => {
  if (actionCode === constants.SQLITE_TRANSACTION) return constants.SQLITE_DENY;
  if (
    actionCode === constants.SQLITE_PRAGMA &&
    argument1?.toLowerCase() === 'user_version'
  ) {
    return constants.SQLITE_DENY;
  }
  return constants.SQLITE_OK;
});
```

Clear it with `database.setAuthorizer(null)` in `finally`. Invoke `beforeAcquire` synchronously
before each `BEGIN IMMEDIATE`. Re-read locked version; on a valid advance roll back the empty
transaction and replan. A regression/jump fails `MIGRATION_VERSION_CHANGED`; above manifest latest
fails `DATABASE_TOO_NEW`.

Map acquisition messages matching `database is locked|busy` to `MIGRATION_LOCKED`. Wrap
SQL/authorizer/postcondition/commit failures as `MIGRATION_FAILED`; a lost transaction after SQL
maps to `MIGRATION_TRANSACTION_ESCAPED`. Preserve cause, exclude raw SQL from messages, and rollback
only when the connection still owns a transaction.

- [ ] **Step 5: Run GREEN and commit**

Run focused tests twice and require every temporary directory removal to succeed.

```powershell
git diff --check
git add fixtures/storage/migrations packages/storage/src packages/storage/test/migration-runner.test.mjs
git commit -m "feat(storage): harden migration failure semantics"
```

### Task 5: Make migration Fixtures mandatory workspace gates

**Files:**
- Modify: `packages/storage/package.json`
- Modify: `package.json`
- Modify: `scripts/test-workspace-structure.mjs`
- Modify: `packages/storage/test/migration-runner.test.mjs`

**Interfaces:**
- Consumes: checked-in manifests and built storage exports.
- Produces: published migration assets and mandatory root-test coverage.

- [ ] **Step 1: Add RED integration assertions**

Require `storagePackage.files` to equal `['dist', 'migrations']`. Require the root `test` command to
contain `packages/storage/test/migration-runner.test.mjs`. Load both production manifests and
assert exact kind/latest version 0. Search production `.ts` files and require every `node:sqlite`
import path to begin `packages/storage/src/`.

- [ ] **Step 2: Run RED**

```powershell
node --test scripts/test-workspace-structure.mjs
pnpm test
```

Expected: package-assets and root-script assertions fail.

- [ ] **Step 3: Integrate assets and tests**

Set storage `files` to:

```json
["dist", "migrations"]
```

Append `packages/storage/test/migration-runner.test.mjs` to the existing root Node test invocation.
Remove or reorder none of the prior tests and gates. Add no migration CLI.

- [ ] **Step 4: Run GREEN and commit**

```powershell
pnpm build
pnpm test
pnpm architecture:check
git diff --check
git add package.json packages/storage/package.json packages/storage/test/migration-runner.test.mjs scripts/test-workspace-structure.mjs
git commit -m "test(storage): gate migration runner fixtures"
```

### Task 6: Synchronize normative docs and traceability

**Files:**
- Modify: `docs/handoff/specs/SQLITE_SCHEMA.md`
- Modify: `docs/handoff/DESIGN_TRACEABILITY.md`

**Interfaces:**
- Consumes: actual behavior and paths from Tasks 1-5.
- Produces: authoritative documentation without changing an ADR or Frozen decision.

- [ ] **Step 1: Update Migration Mechanics**

Document exact manifest fields/kind isolation; contiguous versions; safe relative paths; strict
UTF-8/BOM/newline/checksum rules; Node SQLite ownership; `BEGIN IMMEDIATE`; locked version recheck;
per-version commit/rollback/rerun; authorizer restrictions; backup-required rejection; stable error
codes; and empty Phase 0 production manifests. Preserve the existing R001-R009/W001-W012 tables
and phase assignments.

- [ ] **Step 2: Refine only P0-W1-005 traceability**

Name `p0-migration-runner-v1`, `fixtures/storage/migrations/cases.json`, all four scenario
directories, and `packages/storage/test/migration-runner.test.mjs`. Keep the acceptance text,
SQLite governing spec, and ADR-003/ADR-011/ADR-012 authority unchanged.

- [ ] **Step 3: Verify and commit**

```powershell
pnpm exec prettier --check docs/handoff/specs/SQLITE_SCHEMA.md docs/handoff/DESIGN_TRACEABILITY.md
rg -n "P0-W1-005|p0-migration-runner-v1|migration-empty|DATABASE_TOO_NEW" docs/handoff
git diff --check
git add docs/handoff/specs/SQLITE_SCHEMA.md docs/handoff/DESIGN_TRACEABILITY.md
git commit -m "docs: specify migration runner contract"
```

### Task 7: Prove completion and append reproducible status evidence

**Files:**
- Modify: `docs/handoff/CURRENT_STATUS.md`

**Interfaces:**
- Consumes: exact test output, Fixture paths/counts, audits, and Git SHA.
- Produces: P0-W1-005 completion evidence and next task `P0-W1-006`.

- [ ] **Step 1: Run fresh focused and complete gates**

```powershell
pnpm --filter @codeatlas/storage build
node --test packages/storage/test/migration-runner.test.mjs
pnpm verify
git diff --check
```

Capture exact observed counts; do not copy projected counts from this plan.

- [ ] **Step 2: Audit architecture and Deferred scope**

```powershell
rg -n "node:sqlite|PRAGMA user_version|BEGIN IMMEDIATE" packages apps crates
rg -n -i "R00[1-7]|W00[1-3]|canonical_nodes|knowledge_items|ExecutionGraph|RuntimeFlow|BusinessFlow|LLM|embedding|zvec|watcher|daemon|fetch\(" packages/storage/src packages/storage/migrations fixtures/storage/migrations
git diff --name-only 12cebef0eeb88eb0b6838ce3799629659f7f3437..HEAD
```

Classify every match. Production SQLite must remain storage-only. No repository/workspace business
schema or Deferred capability may be present.

- [ ] **Step 3: Append CURRENT_STATUS without rewriting historical entries**

Record task ID; exact SHA from `git rev-parse HEAD`; ADR/spec/design/plan; Fixture ID and four
paths; focused/root counts; sequential/rerun/rollback/lock/checksum/transaction/backup/too-new
evidence; manifest version 1; absence of R/W business migrations; full TypeScript/Rust/architecture
results; audit results; documentation synchronization; known limitations; and next task
`P0-W1-006 Repository database R001-R007`.

Also append the observed remote correction: GitHub main SHA
`12cebef0eeb88eb0b6838ce3799629659f7f3437`, CI run `35304121355`, TypeScript and Rust success.
State hosted P0-W1-005 CI as pending until the exact final SHA is authorized, pushed, and observed.

- [ ] **Step 4: Commit status evidence and run post-commit gates**

```powershell
git add docs/handoff/CURRENT_STATUS.md
git commit -m "docs: record migration runner verification"
pnpm verify
git diff --check HEAD^ HEAD
git status --short --branch
git log --oneline 12cebef0eeb88eb0b6838ce3799629659f7f3437..HEAD
```

Do not claim hosted completion from local evidence. Preserve the branch for review and integration.

## Self-review result

- Spec coverage: Tasks 1-7 cover the complete manifest, checksum, version, transaction, lock,
  failure, Fixture, packaging, documentation, traceability, and evidence contract.
- Placeholder scan: every implementation step names exact files, interfaces, cases, commands, and
  expected outcomes; no incomplete implementation marker remains.
- Type consistency: `MigrationDatabaseKind`, `MigrationManifestV1`, `LoadedMigrationPlan`,
  `RunMigrationsRequest`, `MigrationRunResult`, `StorageMigrationError`, `loadMigrationPlan`,
  `applyMigrationPlan`, and `runMigrations` retain one definition across tasks.
- Review Focus: input validation, unsafe manifests, transaction escape, connection release, and
  concurrent advance each have an owning RED/GREEN task.
- Scope: the plan is one storage subsystem and stops before P0-W1-006 and P0-W1-007 schemas.
