import test from 'node:test';
import assert from 'node:assert/strict';
import { historyFixture, historyLimits } from './helpers/r011-history-fixture.mjs';
import { HistoryReadBudget } from '../dist/analysis/activation-history-format.js';
import * as api from '../dist/runtime/runtime-fact-store.js';
const check = () => {};
async function setup(t) {
  const f = await historyFixture(t, 'available', { version: 13 });
  return {
    ...f,
    store: new api.RuntimeFactStore(f.db, f.input.repositoryId),
    request: {
      kind: 'FULL_CURRENT_REVISION',
      basis: {
        repositoryId: f.input.repositoryId,
        revisionId: 'capture-worktree',
        contentFingerprint: 'capture-fingerprint',
      },
    },
  };
}
const read = (f, limits = historyLimits, control = check) =>
  api.readRepositorySourceFileMetadata(f.store, f.request, new HistoryReadBudget(limits), control);
test('pinned full revision metadata uses actual SourceFile rows without Code/Syntax/history bodies', async (t) => {
  const f = await setup(t),
    queries = [],
    prepare = f.db.prepare.bind(f.db);
  f.db.prepare = (sql) => {
    queries.push(sql);
    return prepare(sql);
  };
  f.db.exec('PRAGMA query_only=ON');
  const got = read(f);
  const row = f.input.tables.source_files[0];
  assert.deepEqual(got.sourceFiles, [
    {
      id: row.id,
      repositoryId: row.repository_id,
      revisionId: row.revision_id,
      path: row.path,
      contentFingerprint: row.content_fingerprint,
      classification: { role: row.role, provenance: row.provenance, contentKind: row.content_kind },
      languageHint: row.language_hint,
      sensitivity: row.sensitivity,
    },
  ]);
  assert.deepEqual(got.basis, f.request.basis);
  assert.equal(got.authorization, 'NOT_ESTABLISHED');
  assert.equal(got.supportClosure, 'NOT_ESTABLISHED');
  assert.equal(got.sourceFreshness, 'NOT_OBSERVED');
  assert.ok(Object.isFrozen(got.sourceFiles[0].classification));
  assert.ok(queries.some((q) => q.includes('FROM "source_files"')));
  assert.ok(
    queries.every(
      (q) =>
        !/(?:canonical_nodes|canonical_edges|activation_history|syntax_history|payload_json|envelope_json|evidence)/i.test(
          q,
        ),
    ),
  );
  assert.equal(f.db.isTransaction, false);
});
test('metadata preserves binary classification rather than granting raw access', async (t) => {
  const f = await setup(t);
  f.db.exec("UPDATE source_files SET content_kind='BINARY'");
  assert.equal(read(f).sourceFiles[0].classification.contentKind, 'BINARY');
});
test('wrong revision/fingerprint/repository and partial requests refuse before files', async (t) => {
  const f = await setup(t);
  for (const changes of [
    { revisionId: 'old' },
    { contentFingerprint: 'different' },
    { repositoryId: 'foreign' },
  ])
    assert.throws(() =>
      api.readRepositorySourceFileMetadata(
        f.store,
        { ...f.request, basis: { ...f.request.basis, ...changes } },
        new HistoryReadBudget(historyLimits),
        check,
      ),
    );
  assert.throws(() =>
    api.readRepositorySourceFileMetadata(
      f.store,
      { ...f.request, kind: 'PARTIAL' },
      new HistoryReadBudget(historyLimits),
      check,
    ),
  );
  assert.equal(f.db.isTransaction, false);
});
test('schema, FK and current indexed pointer mismatches refuse', async (t) => {
  const f = await setup(t);
  f.db.exec('PRAGMA foreign_keys=OFF');
  assert.throws(() => read(f));
  f.db.exec('PRAGMA foreign_keys=ON;PRAGMA user_version=14');
  assert.throws(() => read(f));
  f.db.exec(
    "PRAGMA user_version=13; UPDATE repository_state SET indexed_content_fingerprint='moved'",
  );
  assert.throws(() => read(f));
  assert.equal(f.db.isTransaction, false);
});
test('original SQL budgets and control failures abort the read snapshot', async (t) => {
  const f = await setup(t);
  assert.throws(() => read(f, { ...historyLimits, maxRows: 1 }), {
    code: 'HISTORY_LIMIT_EXCEEDED',
  });
  assert.throws(() => read(f, { ...historyLimits, maxSerializedBytes: 1 }), {
    code: 'HISTORY_LIMIT_EXCEEDED',
  });
  let n = 0;
  assert.throws(() =>
    read(f, historyLimits, () => {
      if (++n === 4) throw Error('revoked');
    }),
  );
  assert.equal(f.db.isTransaction, false);
});
test('caller transaction and foreign owner are not adopted', async (t) => {
  const f = await setup(t);
  f.db.exec('BEGIN');
  assert.throws(() => read(f));
  assert.equal(f.db.isTransaction, true);
  f.db.exec('ROLLBACK');
  assert.throws(() =>
    api.readRepositorySourceFileMetadata(
      {},
      f.request,
      new HistoryReadBudget(historyLimits),
      check,
    ),
  );
});

