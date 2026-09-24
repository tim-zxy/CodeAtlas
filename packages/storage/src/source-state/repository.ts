import { DatabaseSync } from 'node:sqlite';
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

type Row = Record<string, unknown>;

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

function parseFile(row: Row): SourceFile {
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

  private assertRegistered(repositoryId: EntityId): void {
    const row = this.database.prepare('SELECT id FROM repository WHERE id = ?').get(repositoryId);
    if (row === undefined) {
      throw new SourceStateError('REPOSITORY_NOT_REGISTERED');
    }
    if (
      this.database
        .prepare('SELECT repository_id FROM repository_state WHERE repository_id = ?')
        .get(repositoryId) === undefined
    ) {
      invalid();
    }
  }

  load(repositoryId: EntityId): StoredWorktreeState | null {
    try {
      const id = parseIr(EntityIdSchema, repositoryId);
      this.assertRegistered(id);
      const revisions = this.database
        .prepare("SELECT * FROM revisions WHERE repository_id = ? AND kind = 'WORKTREE'")
        .all(id) as Row[];
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
      return validateState({ revision, files: rows.map(parseFile) });
    } catch (error) {
      if (error instanceof SourceStateError) throw error;
      return invalid();
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
