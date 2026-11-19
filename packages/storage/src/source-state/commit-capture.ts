import { createHash } from 'node:crypto';
import { closeSync, openSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import {
  CommitRevisionSchema,
  SourceFileSchema,
  type CommitRevision,
  type SourceFile,
} from '@codeatlas/ir';
import {
  HistoryReadBudget,
  checkedHistoryLimits,
  exact,
  encodeHistoryValue,
  requireHistory,
  type HistoryReadLimits,
} from '../analysis/activation-history-format.js';
import { runtimeSql } from '../runtime/runtime-sql.js';

type CommitInput = {
  version: number;
  repositoryId: string;
  rootPath: string;
  commitOid: string;
  rootTreeOid: string;
  selectionCoverage: string;
  revision: CommitRevision | null;
  selectionFingerprint: string;
  inventory: readonly SourceFile[];
  files: readonly {
    path: string;
    blobOid: string;
    sizeBytes: number;
    contentFingerprint: string;
  }[];
};
type Selection = {
  repositoryId: string;
  rootPath: string;
  revision: CommitRevision;
  rootTreeOid: string;
  manifestDigest: string;
  recheck(): void;
  count: number;
  matches(file: SourceFile): boolean;
};
const fresh = new WeakMap<DatabaseSync, StatementSync>();
const selected = new WeakMap<DatabaseSync, Selection>();
const table = 'fixed_commit_capture_v1';
const header =
  'CREATE TABLE fixed_commit_capture_v1(slot INTEGER PRIMARY KEY CHECK(slot=1), manifest TEXT NOT NULL) STRICT';
const ddl = new Map([[table, header]]);
for (const name of [table, 'repository', 'revisions', 'source_files']) {
  for (const op of ['INSERT', 'UPDATE', 'DELETE']) {
    const trigger = 'fixed_commit_v1_' + name + '_' + op.toLowerCase();
    ddl.set(
      trigger,
      `CREATE TRIGGER ${trigger} BEFORE ${op} ON ${name} BEGIN SELECT RAISE(ABORT,'FIXED_COMMIT_SOURCE_IS_IMMUTABLE'); END`,
    );
  }
}
const marker = (db: DatabaseSync) =>
  !!db.prepare('SELECT 1 FROM sqlite_schema WHERE type=? AND name=?').get('table', table);

// The private file class extends the current repository layout. Ordinary files cannot be promoted.
export function openNewCommitCaptureDatabase(file: string): DatabaseSync {
  requireHistory(isAbsolute(file));
  closeSync(openSync(file, 'wx', 0o600));
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: true });
  fresh.set(db, db.prepare('SELECT 1'));
  return db;
}

function sourceRow(file: SourceFile) {
  return {
    revision_id: file.revisionId,
    id: file.id,
    repository_id: file.repositoryId,
    path: file.path,
    content_fingerprint: file.contentFingerprint,
    role: file.classification.role,
    provenance: file.classification.provenance,
    content_kind: file.classification.contentKind,
    language_hint: file.languageHint,
    sensitivity: file.sensitivity,
  };
}

