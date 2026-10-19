import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { types } from 'node:util';
import {
  CommitIdentitySchema,
  EntityIdSchema,
  SourceFileSchema,
  WorktreeRevisionSchema,
  parseIr,
  validateRevisionTransition,
} from '@codeatlas/ir';
import type { CommitIdentity, EntityId, SourceFile, WorktreeRevision } from '@codeatlas/ir';
import { SourceStateError } from './errors.js';
import type { StoredWorktreeState } from './types.js';
import {
  beginNativeSqlSourceDomain,
  replaceNativeSqlSourceDomain,
  endNativeSqlSourceDomain,
  nativeSqlSourceRole,
  type NativeSqlDomainHandle,
} from '../analysis/native-apply-sql-observation.js';

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

function parseRevision(row: Row): WorktreeRevision {
  try {
    return parseIr(WorktreeRevisionSchema, {
      id: row.id,
      repositoryId: row.repository_id,
      kind: row.kind,
      contentFingerprint: row.content_fingerprint,
      baseRevisionId: row.base_revision_id,
    });
  } catch {
    return invalid();
  }
}

export function parseStoredSourceFile(row: Row): SourceFile {
  try {
    return parseIr(SourceFileSchema, {
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
    });
  } catch {
    return invalid();
  }
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
      const revisions = this.database
        .prepare("SELECT * FROM revisions WHERE repository_id = ? AND kind = 'WORKTREE'")
        .all(id) as Row[];
      for (const row of revisions) observe(row);
      if (revisions.length > 1) {
        throw new SourceStateError('WORKTREE_AMBIGUOUS');
      }
      if (revisions.length === 0) {
        return null;
      }
      const revision = parseRevision(revisions[0]!);
      const rows = this.database
        .prepare('SELECT * FROM source_files WHERE revision_id = ? ORDER BY path')
        .all(revision.id) as Row[];
      for (const row of rows) observe(row);
      const state = validateState({ revision, files: rows.map(parseStoredSourceFile) });
      if (handle !== null) {
        owners!.add(handle);
        handedOff = true;
      }
      return state;
    } catch (error) {
      if (error instanceof SourceStateError) throw error;
      return invalid();
    } finally {
      if (handle !== null && !handedOff) endNativeSqlSourceDomain(handle);
    }
  }

  findCommitRevisionId(repositoryId: EntityId, commitIdentity: CommitIdentity): EntityId | null {
    try {
      const id = parseIr(EntityIdSchema, repositoryId);
      const commit = parseIr(CommitIdentitySchema, commitIdentity);
      this.assertRegistered(id);
      const rows = this.database
        .prepare(
          "SELECT id FROM revisions WHERE repository_id = ? AND kind = 'COMMIT' AND commit_identity = ?",
        )
        .all(id, commit) as Row[];
      if (rows.length > 1) invalid();
      return rows.length === 0 ? null : parseIr(EntityIdSchema, rows[0]!.id);
    } catch (error) {
      if (error instanceof SourceStateError) throw error;
      return invalid();
    }
  }

  replace(expected: StoredWorktreeState | null, next: StoredWorktreeState): void {
    if (sourceReadOwners.getStore())
      return withNativeSourceStateReadLifetime(() => this.replaceOwned(expected, next));
    return this.replaceOwned(expected, next);
  }

  private replaceOwned(expected: StoredWorktreeState | null, next: StoredWorktreeState): void {
    let started = false;
    try {
      const validatedNext = validateState(next);
      const validatedExpected = expected === null ? null : validateState(expected);
      this.database.exec('BEGIN IMMEDIATE');
      started = true;
      const current = this.load(validatedNext.revision.repositoryId);
      if (!sameState(current, validatedExpected)) {
        throw new SourceStateError('SOURCE_STATE_CONFLICT');
      }
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
      this.database.exec('COMMIT');
    } catch (error) {
      if (started && this.database.isTransaction) {
        try {
          this.database.exec('ROLLBACK');
        } catch {
          // Preserve the original failure category without exposing SQLite details.
        }
      }
      if (error instanceof SourceStateError) throw error;
      throw new SourceStateError('SOURCE_STATE_WRITE_FAILED');
    }
  }
}
