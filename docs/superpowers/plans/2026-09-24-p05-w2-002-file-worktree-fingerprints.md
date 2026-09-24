# P05-W2-002 File and Worktree Fingerprints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist and reconcile selected Git-worktree file fingerprints across process restarts without activating a code graph.

**Architecture:** `@codeatlas/source` observes bytes and computes deterministic hashes, `@codeatlas/storage` owns R002 SQLite state and a compare-and-replace transaction, and `@codeatlas/application` composes them through a structural storage port. The product CLI/runtime startup call is later scope; this task proves the callable use case across a real database close/reopen boundary.

**Tech Stack:** Node 24 TypeScript, `node:crypto`, `node:fs/promises`, `node:sqlite`, strict `@codeatlas/ir` Zod schemas, Node test runner, version-1 Fixture manifests.

**Spec:** [P05-W2-002 approved design](../specs/2026-09-24-p05-w2-002-file-worktree-fingerprints-design.md)

## Global Constraints

- Stay on `codex/p05-w2-002-fingerprints` based on merged `origin/main` commit `ed4f80e`; preserve unrelated working-tree changes.
- Keep `source -> ir`, `storage -> ir`, and `application -> source + ir` dependency directions; `application` must not import concrete storage. `runtime` may compose both later.
- Use existing R001/R002 tables. Do not edit published SQL migrations or checksums, add a Canonical IR/IPC schema field, or move `repository_state.indexed_revision_id`.
- Hash raw bytes as lowercase `sha256:<64 lowercase hex>` with bounded reads. Inventory hash uses a version/domain prefix and length-prefixed UTF-8 fields in canonical path order.
- Ordinary selected source persists as `sensitivity: 'INTERNAL'`; security-denied paths remain excluded, and this value grants no remote access.
- Keep opaque repository/worktree/file EntityIds distinct from paths and hashes. Reuse same-path file IDs; do not infer rename identity.
- A SourceFile row has no size column: return `sizeBytes` in observations and include it in inventory hashing, but do not claim it is separately persisted.
- P05-W2-010 owns change-kind labels. This task returns only sorted changed paths. P05-W8-001 owns CLI wiring; no runtime startup command is claimed here.
- Run the declared Fixtures, applicable full verify gates, and failure/recovery checks before updating `CURRENT_STATUS.md` or claiming completion. No new numeric performance threshold.

## Review Focus

These high-risk inputs must be pinned by the task tests below, even though no extra product feature is added:

1. An ignored or secret-path file changes: Task 1 and Task 3 prove it is neither hashed nor reported.
2. A selected file changes while read or becomes a symlink: Task 1 proves typed failure and no observation.
3. The database contains two WORKTREE rows or malformed source rows: Task 2 rejects the state without choosing a winner.
4. Two reconcilers use the same old baseline: Task 2 rejects the late writer and preserves the first commit.
5. A previously deleted path is re-added: Task 3 reports the path and allows a new opaque ID, without pretending it is a rename.

---

## File map

| Path | Responsibility |
| --- | --- |
| `packages/source/src/fingerprint.ts` | Raw-byte file observation and deterministic worktree fingerprint. |
| `packages/source/src/types.ts`, `index.ts` | Export a new fingerprinting result and entry point without changing `scanGitRepository` output. |
| `packages/source/test/fingerprint.test.mjs`, `helpers.mjs` | Hash, ordering, race, policy, and error tests plus compact large-file materialization. |
| `fixtures/source/worktree-fingerprint/{fixture,setup,expected}.json` | Declared exact hash golden case. |
| `packages/storage/src/source-state/{types,errors,repository,index}.ts` | R002 read/validate and transactional compare-and-replace adapter. |
| `packages/storage/src/index.ts`, `packages/storage/test/source-state.test.mjs` | Public export and real SQLite failures/recovery. |
| `packages/application/src/reconcile-worktree.ts`, `index.ts`, `package.json` | Storage-independent reconciliation use case and dependency declaration. |
| `packages/application/test/reconcile-worktree.test.mjs` | Real Git + DB restart and ID continuity. |
| `fixtures/source/restart-reconciliation/{fixture,setup,expected}.json` | Declared restart/change-set golden case. |
| `package.json`, `docs/handoff/DESIGN_TRACEABILITY.md`, `docs/handoff/CURRENT_STATUS.md` | Register tests and record fresh evidence only after passing checks. |

