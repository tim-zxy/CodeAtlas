import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ContentFingerprintSchema, EntityIdSchema, WorktreeRevisionSchema } from '@codeatlas/ir';
import type { EntityId, WorktreeRevision, ContentFingerprint } from '@codeatlas/ir';
import { loadMigrationPlan } from '../migrations/manifest.js';
import { applyMigrationPlan } from '../migrations/runner.js';
import { RepositorySourceStateStore } from '../source-state/repository.js';

export class StorageIndexSessionError extends Error {
  constructor(
    readonly code:
      | 'DATABASE_UNAVAILABLE'
      | 'DATABASE_ALREADY_EXISTS'
      | 'DATABASE_KIND_MISMATCH'
      | 'DATABASE_UPGRADE_REQUIRED'
      | 'DATABASE_TOO_NEW'
      | 'REPOSITORY_MISMATCH'
      | 'RESOURCE_LIMIT_EXCEEDED'
      | 'CANCELLED'
      | 'INDEX_DATA_INVALID',
  ) {
    super('Repository index session could not acquire valid bound state.');
    this.name = 'StorageIndexSessionError';
  }
}
type IndexControl = {
  checkpoint(): Promise<void>;
  reserveText(bytes: number): void;
  chargeMetadataRow(): void;
};
type Row = Record<string, unknown>;
type StatusView = {
  source: WorktreeRevision | null;
  indexed: { revisionId: EntityId | null; contentFingerprint: ContentFingerprint | null };
  freshness: {
    basis: 'PERSISTED_SOURCE';
    worktree: 'NOT_OBSERVED';
    state: 'NOT_INDEXED' | 'CURRENT' | 'STALE' | 'UNKNOWN';
  };
  baseline: { state: 'MISSING' | 'LEGACY' | 'PRESENT_UNVERIFIED' };
  coverage: {
    scope: 'PERSISTED_NATIVE_SNAPSHOT';
    snapshotId: EntityId | null;
    capabilities: {
      name: string;
      complete: number;
      partial: number;
      none: number;
      unknown: number;
    }[];
  };
};
export type RepositoryIndexSession = {
  database: DatabaseSync;
  sourceState: RepositorySourceStateStore;
  initialized: boolean;
  readStatus(): Promise<StatusView>;
  close(): void;
};
function invalid(): never {
  throw new StorageIndexSessionError('INDEX_DATA_INVALID');
}

const sessionLifetime = new AsyncLocalStorage<{
  active: boolean;
  opened: number;
  checked: number;
  closed: number;
  transactionClosed: boolean;
  tempClosed: boolean;
  captureFailed: boolean;
}>();

/** Private diagnostics of this Storage owner's connections, not admission authority.
 * No SQL is added outside an explicit observer. Keep absent acquisition unknown.
 */
export async function observeRepositoryIndexSessionLifetime<T>(operation: () => T | Promise<T>) {
  const owner = {
    active: true,
    opened: 0,
    checked: 0,
    closed: 0,
    transactionClosed: true,
    tempClosed: true,
    captureFailed: false,
  };
  return sessionLifetime.run(owner, async () => {
    let value: T | undefined;
    let error: unknown;
    let threw = false;
    try {
      value = await operation();
    } catch (failure) {
      threw = true;
      error = failure;
    } finally {
      owner.active = false;
    }
    const allChecked = owner.opened > 0 && owner.checked === owner.opened && !owner.captureFailed;
    return {
      value,
      error,
      threw,
      evidence: Object.freeze({
        scope: 'REPOSITORY_INDEX_SESSION_LIFETIME_ONLY' as const,
        openedConnections: owner.opened,
        closedConnections: owner.closed,
        transactionClosed: allChecked ? owner.transactionClosed : null,
        tempClosed: allChecked ? owner.tempClosed : null,
        connectionClosed:
          owner.opened === 0 ? null : owner.closed === owner.opened && !owner.captureFailed,
        captureFailed: owner.captureFailed,
      }),
    };
  });
}

