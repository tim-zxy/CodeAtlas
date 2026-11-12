// Private Storage leaf for a new explicit database; no CLI layout/defaults or access grant.
import assert from 'node:assert/strict';
import { types } from 'node:util';
import { lstat, open, realpath } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { EntityIdSchema, ensurePhase1Data } from '@codeatlas/ir';
import { loadMigrationPlan } from '../migrations/manifest.js';
import { applyMigrationPlan } from '../migrations/runner.js';
import { openRepositoryIndexSession } from './repository-index-session.js';

type Effect = 'NOT_COMMITTED' | 'COMMITTED' | 'UNKNOWN';
type Cleanup = 'SETTLED' | 'UNKNOWN';
type Code =
  | 'WORKSPACE_INPUT_INVALID'
  | 'DATABASE_ALREADY_EXISTS'
  | 'WORKSPACE_INITIALIZATION_FAILED'
  | 'DEADLINE'
  | 'CANCELLED'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'BUDGET_EXCEEDED';
type Input = {
  databasePath: string;
  workspaceId: string;
  workspaceRoot: string;
  repositories: { repositoryId: string; repositoryRoot: string }[];
};
type Control = {
  checkpoint(): Promise<void>;
  reserveText(bytes: number): void;
  chargeMetadataRow(): void;
};
export interface WorkspaceInitializationReceipt {
  readonly workspaceId: string;
  readonly databasePath: string;
  readonly databaseVersion: number;
  readonly repositoryIds: readonly string[];
  readonly metadataEffect: 'COMMITTED';
  readonly cleanupState: 'SETTLED';
}
export class WorkspaceInitializationError extends Error {
  constructor(
    readonly code: Code,
    readonly metadataEffect: Effect,
    readonly cleanupState: Cleanup,
  ) {
    super(code);
    this.name = 'WorkspaceInitializationError';
  }
}
function keys(value: object, expected: string[]) {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
}
function absolute(value: unknown): asserts value is string {
  assert(
    typeof value === 'string' &&
      value.length > 0 &&
      value.trim() === value &&
      !value.includes('\0') &&
      value.isWellFormed(),
  );
  assert(path.isAbsolute(value) && path.resolve(value) === value);
}
function ownInput(value: unknown): Input {
  ensurePhase1Data(value);
  const input = JSON.parse(JSON.stringify(value)) as Input;
  keys(input, ['databasePath', 'workspaceId', 'workspaceRoot', 'repositories']);
  absolute(input.databasePath);
  absolute(input.workspaceRoot);
  input.workspaceId = EntityIdSchema.parse(input.workspaceId);
  assert(Array.isArray(input.repositories));
  for (const repository of input.repositories) {
    keys(repository, ['repositoryId', 'repositoryRoot']);
    repository.repositoryId = EntityIdSchema.parse(repository.repositoryId);
    absolute(repository.repositoryRoot);
  }
  assert.equal(
    new Set(input.repositories.map((r) => r.repositoryId)).size,
    input.repositories.length,
  );
  return input;
}
function sameNode(before: BigIntStats, after: BigIntStats) {
  for (const key of ['dev', 'ino', 'birthtimeNs'] as const) assert.equal(after[key], before[key]);
}
/** One new Workspace DB only. Metadata declarations do not authenticate Source,
 * repository database identity, caller permission or a complete multi-file init. */