### Task 1: Selected-file byte and inventory fingerprints

**Files:** Create `packages/source/src/fingerprint.ts`, `packages/source/test/fingerprint.test.mjs`, and `fixtures/source/worktree-fingerprint/fixture.json`, `setup.json`, `expected.json`; modify `packages/source/src/types.ts`, `packages/source/src/index.ts`, `packages/source/test/helpers.mjs`, and root `package.json` test script.

**Interfaces:** Consume `scanGitRepository(request: SourceScanRequest): Promise<SourceScanResult>`. Produce `observeGitWorktree(request: SourceScanRequest): Promise<ObservedWorktree>` where `ObservedWorktree` has the scan metadata, `files: readonly ObservedFile[]`, and `contentFingerprint: ContentFingerprint`; `ObservedFile` extends `ScannedFile` with `contentFingerprint: ContentFingerprint` and `sizeBytes: number`. Do not alter the existing scanner's returned shape.

- [ ] **Step 1: Write RED tests and the declared Fixture.** Add the exact manifest fields already used by `fixtures/source/basic-java-repo/fixture.json`. Materialize a Git repository with empty, UTF-8 Java, explicit binary, and >64 KiB files. Assert raw SHA-256 independently from fixture bytes and assert the pinned worktree fingerprint; also assert sorting, same-size/different-byte change, ignored/secret omission, and empty-result stability. Exercise an injected read seam with a disappearing or symlink-replaced selected file.

```js
const first = await observeGitWorktree(request);
assert.deepEqual(first.files.map((file) => file.path), expected.paths);
assert.equal(first.files[0].contentFingerprint, expected.files[first.files[0].path].contentFingerprint);
assert.equal(first.contentFingerprint, expected.contentFingerprint);
assert.deepEqual(await observeGitWorktree(request), first);
await assert.rejects(observeWithDependencies(request, changedFileDependencies), hasCode('SOURCE_CHANGED'));
```

Extend the test-only `materialize` helper to accept a compact file descriptor `{ "path": "src/Large.java", "repeat": { "text": "a", "count": 65537 } }`; its branch writes `file.repeat.text.repeat(file.repeat.count)` after validating a positive safe count. Keep the existing `text` and `base64` branches unchanged. Use `setup.json` with this descriptor and `expected.json` with explicit paths, file hashes, sizes, and one inventory fingerprint. Compute the checked-in golden values independently with Node `createHash('sha256')` in a one-off read-only verification command; do not derive expected values by calling the implementation under test.

- [ ] **Step 2: Run the focused RED test.** Run `node --test packages/source/test/fingerprint.test.mjs`. Expect missing export/fixture or failed exact assertions, not a false pass.

- [ ] **Step 3: Implement bounded byte observation and deterministic encoding.** Use `open`/`FileHandle.read` with one 64 KiB buffer and `lstat`/opened-handle `stat`/post-close `lstat` identity checks, following `classify.ts` error mapping. Reject a non-safe byte count. Reuse `scanGitRepository` for policy and classification; hash only its returned paths. For every path, ensure the new opened read remains a regular non-symlink file. Compare classification from the read sample to the scan result or reject `SOURCE_CHANGED` if it disagrees. Recheck Git HEAD metadata before returning; reject a changed HEAD. Keep the public scan result unchanged.