// Called synchronously only from the trusted Runtime composition, inside Application's delivery check.
export function installCommitSourceCapture(
  db: DatabaseSync,
  input: CommitInput,
  limits: HistoryReadLimits,
  recheck: () => void,
) {
  const check = () => requireHistory(typeof recheck === 'function' && recheck() === undefined);
  check();
  const budget = new HistoryReadBudget(checkedHistoryLimits(limits));
  budget.own(input);
  exact(input, [
    'version',
    'repositoryId',
    'rootPath',
    'commitOid',
    'rootTreeOid',
    'selectionCoverage',
    'revision',
    'selectionFingerprint',
    'inventory',
    'files',
  ]);
  for (const entry of input.files)
    exact(entry, ['path', 'blobOid', 'sizeBytes', 'contentFingerprint']);
  requireHistory(
    input.version === 1 && input.selectionCoverage === 'COMPLETE' && input.revision !== null,
  );
  const revision = CommitRevisionSchema.parse(input.revision);
  const oid = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
  requireHistory(
    oid.test(input.commitOid) &&
      oid.test(input.rootTreeOid) &&
      input.rootTreeOid.length === input.commitOid.length &&
      revision.commitIdentity === input.commitOid &&
      revision.id === 'commit:' + input.commitOid &&
      revision.repositoryId === input.repositoryId &&
      revision.contentFingerprint === input.selectionFingerprint &&
      isAbsolute(input.rootPath),
  );
  const files = input.inventory.map((f) => SourceFileSchema.parse(f));
  const meta = new Map(input.files.map((f) => [f.path, f]));
  requireHistory(
    files.length > 0 &&
      files.length === input.files.length &&
      meta.size === files.length &&
      new Set(files.map((f) => f.id)).size === files.length &&
      new Set(files.map((f) => f.path)).size === files.length,
  );
  const expectedRows = files.map((f) => {
    const raw = meta.get(f.path);
    requireHistory(
      raw &&
        oid.test(raw.blobOid) &&
        raw.blobOid.length === input.commitOid.length &&
        Number.isSafeInteger(raw.sizeBytes) &&
        raw.sizeBytes >= 0 &&
        raw.contentFingerprint === f.contentFingerprint &&
        f.repositoryId === revision.repositoryId &&
        f.revisionId === revision.id,
    );
    return sourceRow(f);
  });
  const manifest = encodeHistoryValue(input, budget);
  const manifestDigest = createHash('sha256')
    .update('codeatlas-fixed-commit-source-v1\0')
    .update(manifest)
    .digest('hex');
  requireHistory(db.isOpen && !db.isTransaction);
  const create = !marker(db);
  if (create) {
    const initial = fresh.get(db);
    requireHistory(initial);
    initial.setReadBigInts(false);
  }
  db.exec(create ? 'BEGIN IMMEDIATE' : 'BEGIN');
  try {
    requireHistory(db.prepare('PRAGMA user_version').get()?.user_version === 13);
    const sql = runtimeSql(db, budget);
    const repos = sql.read('repository', ['id', 'root_path'], 'slot=1', []);
    requireHistory(
      repos.length === 1 &&
        repos[0]?.id === revision.repositoryId &&
        repos[0]?.root_path === input.rootPath,
    );
    const state = sql.read(
      'repository_state',
      ['indexed_revision_id', 'indexed_content_fingerprint'],
      'repository_id=?',
      [revision.repositoryId],
    );
    requireHistory(state.length === 1);
    if (create) {
      requireHistory(
        state[0]?.indexed_revision_id === null && state[0]?.indexed_content_fingerprint === null,
      );
      for (const t of [
        'revisions',
        'source_files',
        'provider_snapshots',
        'activation_history',
        'active_history_pointer',
        'runtime_state',
      ]) {
        requireHistory(!db.prepare('SELECT 1 FROM ' + t + ' LIMIT 1').get());
      }
      db.exec(header);
      sql.insert('revisions', {
        id: revision.id,
        repository_id: revision.repositoryId,
        kind: 'COMMIT',
        content_fingerprint: revision.contentFingerprint,
        commit_identity: revision.commitIdentity,
      });
      for (const row of expectedRows) sql.insert('source_files', row);
      sql.run('INSERT INTO fixed_commit_capture_v1(slot,manifest) VALUES(1,?)', [manifest]);
      for (const [name, stmt] of ddl) if (name !== table) db.exec(stmt);
    } else {
      for (const [name, stmt] of ddl)
        requireHistory(
          db.prepare('SELECT 1 FROM sqlite_schema WHERE name=? AND sql=?').get(name, stmt),
        );
      requireHistory(
        db
          .prepare('SELECT 1 FROM fixed_commit_capture_v1 WHERE slot=1 AND manifest=?')
          .get(manifest),
      );
      const revisions = sql.read(
        'revisions',
        ['id', 'repository_id', 'kind', 'commit_identity', 'content_fingerprint'],
        '1=1',
        [],
      );
      requireHistory(
        revisions.length === 1 &&
          revisions[0]?.id === revision.id &&
          revisions[0].repository_id === revision.repositoryId &&
          revisions[0].kind === 'COMMIT' &&
          revisions[0].commit_identity === revision.commitIdentity &&
          revisions[0].content_fingerprint === revision.contentFingerprint,
      );
      const stored = sql.read('source_files', Object.keys(expectedRows[0]!), '1=1', []);
      const byId = new Map(expectedRows.map((r) => [String(r.id), r]));
      requireHistory(
        stored.length === files.length &&
          stored.every((row) => isDeepStrictEqual({ ...row }, byId.get(String(row.id)))),
      );
    }
    check();
    db.exec('COMMIT');
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
  fresh.delete(db);
  const incarnation = db.prepare('SELECT 1');
  const filesById = new Map(files.map((f) => [String(f.id), f]));
  selected.set(
    db,
    Object.freeze({
      repositoryId: revision.repositoryId,
      rootPath: input.rootPath,
      revision: Object.freeze(revision),
      rootTreeOid: input.rootTreeOid,
      manifestDigest,
      recheck: () => {
        incarnation.setReadBigInts(false);
        check();
      },
      count: files.length,
      matches: (file: SourceFile) => isDeepStrictEqual(filesById.get(file.id), file),
    }),
  );
  return Object.freeze({ manifestDigest });
}

// Never infer a commit selection from an arbitrary database row.
export function fixedCommitSelection(db: DatabaseSync, repositoryId: string) {
  const selection = selected.get(db);
  if (!marker(db)) {
    requireHistory(!selection);
    return undefined;
  }
  requireHistory(selection && selection.repositoryId === repositoryId);
  selection.recheck();
  return selection;
}