export async function initializeWorkspaceMetadata(
  value: unknown,
  control: Control,
): Promise<WorkspaceInitializationReceipt> {
  let database: DatabaseSync | undefined, lease: Awaited<ReturnType<typeof open>> | undefined;
  let effect: Effect = 'NOT_COMMITTED',
    cleanup: Cleanup = 'SETTLED',
    stage: Code = 'WORKSPACE_INPUT_INVALID',
    failure: Code | undefined,
    result: WorkspaceInitializationReceipt | undefined;
  try {
    const input = ownInput(value);
    const settled = (completion: unknown) => {
      if (completion !== undefined) {
        cleanup = 'UNKNOWN';
        if (types.isPromise(completion))
          void Promise.prototype.then.call(completion, undefined, () => undefined);
        throw Error('UNSETTLED_WORKSPACE_BUDGET');
      }
    };
    settled(control.reserveText(Buffer.byteLength(JSON.stringify(input))));
    for (let i = 0; i <= input.repositories.length; i++) settled(control.chargeMetadataRow());
    await control.checkpoint();
    stage = 'WORKSPACE_INITIALIZATION_FAILED';
    const roots: { root: string; pin: BigIntStats }[] = [];
    const root = async (value: string) => {
      const canonical = await realpath(value),
        pin = await lstat(canonical, { bigint: true });
      assert(pin.isDirectory() && !pin.isSymbolicLink());
      roots.push({ root: canonical, pin });
      return canonical;
    };
    input.workspaceRoot = await root(input.workspaceRoot);
    for (const repository of input.repositories)
      repository.repositoryRoot = await root(repository.repositoryRoot);
    assert.equal(
      new Set(input.repositories.map((r) => r.repositoryRoot)).size,
      input.repositories.length,
    );
    // Charge the canonical values actually written, including repeated foreign keys.
    const textBytes = [
      input.workspaceId,
      input.workspaceRoot,
      ...input.repositories.flatMap((repository) => [
        repository.repositoryId,
        input.workspaceId,
        repository.repositoryRoot,
      ]),
    ].reduce((bytes, value) => bytes + Buffer.byteLength(value), 0);
    assert(Number.isSafeInteger(textBytes));
    settled(control.reserveText(textBytes));
    const filename = input.databasePath,
      parent = path.dirname(filename);
    assert.equal(await realpath(parent), parent);
    const parentPin = await lstat(parent, { bigint: true });
    assert(parentPin.isDirectory() && !parentPin.isSymbolicLink());
    const plan = await loadMigrationPlan(
      new URL('../../migrations/workspace/manifest.json', import.meta.url),
      'WORKSPACE',
    );
    assert.equal(
      plan.latestVersion,
      8,
      'Only the existing Workspace001..008 initialization is supported',
    );
    await control.checkpoint();
    try {
      lease = await open(filename, 'wx');
    } catch (error) {
      if (
        !types.isProxy(error) &&
        Object.getOwnPropertyDescriptor(Object(error), 'code')?.value === 'EEXIST'
      )
        failure = 'DATABASE_ALREADY_EXISTS';
      throw error;
    }
    const filePin = await lease.stat({ bigint: true });
    const identity = async () => {
      const directory = await lstat(parent, { bigint: true });
      assert(directory.isDirectory() && !directory.isSymbolicLink());
      sameNode(parentPin, directory);
      assert.equal(await realpath(parent), parent);
      const current = await lstat(filename, { bigint: true });
      assert(current.isFile() && !current.isSymbolicLink() && current.nlink === 1n);
      sameNode(filePin, current);
      assert.equal(await realpath(filename), filename);
    };
    const rootIdentity = async () => {
      for (const { root, pin } of roots) {
        const current = await lstat(root, { bigint: true });
        assert(current.isDirectory() && !current.isSymbolicLink());
        sameNode(pin, current);
        assert.equal(await realpath(root), root);
      }
    };
    await identity();
    database = new DatabaseSync(filename, {
      allowExtension: false,
      enableForeignKeyConstraints: true,
    });
    await identity();
    applyMigrationPlan(database, plan);
    await identity();
    await rootIdentity();
    await control.checkpoint();
    database.exec('BEGIN IMMEDIATE');
    try {
      database
        .prepare('INSERT INTO workspace(slot,id,root_path) VALUES(1,?,?)')
        .run(input.workspaceId, input.workspaceRoot);
      for (const repository of input.repositories) {
        await control.checkpoint();
        await identity();
        database
          .prepare('INSERT INTO repositories(repository_id,workspace_id,root_path) VALUES(?,?,?)')
          .run(repository.repositoryId, input.workspaceId, repository.repositoryRoot);
      }
      await control.checkpoint();
      await identity();
      await rootIdentity();
      effect = 'UNKNOWN';
      database.exec('COMMIT');
      effect = 'COMMITTED';
    } catch (error) {
      if (database.isTransaction) {
        try {
          database.exec('ROLLBACK');
          effect = 'NOT_COMMITTED';
        } catch {
          cleanup = 'UNKNOWN';
        }
      }
      throw error;
    }
    await identity();
    result = Object.freeze({
      workspaceId: input.workspaceId,
      databasePath: filename,
      databaseVersion: plan.latestVersion,
      repositoryIds: Object.freeze(input.repositories.map((r) => r.repositoryId)),
      metadataEffect: 'COMMITTED',
      cleanupState: 'SETTLED',
    });
  } catch (error) {
    const code =
      error && typeof error === 'object' && !types.isProxy(error)
        ? Object.getOwnPropertyDescriptor(error, 'code')?.value
        : undefined;
    failure ??= ['CANCELLED', 'DEADLINE', 'RESOURCE_LIMIT_EXCEEDED', 'BUDGET_EXCEEDED'].includes(
      code,
    )
      ? (code as Code)
      : stage;
  } finally {
    if (database) {
      try {
        database.close();
        if (database.isOpen) cleanup = 'UNKNOWN';
      } catch {
        cleanup = 'UNKNOWN';
      }
    }
    if (lease) {
      try {
        await lease.close();
        if (lease.fd !== -1) cleanup = 'UNKNOWN';
      } catch {
        cleanup = 'UNKNOWN';
      }
    }
  }
  if (failure || cleanup === 'UNKNOWN')
    throw new WorkspaceInitializationError(
      failure ?? 'WORKSPACE_INITIALIZATION_FAILED',
      effect,
      cleanup,
    );
  assert(result);
  return result;
}