```ts
export interface ObservedFile extends ScannedFile {
  readonly contentFingerprint: ContentFingerprint;
  readonly sizeBytes: number;
}
export interface ObservedWorktree extends Omit<SourceScanResult, 'files'> {
  readonly files: readonly ObservedFile[];
  readonly contentFingerprint: ContentFingerprint;
}
export async function observeGitWorktree(request: SourceScanRequest): Promise<ObservedWorktree> {
  const scan = await scanGitRepository(request);
  const files = await observeSelectedPaths(scan.rootPath, scan.files);
  return Object.freeze({ ...scan, files, contentFingerprint: fingerprintInventory(files) });
}
```

Define internal `observeSelectedPaths(rootPath: string, files: readonly ScannedFile[]): Promise<readonly ObservedFile[]>` and `fingerprintInventory(files: readonly ObservedFile[]): ContentFingerprint` in `fingerprint.ts`. Define the test-only `observeWithDependencies(request, dependencies)` seam there with the same production defaults as the public operation; it must not permit bypassing source selection or security policy. The `changedFileDependencies` test double replaces only file reading after the real selected-path scan.

The inventory hash starts with `codeatlas-worktree-v1\0`. For each field, feed `N` for null or `S`, decimal UTF-8 byte length, `:`, then bytes. Fields are path, file hash, decimal size, language hint, role, provenance, and content kind, in that order. This exact encoding must be pinned by a small independent test vector.

- [ ] **Step 4: Run GREEN and regression checks.** Run `node_modules/.bin/tsc.cmd -p packages/source/tsconfig.json`, then `node --test packages/source/test/fingerprint.test.mjs packages/source/test/source-scan.test.mjs packages/source/test/git.test.mjs packages/source/test/path-policy.test.mjs packages/source/test/walk-classify.test.mjs`. Expect all declared Source Fixtures and prior scan behavior to pass. Run `node scripts/check-architecture.mjs`.

- [ ] **Step 5: Commit the independently testable Source observation.** Stage only Task 1 paths and run `git diff --cached --check`, then `git commit -m "feat(source): fingerprint selected worktree files"`.

### Task 2: Atomic R002 source-observation store

**Files:** Create `packages/storage/src/source-state/types.ts`, `errors.ts`, `repository.ts`, `index.ts`, and `packages/storage/test/source-state.test.mjs`; modify `packages/storage/src/index.ts` and root `package.json` test registration.

**Interfaces:** Consume `EntityId`, `WorktreeRevision`, `SourceFile`, `CommitIdentity`, `RevisionSchema`, and `SourceFileSchema` from `@codeatlas/ir`. Produce `RepositorySourceStateStore` with `load(repositoryId)`, `findCommitRevisionId(repositoryId, commitIdentity)`, and `replace(expected, next)` methods. `StoredWorktreeState` contains a validated WORKTREE revision and sorted SourceFile rows; the store does not know `ObservedWorktree` or file sizes.

- [ ] **Step 1: Write RED real-database tests.** Use `runMigrations` with the production repository manifest, open with `DatabaseSync(..., { enableForeignKeyConstraints: true })`, and insert the R001 `repository` and `repository_state` rows for the caller-provided stable ID. Assert first insert, close/reopen load, same-ID content change, retained same-path SourceFile ID, removal, COMMIT lookup, and unchanged `indexed_revision_id`. Inject a write failure after revision update but before file replacement; assert rollback. Create two WORKTREE rows and malformed legacy data in separate cases; assert typed rejection. Start two replacements from the same expected snapshot; the second must conflict.

```js
const old = store.load(repositoryId);
store.replace(old, firstState);
db.close();
const reopenedDb = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
const reopened = new RepositorySourceStateStore(reopenedDb);
assert.deepEqual(reopened.load(repositoryId), firstState);
assert.throws(() => reopened.replace(old, competingState), { code: 'SOURCE_STATE_CONFLICT' });
reopenedDb.close();
```

- [ ] **Step 2: Run the focused RED test.** Run `node --test packages/storage/test/source-state.test.mjs`. Expect missing store exports or specific asserted failures.

