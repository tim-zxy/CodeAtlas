import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { types } from 'node:util';
import {
  CommitIdentitySchema,
  EntityIdSchema,
  SourceFileSchema,
  WorktreeRevisionSchema,
  RepositorySchema,
  parseIr,
  validateRevisionTransition,
} from '@codeatlas/ir';
import type {
  CommitIdentity,
  EntityId,
  SourceFile,
  WorktreeRevision,
  Repository,
} from '@codeatlas/ir';
import { SourceStateError } from './errors.js';
import type { StoredWorktreeState } from './types.js';
import {
  beginNativeSqlSourceDomain,
  replaceNativeSqlSourceDomain,
  endNativeSqlSourceDomain,
  nativeSqlSourceRole,
  type NativeSqlDomainHandle,
} from '../analysis/native-apply-sql-observation.js';

import {
  HistoryReadBudget,
  HistoryCaptureError,
  requireHistory,
  encodeHistoryValue,
} from '../analysis/activation-history-format.js';
import {
  borrowMixedSourceBudget,
  assertMixedSourceAccount,
  checkpointOwnedSourceSql,
  MixedSourceAccountError,
} from '../analysis/mixed-source-account.js';
import { MixedAnalysisError } from '../analysis/mixed-analysis-state.js';

type Row = Record<string, unknown>;

const sourceReadOwners = new AsyncLocalStorage<Set<NativeSqlDomainHandle>>();

/** Private leaf instrumentation: caller owns returned SQL aliases until settlement. */
export function withNativeSourceStateReadLifetime<T>(operation: () => T): T {
  if (nativeSqlSourceRole() === null) return operation();
  const owners = new Set<NativeSqlDomainHandle>();
  const close = () => {
    for (const handle of owners) endNativeSqlSourceDomain(handle);
    owners.clear();
  };
  return sourceReadOwners.run(owners, () => {
    let pending = false;
    try {
      const result = operation();
      if (types.isPromise(result)) {
        pending = true;
        return result.finally(close) as T;
      }
      return result;
    } finally {
      if (!pending) close();
    }
  });
}

function invalid(): never {
  throw new SourceStateError('SOURCE_STATE_INVALID');
}

function parseRevision(row: Row, budget?: HistoryReadBudget): WorktreeRevision {
  try {
    const value = {
      id: row.id,
      repositoryId: row.repository_id,
      kind: row.kind,
      contentFingerprint: row.content_fingerprint,
      baseRevisionId: row.base_revision_id,
    };
    budget?.own(value);
    return parseIr(WorktreeRevisionSchema, value);
  } catch (e) {
    if (budget && boundedFailure(e)) throw e;
    return invalid();
  }
}

function parseSourceFile(row: Row, budget?: HistoryReadBudget): SourceFile {
  try {
    const value = {
      id: row.id,
      repositoryId: row.repository_id,
      revisionId: row.revision_id,
      path: row.path,
      contentFingerprint: row.content_fingerprint,
      classification: {
        role: row.role,
        provenance: row.provenance,
        contentKind: row.content_kind,
      },
      languageHint: row.language_hint,
      sensitivity: row.sensitivity,
    };
    budget?.own(value);
    return parseIr(SourceFileSchema, value);
  } catch (e) {
    if (budget && boundedFailure(e)) throw e;
    return invalid();
  }
}

export function parseStoredSourceFile(row: Row): SourceFile {
  return parseSourceFile(row);
}

function validateState(state: StoredWorktreeState): StoredWorktreeState {
  try {
    const revision = parseIr(WorktreeRevisionSchema, state.revision);
    const files = state.files.map((file) => parseIr(SourceFileSchema, file));
    const ids = new Set<string>();
    const paths = new Set<string>();
    for (const file of files) {
      if (
        file.repositoryId !== revision.repositoryId ||
        file.revisionId !== revision.id ||
        ids.has(file.id) ||
        paths.has(file.path)
      ) {
        return invalid();
      }
      ids.add(file.id);
      paths.add(file.path);
    }
    files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
    return { revision, files };
  } catch {
    return invalid();
  }
}