const stopCode = (error: unknown): Code => {
  const code =
    error && typeof error === 'object' && !types.isProxy(error)
      ? Object.getOwnPropertyDescriptor(error, 'code')?.value
      : undefined;
  return ['CANCELLED', 'DEADLINE', 'RESOURCE_LIMIT_EXCEEDED', 'BUDGET_EXCEEDED'].includes(code)
    ? code
    : 'WORKSPACE_INITIALIZATION_FAILED';
};
async function immutableGuard(filename: string) {
  assert.equal(await realpath(filename), filename);
  const before = await lstat(filename, { bigint: true });
  assert(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n);
  return async () => {
    for (const suffix of ['-wal', '-shm', '-journal']) {
      try {
        await lstat(filename + suffix);
        throw Error('INIT_DATABASE_IN_USE');
      } catch (error) {
        if (Object.getOwnPropertyDescriptor(Object(error), 'code')?.value !== 'ENOENT') throw error;
      }
    }
    const after = await lstat(filename, { bigint: true });
    sameNode(before, after);
    assert(
      after.isFile() &&
        !after.isSymbolicLink() &&
        after.nlink === 1n &&
        before.size === after.size &&
        before.mtimeNs === after.mtimeNs &&
        before.ctimeNs === after.ctimeNs,
    );
    assert.equal(await realpath(filename), filename);
  };
}
/** Init-only immutable read: no SQLite recovery/SHM writes. Active journal files
 * refuse before open; guards must still prove a stable closed database image. */