- [ ] **Step 3: Implement validated reads and a single compare-and-replace transaction.** Take an already opened, migrated `DatabaseSync`; do not run migrations or register repositories implicitly. `load` checks the R001 registration, exactly zero or one WORKTREE row, parses every row through IR schemas, and sorts by canonical path. `findCommitRevisionId` selects only a same-repository COMMIT row with matching `commit_identity`; return `null` if absent and reject duplicate matches. `replace` begins `BEGIN IMMEDIATE`, re-reads and compares the complete expected revision/file state (including IDs), validates `validateRevisionTransition` when applicable, writes the revision and current file rows with parameterized SQL, and commits. On any failure while `isTransaction`, roll back; expose a safe typed error and keep the original cause private. Never update `repository_state`.

```ts
export interface StoredWorktreeState {
  readonly revision: WorktreeRevision;
  readonly files: readonly SourceFile[];
}
export class RepositorySourceStateStore {
  constructor(private readonly database: DatabaseSync) {}
  load(repositoryId: EntityId): StoredWorktreeState | null;
  findCommitRevisionId(repositoryId: EntityId, commitIdentity: CommitIdentity): EntityId | null;
  replace(expected: StoredWorktreeState | null, next: StoredWorktreeState): void;
}
```

Use closed error codes `REPOSITORY_NOT_REGISTERED`, `WORKTREE_AMBIGUOUS`, `SOURCE_STATE_INVALID`, `SOURCE_STATE_CONFLICT`, and `SOURCE_STATE_WRITE_FAILED`. SQL/SQLite messages, source content, and unrestricted paths do not appear in public error text. A failure hook, if needed for deterministic transaction testing, is test-only/internal and never an exported product option.

- [ ] **Step 4: Run GREEN and storage regressions.** Run `node_modules/.bin/tsc.cmd -p packages/storage/tsconfig.json`, then `node --test packages/storage/test/source-state.test.mjs packages/storage/test/repository-schema.test.mjs packages/storage/test/repository-constraints.test.mjs`; run `node scripts/check-architecture.mjs`. Confirm migration manifest, SQL files, and checksums are unchanged with `git diff --name-only`.

- [ ] **Step 5: Commit the storage adapter.** Stage only Task 2 paths, run `git diff --cached --check`, then `git commit -m "feat(storage): atomically retain worktree source state"`.

### Task 3: Application reconciliation, restart Fixture, and acceptance record

**Files:** Create `packages/application/src/reconcile-worktree.ts`, `packages/application/test/reconcile-worktree.test.mjs`, and `fixtures/source/restart-reconciliation/fixture.json`, `setup.json`, `expected.json`; modify `packages/application/src/index.ts`, `packages/application/package.json`, root `package.json`, `docs/handoff/DESIGN_TRACEABILITY.md`, and `docs/handoff/CURRENT_STATUS.md` after evidence.

**Interfaces:** Consume `observeGitWorktree`, `SourceScanRequest`, and `ObservedWorktree` from `@codeatlas/source`, plus the `@codeatlas/ir` schemas. Define a structural `SourceStatePort` in application matching Task 2's three methods, without importing `@codeatlas/storage`. Produce `reconcileGitWorktree(request, store): Promise<ReconcileWorktreeResult>` with `revision`, `files` including sizes, and `changedPaths: readonly RepositoryRelativePath[]`.

- [ ] **Step 1: Write RED use-case and restart Fixture tests.** Add a strict version-1 manifest using the same structure as the prior Source Fixtures. Materialize a real Git repository; run migrations and insert the registered repository row; reconcile; close the database and create a new store instance; assert unchanged restart produces `[]`, then modify same-size content, add and delete selected paths, mutate ignored/secret paths, and assert the exact sorted path set. Reopen again to assert empty changes. Assert worktree ID and surviving path IDs remain stable, re-added deleted path is reported without rename identity, size is returned but no size column is present, and `indexed_revision_id` remains unchanged. Inject the source read failure and store write failure to prove the prior persisted fingerprint survives.

