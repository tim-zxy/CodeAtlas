import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { types, isDeepStrictEqual } from 'node:util';
import { EntityIdSchema, type EntityId } from '@codeatlas/ir';
import {
  readCodeContextSnapshot,
  CaptureError,
  fail,
  databaseOpen,
  limitsOf,
  wellFormed,
  type RepositoryCodeContextView,
  type CodeContextCaptureLimits,
  type CapturedRepositoryCodeContext,
} from './code-context-read.js';
export type {
  RepositoryCodeContextView,
  CodeContextCaptureLimits,
  CapturedRepositoryCodeContext,
} from './code-context-read.js';
const owned = new WeakMap<
  object,
  {
    db: DatabaseSync;
    view: RepositoryCodeContextView | null;
    marker: StatementSync | null;
    live: boolean;
  }
>();

export function captureRepositoryCodeContext(
  db: DatabaseSync,
  repositoryId: EntityId,
  input: CodeContextCaptureLimits,
): CapturedRepositoryCodeContext {
  let transaction = false;
  try {
    if (!databaseOpen(db) || db.isTransaction) fail();
    const limits = limitsOf(input),
      id = EntityIdSchema.parse(repositoryId);
    wellFormed(id);
    db.exec('BEGIN');
    transaction = true;
    const view = readCodeContextSnapshot(db, id, limits, { schemaVersion: 10 }).view;
    db.exec('COMMIT');
    transaction = false;
    const marker = db.prepare('SELECT 1 WHERE 0');
    const handle = Object.freeze({});
    owned.set(handle, { db, view, marker, live: true });
    return Object.freeze({ handle, view });
  } catch (e) {
    if (e instanceof CaptureError) throw e;
    return fail();
  } finally {
    if (transaction)
      try {
        db.exec('ROLLBACK');
      } catch {
        /* Never disclose SQL or disturb a caller-owned transaction. */
      }
  }
}
function owner(db: DatabaseSync, handle: object) {
  if (typeof handle !== 'object' || handle === null || types.isProxy(handle)) fail();
  const entry = owned.get(handle);
  if (!entry || entry.db !== db) fail();
  return entry;
}
function invalidate(entry: ReturnType<typeof owner>): void {
  entry.live = false;
  entry.marker = null;
  entry.view = null;
}
function assertIncarnation(entry: ReturnType<typeof owner>): void {
  if (!databaseOpen(entry.db)) fail('CODE_CAPTURE_RELEASED');
  // Prepared statements are finalized by native connection close. A same-object
  // reopen cannot restore this private marker. No SQL is executed or row read.
  try {
    entry.marker!.setReadBigInts(false);
  } catch {
    return fail('CODE_CAPTURE_RELEASED');
  }
}
export function recheckRepositoryCodeContext(
  db: DatabaseSync,
  handle: object,
  input: CodeContextCaptureLimits,
): void {
  const entry = owner(db, handle);
  if (!entry.live) fail('CODE_CAPTURE_RELEASED');
  let transaction = false;
  try {
    assertIncarnation(entry);
    if (db.isTransaction) fail();
    const limits = limitsOf(input),
      old = entry.view!;
    db.exec('BEGIN');
    transaction = true;
    const fresh = readCodeContextSnapshot(db, old.repositoryId, limits, { schemaVersion: 10 }).view;
    db.exec('COMMIT');
    transaction = false;
    if (!isDeepStrictEqual(old, fresh)) fail('CODE_CAPTURE_CHANGED');
  } catch (e) {
    invalidate(entry);
    if (e instanceof CaptureError) throw e;
    return fail();
  } finally {
    if (transaction)
      try {
        db.exec('ROLLBACK');
      } catch {
        /* Only this function's transaction is ours. */
      }
  }
}
export function releaseRepositoryCodeContext(db: DatabaseSync, handle: object): void {
  const entry = owner(db, handle);
  if (!entry.live) return;
  try {
    assertIncarnation(entry);
  } finally {
    invalidate(entry);
  }
}