function ownDatabaseClose(db: DatabaseSync): () => void {
  const owner = sessionLifetime.getStore();
  if (owner?.active) owner.opened++;
  return () => {
    if (owner?.active) {
      try {
        owner.transactionClosed &&= !db.isTransaction;
        const objects = db
          .prepare("SELECT count(*) AS n FROM sqlite_temp_schema WHERE name NOT LIKE 'sqlite_%'")
          .get()!.n;
        const sequence = db
          .prepare("SELECT count(*) AS n FROM sqlite_temp_schema WHERE name='sqlite_sequence'")
          .get()!.n;
        const rows =
          sequence === 0
            ? 0
            : db.prepare('SELECT count(*) AS n FROM temp.sqlite_sequence').get()!.n;
        if (
          ![objects, sequence, rows].every(
            (n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0,
          )
        )
          throw new Error('Invalid session closure observation');
        owner.tempClosed &&= objects === 0 && rows === 0;
        owner.checked++;
      } catch {
        // Observation never replaces the original close/result/error.
        owner.captureFailed = true;
      }
    }
    try {
      db.close();
    } finally {
      if (owner?.active && !db.isOpen) owner.closed++;
    }
  };
}

export async function openRepositoryIndexSession(
  input: {
    databasePath: string;
    repositoryId: EntityId;
    repositoryRoot?: string;
    initialize: boolean;
    readOnly: boolean;
  },
  control: IndexControl,
): Promise<RepositoryIndexSession> {
  await control.checkpoint();
  if (
    !input ||
    typeof input.databasePath !== 'string' ||
    !input.databasePath.trim() ||
    input.databasePath.trim() !== input.databasePath ||
    input.databasePath.includes('\0') ||
    input.databasePath === ':memory:' ||
    /^file:|^[a-z][a-z\d+.-]*:\/\//i.test(input.databasePath) ||
    typeof input.initialize !== 'boolean' ||
    typeof input.readOnly !== 'boolean' ||
    (input.initialize && input.readOnly)
  )
    throw new StorageIndexSessionError('DATABASE_UNAVAILABLE');
  const id = EntityIdSchema.parse(input.repositoryId);
  const filename = path.resolve(input.databasePath);
  let root: string | undefined;
  if (input.repositoryRoot !== undefined) {
    root = await realpath(path.resolve(input.repositoryRoot));
    if (!(await lstat(root)).isDirectory())
      throw new StorageIndexSessionError('REPOSITORY_MISMATCH');
  }
  if (!input.readOnly && root === undefined)
    throw new StorageIndexSessionError('REPOSITORY_MISMATCH');
  const plan = await loadMigrationPlan(
    new URL('../../migrations/repository/manifest.json', import.meta.url),
    'REPOSITORY',
  );
  let lease;
  let database: DatabaseSync | undefined;
  let closeDatabase: (() => void) | undefined;
  try {
    if ((await realpath(path.dirname(filename))) !== path.dirname(filename))
      throw new StorageIndexSessionError('DATABASE_UNAVAILABLE');
    if (input.initialize) {
      try {
        lease = await open(filename, 'wx');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST')
          throw new StorageIndexSessionError('DATABASE_ALREADY_EXISTS');
        throw new StorageIndexSessionError('DATABASE_UNAVAILABLE');
      }
    }
    const before = await lstat(filename);
    if (!before.isFile() || before.nlink !== 1 || (await realpath(filename)) !== filename)
      throw new StorageIndexSessionError('DATABASE_UNAVAILABLE');
    const assertIdentity = async () => {
      const current = await lstat(filename);
      if (
        !current.isFile() ||
        current.nlink !== 1 ||
        current.dev !== before.dev ||
        current.ino !== before.ino ||
        (await realpath(filename)) !== filename
      )
        throw new StorageIndexSessionError('DATABASE_UNAVAILABLE');
    };
    await control.checkpoint();
    await assertIdentity();
    database = new DatabaseSync(filename, {
      readOnly: input.readOnly,
      allowExtension: false,
      enableForeignKeyConstraints: true,
    });
    closeDatabase = ownDatabaseClose(database);
    await assertIdentity();
    if (input.initialize) applyMigrationPlan(database, plan);
    await assertIdentity();
    if (
      database
        .prepare("SELECT 1 AS found FROM sqlite_schema WHERE type='table' AND name='workspace'")
        .get()
    )
      throw new StorageIndexSessionError('DATABASE_KIND_MISMATCH');
    const version = database.prepare('PRAGMA user_version').get()?.user_version;
    if (!Number.isSafeInteger(version)) invalid();
    if ((version as number) > plan.latestVersion)
      throw new StorageIndexSessionError('DATABASE_TOO_NEW');
    if ((version as number) < (input.readOnly ? 8 : plan.latestVersion))
      throw new StorageIndexSessionError('DATABASE_UPGRADE_REQUIRED');
    if (
      database
        .prepare("SELECT 1 AS found FROM sqlite_schema WHERE type='table' AND name='workspace'")
        .get()
    )
      throw new StorageIndexSessionError('DATABASE_KIND_MISMATCH');
    if (input.initialize) {
      database.exec('BEGIN IMMEDIATE');
      try {
        database.prepare('INSERT INTO repository(slot,id,root_path) VALUES(1,?,?)').run(id, root!);
        database.prepare('INSERT INTO repository_state(repository_id) VALUES(?)').run(id);
        database.exec('COMMIT');
      } catch (error) {
        if (database.isTransaction) database.exec('ROLLBACK');
        throw error;
      }
    }
    const db = database;
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      try {
        if (db.isTransaction) db.exec('ROLLBACK');
      } finally {
        closeDatabase!();
      }
    }
    const fields: Record<string, string[]> = {
      repository: ['id', 'root_path'],
      repository_state: ['indexed_revision_id', 'indexed_content_fingerprint'],
      revisions: ['id', 'repository_id', 'kind', 'content_fingerprint', 'base_revision_id'],
      native_analysis_state: ['provider_snapshot_id', 'revision_id', 'content_fingerprint'],
      provider_snapshots: [
        'repository_id',
        'provider_id',
        'requested_revision_id',
        'requested_revision_fingerprint',
        'outcome',
      ],
    };
    async function single(
      table: string,
      where: string,
      params: (string | number)[],
    ): Promise<Row | null> {
      if (closed) invalid();
      const names = fields[table];
      if (!names) invalid();
      const bytes = names
        .map(
          (name) =>
            `CASE WHEN typeof(${name})='text' THEN length(CAST(${name} AS BLOB)) ELSE 0 END`,
        )
        .join('+');
      const blobs = names
        .map((name) => `CASE WHEN typeof(${name})='blob' THEN 1 ELSE 0 END`)
        .join('+');
      const sizes = db
        .prepare(
          `SELECT rowid AS chosen, (${bytes}) AS bytes, (${blobs}) AS blobs FROM ${table} WHERE ${where} ORDER BY rowid`,
        )
        .iterate(...params);
      let found: Row | null = null;
      try {
        for (const size of sizes) {
          await control.checkpoint();
          if (
            found !== null ||
            typeof size.chosen !== 'number' ||
            !Number.isSafeInteger(size.chosen) ||
            size.blobs !== 0 ||
            typeof size.bytes !== 'number' ||
            !Number.isSafeInteger(size.bytes) ||
            size.bytes < 0
          )
            invalid();
          control.chargeMetadataRow();
          control.reserveText(size.bytes);
          const row = db
            .prepare(`SELECT ${names.join(',')} FROM ${table} WHERE rowid=?`)
            .get(size.chosen);
          if (!row || names.some((name) => row[name] !== null && typeof row[name] !== 'string'))
            invalid();
          found = row;
        }
      } finally {
        sizes.return?.();
      }
      return found;
    }
    if (input.readOnly) db.exec('PRAGMA query_only=ON');
    db.exec('BEGIN');
    try {
      const bound = await single('repository', 'slot=1', []);
      if (bound?.id !== id || (root !== undefined && bound.root_path !== root))
        throw new StorageIndexSessionError('REPOSITORY_MISMATCH');
    } finally {
      if (!input.readOnly && db.isTransaction) db.exec('ROLLBACK');
    }
    const readStatus = async (): Promise<StatusView> => {
      if (closed) invalid();
      const ownsSnapshot = !db.isTransaction;
      if (ownsSnapshot) db.exec('BEGIN');
      try {
        const row = await single('repository_state', 'repository_id=?', [id]);
        if (!row) invalid();
        const revision = await single('revisions', "repository_id=? AND kind='WORKTREE'", [id]);
        const source =
          revision === null
            ? null
            : WorktreeRevisionSchema.parse({
                id: revision.id,
                repositoryId: revision.repository_id,
                kind: revision.kind,
                contentFingerprint: revision.content_fingerprint,
                baseRevisionId: revision.base_revision_id,
              });
        const indexed = {
          revisionId:
            row.indexed_revision_id === null ? null : EntityIdSchema.parse(row.indexed_revision_id),
          contentFingerprint:
            row.indexed_content_fingerprint === null
              ? null
              : ContentFingerprintSchema.parse(row.indexed_content_fingerprint),
        };
        const state =
          indexed.revisionId === null && indexed.contentFingerprint === null
            ? 'NOT_INDEXED'
            : indexed.revisionId === null || indexed.contentFingerprint === null || source === null
              ? 'UNKNOWN'
              : indexed.revisionId === source.id &&
                  indexed.contentFingerprint === source.contentFingerprint
                ? 'CURRENT'
                : 'STALE';
        const native =
          (version as number) >= 10
            ? await single('native_analysis_state', 'repository_id=? AND provider_id=?', [
                id,
                'native',
              ])
            : null;
        const snapshotId =
          native === null ? null : EntityIdSchema.parse(native.provider_snapshot_id);
        if (native !== null && snapshotId !== null) {
          const snapshot = await single('provider_snapshots', 'id=?', [snapshotId]);
          if (
            !snapshot ||
            snapshot.repository_id !== id ||
            snapshot.provider_id !== 'native' ||
            snapshot.outcome !== 'SUCCEEDED' ||
            snapshot.requested_revision_id !== native.revision_id ||
            snapshot.requested_revision_fingerprint !== native.content_fingerprint
          )
            invalid();
          EntityIdSchema.parse(native.revision_id);
          ContentFingerprintSchema.parse(native.content_fingerprint);
        }
        const capabilities: StatusView['coverage']['capabilities'] = [];
        if (snapshotId !== null) {
          const names = db
            .prepare(
              'SELECT min(rowid) AS chosen, length(CAST(capability_name AS BLOB)) AS bytes, typeof(capability_name) AS storage_type FROM analysis_coverage WHERE provider_snapshot_id=? GROUP BY capability_name ORDER BY capability_name',
            )
            .iterate(snapshotId);
          try {
            for (const cap of names) {
              await control.checkpoint();
              control.chargeMetadataRow();
              if (
                cap.storage_type !== 'text' ||
                typeof cap.chosen !== 'number' ||
                !Number.isSafeInteger(cap.chosen) ||
                typeof cap.bytes !== 'number' ||
                !Number.isSafeInteger(cap.bytes) ||
                cap.bytes < 0
              )
                invalid();
              control.reserveText(cap.bytes);
              const name = db
                .prepare('SELECT capability_name AS name FROM analysis_coverage WHERE rowid=?')
                .get(cap.chosen)?.name;
              if (typeof name !== 'string' || !name.trim()) invalid();
              const counts = db
                .prepare(
                  "SELECT SUM(status='COMPLETE') AS complete,SUM(status='PARTIAL') AS partial,SUM(status='NONE') AS none,SUM(status='UNKNOWN') AS unknown FROM analysis_coverage WHERE provider_snapshot_id=? AND capability_name=?",
                )
                .get(snapshotId, name)!;
              for (const n of Object.values(counts))
                if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) invalid();
              capabilities.push({
                name,
                complete: counts.complete as number,
                partial: counts.partial as number,
                none: counts.none as number,
                unknown: counts.unknown as number,
              });
            }
          } finally {
            names.return?.();
          }
        }
        return {
          source,
          indexed,
          freshness: { basis: 'PERSISTED_SOURCE', worktree: 'NOT_OBSERVED', state },
          baseline: {
            state:
              native !== null
                ? 'PRESENT_UNVERIFIED'
                : state === 'NOT_INDEXED'
                  ? 'MISSING'
                  : 'LEGACY',
          },
          coverage: { scope: 'PERSISTED_NATIVE_SNAPSHOT', snapshotId, capabilities },
        };
      } catch (error) {
        if (error instanceof StorageIndexSessionError) throw error;
        invalid();
      } finally {
        if (ownsSnapshot && db.isTransaction) db.exec('ROLLBACK');
      }
    };
    await lease?.close();
    lease = undefined;
    return {
      database: db,
      initialized: input.initialize,
      sourceState: new RepositorySourceStateStore(db),
      readStatus,
      close,
    };
  } catch (error) {
    if (database?.isOpen) {
      if (database.isTransaction) database.exec('ROLLBACK');
      closeDatabase!();
    }
    if (error instanceof StorageIndexSessionError) throw error;
    if (
      ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(
        (error as NodeJS.ErrnoException)?.code ?? '',
      )
    )
      throw new StorageIndexSessionError('DATABASE_UNAVAILABLE');
    throw new StorageIndexSessionError('INDEX_DATA_INVALID');
  } finally {
    await lease?.close();
  }
}