```js
const first = await reconcileGitWorktree(request, store);
assert.deepEqual(first.changedPaths, expected.initialChangedPaths);
db.close();
const restartedDb = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
const restarted = await reconcileGitWorktree(request, new RepositorySourceStateStore(restartedDb));
assert.deepEqual(restarted.changedPaths, []);
restartedDb.close();
const changedDb = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
const changed = await reconcileGitWorktree(request, new RepositorySourceStateStore(changedDb));
assert.deepEqual(changed.changedPaths, expected.afterEditsChangedPaths);
changedDb.close();
```

- [ ] **Step 2: Run the focused RED test.** Run `node --test packages/application/test/reconcile-worktree.test.mjs`. Expect missing use-case/fixture or exact changed-path failure.

- [ ] **Step 3: Implement the narrow use case.** Load previous state before scanning; observe selected files; reuse prior worktree ID or allocate `randomUUID()` on first observation; reuse same-path SourceFile IDs or allocate new opaque IDs; look up a persisted COMMIT ID for the observed HEAD and use `null` otherwise; validate `RevisionSchema`, `SourceFileSchema`, and `validateRevisionTransition`; compare previous/new path and analysis-relevant fields to produce the sorted changed set; call `store.replace(previous, next)` only after the entire observation validates. Do not label changes, freeze a RevisionSet, or invoke a Provider.

```ts
export interface SourceStatePort {
  load(repositoryId: EntityId): StoredWorktreeState | null;
  findCommitRevisionId(repositoryId: EntityId, commitIdentity: CommitIdentity): EntityId | null;
  replace(expected: StoredWorktreeState | null, next: StoredWorktreeState): void;
}
export interface ReconcileWorktreeResult {
  readonly revision: WorktreeRevision;
  readonly files: readonly ObservedFile[];
  readonly changedPaths: readonly RepositoryRelativePath[];
}
export async function reconcileGitWorktree(
  request: SourceScanRequest,
  store: SourceStatePort,
): Promise<ReconcileWorktreeResult>;
```

Define `StoredWorktreeState` locally in application with the identical structural fields shown in Task 2. The application package adds only `@codeatlas/source` and `@codeatlas/ir` workspace dependencies; storage's class satisfies the port structurally in tests/runtime composition.

- [ ] **Step 4: Run GREEN and all required checks.** Build IR, Source, Storage, and Application in dependency order with installed `tsc`, then run focused Source, Storage, and Application suites; confirm both new Fixture IDs are discovered by `discoverFixtures`. Run `pnpm verify` with the documented Windows dependency-layout overrides if needed. If the offline pnpm wrapper prevents the aggregate command, run each installed binary/command named by `verify` directly and record the limitation; do not claim `pnpm verify` passed. Run `cargo fmt --all --check`, `cargo build --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `node scripts/check-architecture.mjs`, and `node_modules/.bin/prettier.cmd --check .`. Do not lower a gate to make the task pass.

- [ ] **Step 5: Record fresh acceptance evidence and commit.** Update the P05-W2-002 traceability row with `worktree-fingerprint` and `restart-reconciliation` manifests, exact test paths, Canonical IR/Runtime/SQLite specs, and the startup-reconciliation acceptance wording. Update `CURRENT_STATUS.md` with commands, counts, commit references, error/recovery results, no-migration impact, remaining phase gates, and next unblocked task. Keep hosted CI/integration marked pending until observed. Run `git diff --check`, stage only Task 3 and status/traceability paths, then `git commit -m "feat(application): reconcile persisted worktree fingerprints"`. A documentation-only follow-up commit may be needed after the final implementation SHA and hosted CI are known.

## Final branch review and handoff

- [ ] Verify `git diff --quiet HEAD` for actual content, note any unrelated Windows line-ending status noise, and review `git diff origin/main...HEAD` for scope, migrations, secrets, and architecture boundaries.
- [ ] Run the full focused Fixture tests and applicable verify gates again after the final code change; report exact pass counts, not remembered counts.
- [ ] Obtain the review required by the selected execution method, correct proven defects with RED→GREEN tests, then request PR integration through the branch-finishing workflow. Do not merge without user direction.