async function verifyMetadata(
  filename: string,
  control: Control,
  verify: (db: DatabaseSync) => Promise<void>,
) {
  let db: DatabaseSync | undefined,
    failure: Code | undefined,
    cleanup: Cleanup = 'SETTLED';
  try {
    await control.checkpoint();
    const guard = await immutableGuard(filename);
    await guard();
    db = new DatabaseSync(pathToFileURL(filename).href + '?mode=ro&immutable=1', {
      readOnly: true,
      allowExtension: false,
    });
    db.exec('PRAGMA query_only=ON; BEGIN');
    await verify(db);
    db.exec('ROLLBACK');
    await guard();
    await control.checkpoint();
  } catch (error) {
    failure = stopCode(error);
    if (
      error &&
      typeof error === 'object' &&
      !types.isProxy(error) &&
      Object.getOwnPropertyDescriptor(error, 'cleanupState')?.value === 'UNKNOWN'
    )
      cleanup = 'UNKNOWN';
  } finally {
    if (db)
      try {
        db.close();
        if (db.isOpen) cleanup = 'UNKNOWN';
      } catch {
        cleanup = 'UNKNOWN';
      }
  }
  if (failure || cleanup === 'UNKNOWN')
    throw new WorkspaceInitializationError(
      failure ?? 'WORKSPACE_INITIALIZATION_FAILED',
      'NOT_COMMITTED',
      cleanup,
    );
}
function settleBudget(completion: unknown) {
  if (completion !== undefined) {
    if (types.isPromise(completion))
      void Promise.prototype.then.call(completion, undefined, () => undefined);
    throw new WorkspaceInitializationError(
      'WORKSPACE_INITIALIZATION_FAILED',
      'NOT_COMMITTED',
      'UNKNOWN',
    );
  }
}
export async function verifyWorkspaceInitialization(
  value: unknown,
  control: Control,
): Promise<void> {
  const input = ownInput(value);
  settleBudget(control.reserveText(Buffer.byteLength(JSON.stringify(input))));
  await verifyMetadata(input.databasePath, control, async (db) => {
    const count = (sql: string, params: string[] = []) => {
      settleBudget(control.chargeMetadataRow());
      const row = db.prepare(sql).get(...params);
      assert(row && typeof row.n === 'number' && Number.isSafeInteger(row.n));
      return row.n;
    };
    assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, 8);
    assert.equal(count('SELECT count(*) n FROM workspace'), 1);
    assert.equal(
      count('SELECT count(*) n FROM workspace WHERE slot=1 AND id=? AND root_path=?', [
        input.workspaceId,
        input.workspaceRoot,
      ]),
      1,
    );
    assert.equal(count('SELECT count(*) n FROM repositories'), input.repositories.length);
    for (const r of input.repositories) {
      await control.checkpoint();
      assert.equal(
        count(
          'SELECT count(*) n FROM repositories WHERE repository_id=? AND workspace_id=? AND root_path=?',
          [r.repositoryId, input.workspaceId, r.repositoryRoot],
        ),
        1,
      );
    }
  });
}
export async function initializeRepositoryMetadata(
  input: { databasePath: string; repositoryId: string; repositoryRoot: string },
  control: Control,
): Promise<void> {
  const plan = await loadMigrationPlan(
    new URL('../../migrations/repository/manifest.json', import.meta.url),
    'REPOSITORY',
  );
  assert.equal(plan.latestVersion, 13);
  let session: Awaited<ReturnType<typeof openRepositoryIndexSession>> | undefined,
    failure: Code | undefined,
    cleanup: Cleanup = 'SETTLED';
  let controlFailure: Code | undefined;
  const stopped = (error: unknown): never => {
    const code = stopCode(error);
    if (code !== 'WORKSPACE_INITIALIZATION_FAILED') controlFailure = code;
    throw error;
  };
  const tracked = {
    async checkpoint() {
      try {
        await control.checkpoint();
      } catch (error) {
        stopped(error);
      }
    },
    reserveText(bytes: number) {
      try {
        settleBudget(control.reserveText(bytes));
      } catch (error) {
        stopped(error);
      }
    },
    chargeMetadataRow() {
      try {
        settleBudget(control.chargeMetadataRow());
      } catch (error) {
        stopped(error);
      }
    },
  };
  try {
    session = await openRepositoryIndexSession(
      {
        ...input,
        repositoryId: EntityIdSchema.parse(input.repositoryId),
        initialize: true,
        readOnly: false,
      },
      tracked,
    );
    assert.equal(session.database.prepare('PRAGMA user_version').get()?.user_version, 13);
  } catch (error) {
    failure = controlFailure ?? stopCode(error);
    if (!session) cleanup = 'UNKNOWN';
  } finally {
    if (session)
      try {
        session.close();
        if (session.database.isOpen) cleanup = 'UNKNOWN';
      } catch {
        cleanup = 'UNKNOWN';
      }
  }
  if (failure || cleanup === 'UNKNOWN')
    throw new WorkspaceInitializationError(
      failure ?? 'WORKSPACE_INITIALIZATION_FAILED',
      session ? 'COMMITTED' : 'UNKNOWN',
      cleanup,
    );
}
export async function verifyRepositoryInitialization(
  input: { databasePath: string; repositoryId: string; repositoryRoot: string },
  control: Control,
): Promise<void> {
  EntityIdSchema.parse(input.repositoryId);
  absolute(input.databasePath);
  absolute(input.repositoryRoot);
  settleBudget(control.reserveText(Buffer.byteLength(JSON.stringify(input))));
  await verifyMetadata(input.databasePath, control, async (db) => {
    assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, 13);
    const count = (sql: string, params: string[] = []) => {
      settleBudget(control.chargeMetadataRow());
      const r = db.prepare(sql).get(...params);
      assert(r && typeof r.n === 'number' && Number.isSafeInteger(r.n));
      return r.n;
    };
    assert.equal(count('SELECT count(*) n FROM repository'), 1);
    assert.equal(
      count('SELECT count(*) n FROM repository WHERE slot=1 AND id=? AND root_path=?', [
        input.repositoryId,
        input.repositoryRoot,
      ]),
      1,
    );
    assert.equal(
      count('SELECT count(*) n FROM repository_state WHERE repository_id=?', [input.repositoryId]),
      1,
    );
  });
}