function sameState(left: StoredWorktreeState | null, right: StoredWorktreeState | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class RepositorySourceStateStore {
  constructor(private readonly database: DatabaseSync) {}

  private assertRegistered(repositoryId: EntityId, observe?: (row: Row | undefined) => void): void {
    const c = boundSources.get(this);
    if (c) {
      if (repositoryId !== c.repository.id) invalid();
      sourceCheckpoint(c);
      c.budget.add('rows', 1);
      c.budget.own({ n: 0 });
      const encoding = this.database
        .prepare("SELECT CASE WHEN encoding='UTF-8' THEN 1 ELSE 0 END AS n FROM pragma_encoding")
        .get();
      if (encoding?.n !== 1) invalid();
      const row = sourceRows(
        this.database,
        c,
        'repository',
        sourceColumns.repository,
        'slot=1',
        [],
        observe,
      )[0];
      if (!row || row.id !== repositoryId || row.root_path !== c.repository.rootPath) invalid();
      const state = sourceRows(
        this.database,
        c,
        'repository_state',
        sourceColumns.repository_state,
        'repository_id=?',
        [repositoryId],
        observe,
      )[0];
      if (!state) invalid();
      return;
    }
    const row = this.database.prepare('SELECT id FROM repository WHERE id = ?').get(repositoryId);
    observe?.(row);
    if (row === undefined) {
      throw new SourceStateError('REPOSITORY_NOT_REGISTERED');
    }
    const state = this.database
      .prepare('SELECT repository_id FROM repository_state WHERE repository_id = ?')
      .get(repositoryId);
    observe?.(state);
    if (state === undefined) {
      invalid();
    }
  }

  load(repositoryId: EntityId): StoredWorktreeState | null {
    const c = boundSources.get(this);
    return c
      ? sourceOperation(this.database, c, true, () => this.loadOwned(repositoryId))
      : this.loadOwned(repositoryId);
  }

  private loadOwned(repositoryId: EntityId): StoredWorktreeState | null {
    const c = boundSources.get(this);
    const owners = sourceReadOwners.getStore();
    const role = nativeSqlSourceRole();
    let handle: NativeSqlDomainHandle | null = null;
    let retained = 0;
    let handedOff = false;
    const observe = (row: Row | undefined) => {
      if (!owners || role === null || row === undefined) return;
      for (const value of Object.values(row))
        if (typeof value === 'string') retained += Buffer.byteLength(value);
      if (handle === null) handle = beginNativeSqlSourceDomain('BASELINE_READ', role, retained);
      else replaceNativeSqlSourceDomain(handle, retained);
    };
    try {
      const id = parseIr(EntityIdSchema, repositoryId);
      this.assertRegistered(id, observe);
      // Registration's local raw rows do not escape its private assertion.
      retained = 0;
      if (handle !== null) replaceNativeSqlSourceDomain(handle, 0);
      const revisions = c
        ? sourceRows(
            this.database,
            c,
            'revisions',
            sourceColumns.revisions,
            "repository_id=? AND kind='WORKTREE'",
            [id],
          )
        : (this.database
            .prepare("SELECT * FROM revisions WHERE repository_id = ? AND kind = 'WORKTREE'")
            .all(id) as Row[]);
      for (const row of revisions) observe(row);
      if (revisions.length > 1) {
        throw new SourceStateError('WORKTREE_AMBIGUOUS');
      }
      if (revisions.length === 0) {
        return null;
      }
      const revision = parseRevision(revisions[0]!, c?.budget);
      const rows = c
        ? sourceRows(
            this.database,
            c,
            'source_files',
            sourceColumns.source_files,
            'revision_id=?',
            [revision.id],
          )
        : (this.database
            .prepare('SELECT * FROM source_files WHERE revision_id = ? ORDER BY path')
            .all(revision.id) as Row[]);
      for (const row of rows) observe(row);
      let files: SourceFile[];
      if (c) {
        c.budget.own([]);
        files = [];
        for (const row of rows) files.push(parseSourceFile(row, c.budget));
      } else files = rows.map(parseStoredSourceFile);
      const value = { revision, files };
      c?.budget.own(value);
      const state = validateState(value);
      if (handle !== null) {
        owners!.add(handle);
        handedOff = true;
      }
      return state;
    } catch (error) {
      if (error instanceof SourceStateError || (boundSources.has(this) && boundedFailure(error)))
        throw error;
      return invalid();
    } finally {
      if (handle !== null && !handedOff) endNativeSqlSourceDomain(handle);
    }
  }

  findCommitRevisionId(repositoryId: EntityId, commitIdentity: CommitIdentity): EntityId | null {
    const c = boundSources.get(this);
    return c
      ? sourceOperation(this.database, c, true, () =>
          this.findCommitOwned(repositoryId, commitIdentity),
        )
      : this.findCommitOwned(repositoryId, commitIdentity);
  }

  private findCommitOwned(repositoryId: EntityId, commitIdentity: CommitIdentity): EntityId | null {
    const c = boundSources.get(this);
    try {
      const id = parseIr(EntityIdSchema, repositoryId);
      const commit = parseIr(CommitIdentitySchema, commitIdentity);
      this.assertRegistered(id);
      const rows = c
        ? sourceRows(
            this.database,
            c,
            'revisions',
            ['id'],
            "repository_id=? AND kind='COMMIT' AND commit_identity=?",
            [id, commit],
          )
        : (this.database
            .prepare(
              "SELECT id FROM revisions WHERE repository_id = ? AND kind = 'COMMIT' AND commit_identity = ?",
            )
            .all(id, commit) as Row[]);
      if (rows.length > 1) invalid();
      return rows.length === 0 ? null : parseIr(EntityIdSchema, rows[0]!.id);
    } catch (error) {
      if (error instanceof SourceStateError || (boundSources.has(this) && boundedFailure(error)))
        throw error;
      return invalid();
    }
  }

  replace(expected: StoredWorktreeState | null, next: StoredWorktreeState): void {
    const c = boundSources.get(this);
    if (c) return sourceOperation(this.database, c, false, () => this.replaceOwned(expected, next));
    if (sourceReadOwners.getStore())
      return withNativeSourceStateReadLifetime(() => this.replaceOwned(expected, next));
    return this.replaceOwned(expected, next);
  }

  private replaceOwned(expected: StoredWorktreeState | null, next: StoredWorktreeState): void {
    let started = false;
    const c = boundSources.get(this);
    try {
      c?.account.own(next);
      c?.account.own(expected);
      if (c && next.revision.repositoryId !== c.repository.id) invalid();
      const validatedNext = validateState(next);
      const validatedExpected = expected === null ? null : validateState(expected);
      this.database.exec('BEGIN IMMEDIATE');
      started = true;
      if (c) c.transaction = true;
      const current = this.load(validatedNext.revision.repositoryId);
      if (
        !(c
          ? encodeHistoryValue(current, c.budget) ===
            encodeHistoryValue(validatedExpected, c.budget)
          : sameState(current, validatedExpected))
      ) {
        throw new SourceStateError('SOURCE_STATE_CONFLICT');
      }
      if (c) sourceCheckpoint(c);
      if (current !== null) {
        try {
          validateRevisionTransition(current.revision, validatedNext.revision);
        } catch {
          invalid();
        }
        this.database
          .prepare(
            'UPDATE revisions SET content_fingerprint = ?, base_revision_id = ? WHERE id = ? AND repository_id = ?',
          )
          .run(
            validatedNext.revision.contentFingerprint,
            validatedNext.revision.baseRevisionId,
            validatedNext.revision.id,
            validatedNext.revision.repositoryId,
          );
        this.database
          .prepare('DELETE FROM source_files WHERE revision_id = ?')
          .run(current.revision.id);
      } else {
        this.database
          .prepare(
            "INSERT INTO revisions (id, repository_id, kind, content_fingerprint, base_revision_id) VALUES (?, ?, 'WORKTREE', ?, ?)",
          )
          .run(
            validatedNext.revision.id,
            validatedNext.revision.repositoryId,
            validatedNext.revision.contentFingerprint,
            validatedNext.revision.baseRevisionId,
          );
      }
      const insert = this.database.prepare(
        'INSERT INTO source_files (revision_id, id, repository_id, path, content_fingerprint, role, provenance, content_kind, language_hint, sensitivity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const file of validatedNext.files) {
        if (c) sourceCheckpoint(c);
        insert.run(
          file.revisionId,
          file.id,
          file.repositoryId,
          file.path,
          file.contentFingerprint,
          file.classification.role,
          file.classification.provenance,
          file.classification.contentKind,
          file.languageHint,
          file.sensitivity,
        );
      }
      if (c) sourceCheckpoint(c);
      this.database.exec('COMMIT');
    } catch (error) {
      if (started && this.database.isTransaction) {
        try {
          this.database.exec('ROLLBACK');
        } catch {
          // Preserve the original failure category without exposing SQLite details.
        }
      }
      if (error instanceof SourceStateError || (boundSources.has(this) && boundedFailure(error)))
        throw error;
      throw new SourceStateError('SOURCE_STATE_WRITE_FAILED');
    } finally {
      if (c) c.transaction = false;
    }
  }
}

type SourceAccount = ReturnType<typeof borrowMixedSourceBudget>;
const sourceColumns = {
  repository: ['id', 'root_path'],
  repository_state: ['repository_id'],
  revisions: ['id', 'repository_id', 'kind', 'content_fingerprint', 'base_revision_id'],
  source_files: [
    'revision_id',
    'id',
    'repository_id',
    'path',
    'content_fingerprint',
    'role',
    'provenance',
    'content_kind',
    'language_hint',
    'sensitivity',
  ],
} as const;
type BoundSource = {
  repository: Repository;
  budget: HistoryReadBudget;
  account: SourceAccount;
  transaction: boolean;
};
const boundSources = new WeakMap<RepositorySourceStateStore, BoundSource>();
function boundedFailure(error: unknown): boolean {
  return (
    error instanceof HistoryCaptureError ||
    error instanceof MixedSourceAccountError ||
    error instanceof MixedAnalysisError
  );
}
function sourceCheckpoint(c: BoundSource): void {
  if (c.transaction) checkpointOwnedSourceSql(c.budget, c.account);
  else c.account.checkpoint();
}
function sourceOperation<T>(db: DatabaseSync, c: BoundSource, read: boolean, action: () => T): T {
  let started = false;
  try {
    sourceCheckpoint(c);
    if (db.isTransaction && !c.transaction) invalid();
    if (read && !db.isTransaction) {
      db.exec('BEGIN');
      started = c.transaction = true;
    }
    const result = action();
    if (started) {
      db.exec('COMMIT');
      c.transaction = false;
      c.account.checkpoint();
    }
    return result;
  } catch (e) {
    c.account.invalidate();
    throw e;
  } finally {
    if (started) {
      try {
        if (db.isTransaction) db.exec('ROLLBACK');
      } catch {
        /* Preserve the original read failure, never touch a foreign transaction. */
      } finally {
        c.transaction = false;
      }
    }
  }
}
function sourceRows(
  db: DatabaseSync,
  c: BoundSource,
  table: keyof typeof sourceColumns,
  columns: readonly string[],
  where: string,
  args: SQLInputValue[],
  observe?: (row: Row) => void,
): Row[] {
  const b = c.budget;
  sourceCheckpoint(c);
  const size = columns.map((k) => 'coalesce(length(CAST(' + k + ' AS BLOB)),0)').join('+');
  b.add('rows', 1);
  b.own({ n: 0, bytes: 0 });
  const census = db
    .prepare(
      'SELECT count(*) AS n,coalesce(sum(' +
        size +
        '),0) AS bytes FROM ' +
        table +
        ' WHERE ' +
        where,
    )
    .get(...args)!;
  const natural = (n: unknown): number => {
    requireHistory(
      typeof n === 'number' && Number.isSafeInteger(n) && n >= 0,
      'HISTORY_LIMIT_EXCEEDED',
    );
    return n;
  };
  const count = natural(census.n),
    total = natural(census.bytes);
  requireHistory(
    count <= Math.floor((b.limits.maxRows - b.rows) / 2) &&
      total <= b.limits.maxSerializedBytes - b.serializedBytes &&
      total <= Math.floor(b.limits.memoryBudgetBytes / 2) - b.retainedLogicalBytes,
    'HISTORY_LIMIT_EXCEEDED',
  );
  b.own([]);
  const rows: Row[] = [];
  const iterator = db
    .prepare(
      'SELECT rowid AS locator,' +
        size +
        ' AS bytes FROM ' +
        table +
        ' WHERE ' +
        where +
        ' ORDER BY rowid',
    )
    .iterate(...args);
  try {
    for (let n = 0; n < count; n++) {
      sourceCheckpoint(c);
      b.add('rows', 1);
      b.own({ locator: 0, bytes: 0 });
      const location = iterator.next();
      requireHistory(!location.done, 'INVALID_HISTORY');
      const bytes = natural(location.value.bytes);
      sourceCheckpoint(c);
      b.add('rows', 1);
      b.own(Object.fromEntries(columns.map((k) => [k, null])));
      b.add('serializedBytes', bytes);
      b.pin(bytes);
      const row = db
        .prepare('SELECT ' + columns.join(',') + ' FROM ' + table + ' WHERE rowid=?')
        .get(location.value.locator as SQLInputValue);
      requireHistory(row, 'INVALID_HISTORY');
      observe?.(row);
      rows.push(row);
    }
  } finally {
    iterator.return?.();
  }
  return rows;
}
/** Same connection/account only; not a public Store API or run/admission token. */
export function createBudgetedSourceStateStore(
  db: DatabaseSync,
  repository: Repository,
  budget: HistoryReadBudget,
  account: SourceAccount,
): RepositorySourceStateStore {
  assertMixedSourceAccount(budget, account);
  requireHistory(
    !types.isProxy(db) && db instanceof DatabaseSync && db.isOpen && !db.isTransaction,
  );
  account.own(repository);
  const owned = RepositorySchema.parse(repository);
  const store = new RepositorySourceStateStore(db);
  boundSources.set(store, { repository: owned, budget, account, transaction: false });
  return store;
}
