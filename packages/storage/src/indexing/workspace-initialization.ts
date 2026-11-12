// Private Storage leaf for a new explicit database; no CLI layout/defaults or access grant.
import assert from 'node:assert/strict';
import { types } from 'node:util';
import { lstat, open, realpath } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { EntityIdSchema, ensurePhase1Data } from '@codeatlas/ir';
import { loadMigrationPlan } from '../migrations/manifest.js';
import { applyMigrationPlan } from '../migrations/runner.js';

type Effect = 'NOT_COMMITTED' | 'COMMITTED' | 'UNKNOWN';
type Cleanup = 'SETTLED' | 'UNKNOWN';
type Code =
  | 'WORKSPACE_INPUT_INVALID'
  | 'DATABASE_ALREADY_EXISTS'
  | 'WORKSPACE_INITIALIZATION_FAILED'
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
    failure ??= ['CANCELLED', 'RESOURCE_LIMIT_EXCEEDED', 'BUDGET_EXCEEDED'].includes(code)
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