test('transaction loss/replacement cannot be adopted or rolled back', async (t) => {
  for (const replacement of [false, true]) {
    const f = await setup(t);
    let done = false;
    assert.throws(
      () =>
        read(f, historyLimits, () => {
          if (f.db.isTransaction && !done) {
            done = true;
            f.db.exec('COMMIT');
            if (replacement) f.db.exec('BEGIN');
          }
        }),
      { cleanupState: 'UNKNOWN' },
    );
    assert.equal(done, true);
    assert.equal(f.db.isTransaction, replacement);
    if (replacement) f.db.exec('ROLLBACK');
  }
});
test('overridden budget methods do not bypass original SQL limits', async (t) => {
  const f = await setup(t),
    b = new HistoryReadBudget({ ...historyLimits, maxRows: 1 });
  b.own = () => {};
  b.add = () => {};
  b.pin = () => {};
  assert.throws(() => api.readRepositorySourceFileMetadata(f.store, f.request, b, check), {
    code: 'HISTORY_LIMIT_EXCEEDED',
  });
  assert.equal(f.db.isTransaction, false);
});
test('SourceFile row preflight refuses before its actual metadata delivery', async (t) => {
  const f = await setup(t),
    prepare = f.db.prepare.bind(f.db);
  let before = 0,
    deliveries = 0,
    b = new HistoryReadBudget(historyLimits);
  f.db.prepare = (q) => {
    if (q.includes('FROM "source_files"')) {
      if (q.startsWith('SELECT count')) before = b.rows;
      else deliveries++;
    }
    return prepare(q);
  };
  api.readRepositorySourceFileMetadata(f.store, f.request, b, check);
  assert.equal(deliveries, 1);
  const limit = before;
  deliveries = 0;
  b = new HistoryReadBudget({ ...historyLimits, maxRows: limit });
  assert.throws(() => api.readRepositorySourceFileMetadata(f.store, f.request, b, check), {
    code: 'HISTORY_LIMIT_EXCEEDED',
  });
  assert.equal(deliveries, 0);
});
test('close/reopen during control invalidates the original owner incarnation', async (t) => {
  const f = await setup(t);
  let changed = false;
  assert.throws(
    () =>
      read(f, historyLimits, () => {
        if (f.db.isTransaction && !changed) {
          changed = true;
          f.db.close();
          f.db.open();
        }
      }),
    { cleanupState: 'UNKNOWN' },
  );
  assert.equal(changed, true);
});
test('unknown columns and invalid classification are not repaired', async (t) => {
  const f = await setup(t);
  f.db.exec(
    "PRAGMA ignore_check_constraints=ON; UPDATE source_files SET sensitivity='INVALID'; PRAGMA ignore_check_constraints=OFF",
  );
  assert.throws(() => read(f));
  f.db.exec(
    "UPDATE source_files SET sensitivity='PUBLIC';ALTER TABLE source_files ADD COLUMN extra TEXT",
  );
  assert.throws(() => read(f));
  assert.equal(f.db.isTransaction, false);
});

test('request item and memory budgets survive instance method overrides before SQL', async (t) => {
  const f = await setup(t);
  for (const cap of [{ maxItems: 1 }, { memoryBudgetBytes: 1 }]) {
    const b = new HistoryReadBudget({ ...historyLimits, ...cap });
    b.add = () => {};
    b.pin = () => {};
    assert.throws(() => api.readRepositorySourceFileMetadata(f.store, f.request, b, check), {
      code: 'HISTORY_LIMIT_EXCEEDED',
    });
    assert.equal(b.rows, 0);
    assert.equal(f.db.isTransaction, false);
  }
});
