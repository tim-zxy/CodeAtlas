import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { openR010FixtureDatabase, historyLimits } from './helpers/r011-history-fixture.mjs';
import { beginMixedSourceAccount } from '../dist/analysis/mixed-source-account.js';
import * as sourceState from '../dist/source-state/repository.js';
const input = JSON.parse(
  readFileSync('fixtures/phase1/mixed-runtime-readiness/bounded-source-state/cases.json'),
);
const expected = JSON.parse(
  readFileSync('fixtures/phase1/mixed-runtime-readiness/bounded-source-state/expected.json'),
);
async function fixture(t, state = input.state) {
  const db = await openR010FixtureDatabase(
    ':memory:',
    input.repository.id,
    input.repository.rootPath,
  );
  t.after(() => db.close());
  if (state) db.sourceState.replace(null, state);
  return db;
}
function owned(
  db,
  limits = historyLimits,
  repository = input.repository,
  control = { ...input.control, signal: new AbortController().signal },
) {
  const p = beginMixedSourceAccount(limits, control);
  const store = sourceState.createBudgetedSourceStateStore(
    db.database,
    repository,
    p.budget,
    p.account,
  );
  return { ...p, store };
}
const usage = (b) =>
  Object.fromEntries(
    ['rows', 'serializedBytes', 'items', 'retainedLogicalBytes'].map((k) => [k, b[k]]),
  );
test('A4 bounded Store is private and exact Unicode/null load matches independent reference', async (t) => {
  const db = await fixture(t),
    p = owned(db);
  assert.deepEqual(p.store.load(input.repository.id), input.state);
  assert.deepEqual(usage(p.budget), expected.load);
  assert.equal((await import('../dist/index.js')).createBudgetedSourceStateStore, undefined);
});
test('A4 empty registered database uses bounded read and returns null', async (t) => {
  const db = await fixture(t, null),
    p = owned(db);
  assert.equal(p.store.load(input.repository.id), null);
  assert.deepEqual(usage(p.budget), expected.empty);
});
for (const [dimension, key, factor] of [
  ['rows', 'maxRows', 1],
  ['serializedBytes', 'maxSerializedBytes', 1],
  ['items', 'maxItems', 1],
  ['retainedLogicalBytes', 'memoryBudgetBytes', 2],
])
  test('A4 load exact and one-below ' + dimension, async (t) => {
    const db = await fixture(t);
    const p = owned(db, { ...historyLimits, [key]: factor * expected.load[dimension] });
    assert.deepEqual(p.store.load(input.repository.id), input.state);
    const q = owned(db, { ...historyLimits, [key]: factor * expected.load[dimension] - 1 });
    assert.throws(
      () => q.store.load(input.repository.id),
      (e) => ['HISTORY_LIMIT_EXCEEDED', 'STAGE_LIMIT_EXCEEDED'].includes(e.code),
    );
    const prefix = usage(q.budget);
    assert.throws(() => q.account.checkpoint(), { code: 'STAGE_RELEASED' });
    assert.deepEqual(usage(q.budget), prefix);
  });
test('A4 huge TEXT is refused before any corresponding TEXT delivery', async (t) => {
  const db = await fixture(t);
  db.database
    .prepare('UPDATE source_files SET path=? WHERE id=?')
    .run('文'.repeat(1000), 'file:other');
  const prepare = db.database.prepare.bind(db.database),
    seen = [];
  db.database.prepare = (sql) => {
    seen.push(sql);
    return prepare(sql);
  };
  const p = owned(db, { ...historyLimits, maxSerializedBytes: expected.load.serializedBytes });
  assert.throws(() => p.store.load(input.repository.id), { code: 'HISTORY_LIMIT_EXCEEDED' });
  assert.ok(seen.some((sql) => sql.includes('sum(') && sql.includes('source_files')));
  assert.ok(!seen.some((sql) => sql.startsWith('SELECT revision_id,id,repository_id,path,')));
});
test('A4 factory rejects a foreign account without accepting structural impersonation', async (t) => {
  const db = await fixture(t),
    a = beginMixedSourceAccount(historyLimits, {
      ...input.control,
      signal: new AbortController().signal,
    }),
    b = beginMixedSourceAccount(historyLimits, {
      ...input.control,
      signal: new AbortController().signal,
    });
  assert.throws(() =>
    sourceState.createBudgetedSourceStateStore(db.database, input.repository, a.budget, b.account),
  );
  assert.throws(() =>
    sourceState.createBudgetedSourceStateStore(db.database, input.repository, a.budget, {
      ...a.account,
    }),
  );
});
for (const kind of ['id', 'root'])
  test('A4 bound Store rejects foreign ' + kind, async (t) => {
    const db = await fixture(t),
      p = owned(
        db,
        historyLimits,
        kind === 'root' ? { ...input.repository, rootPath: '/foreign' } : input.repository,
      );
    assert.throws(() => p.store.load(kind === 'id' ? 'repository:foreign' : input.repository.id));
    assert.equal(db.database.isTransaction, false);
    assert.deepEqual(db.sourceState.load(input.repository.id), input.state);
  });
test('A4 rejects ambient transaction without rolling it back', async (t) => {
  const db = await fixture(t),
    p = owned(db);
  db.database.exec('BEGIN');
  assert.throws(() => p.store.load(input.repository.id));
  assert.equal(db.database.isTransaction, true);
  db.database.exec('ROLLBACK');
});
for (const kind of ['cancel', 'deadline'])
  test('A4 ' + kind + ' after binding precedes SQLite delivery', async (t) => {
    const db = await fixture(t),
      controller = new AbortController(),
      p = owned(db, historyLimits, input.repository, {
        ...input.control,
        signal: controller.signal,
      });
    const prepare = db.database.prepare.bind(db.database);
    let count = 0;
    db.database.prepare = (sql) => {
      count++;
      return prepare(sql);
    };
    const now = Date.now;
    try {
      if (kind === 'cancel') controller.abort();
      else Date.now = () => Number.MAX_SAFE_INTEGER;
      assert.throws(() => p.store.load(input.repository.id), {
        code: kind === 'cancel' ? 'CANCELLED' : 'DEADLINE_EXCEEDED',
      });
      assert.equal(count, 0);
    } finally {
      Date.now = now;
    }
  });
test('A4 ambiguous worktree and duplicate commit retain legacy refusal', async (t) => {
  const db = await fixture(t),
    sql = db.database;
  sql
    .prepare(
      "INSERT INTO revisions(id,repository_id,kind,content_fingerprint) VALUES(?,?,'WORKTREE',?)",
    )
    .run('extra', input.repository.id, 'sha256:extra');
  assert.throws(() => owned(db).store.load(input.repository.id), { code: 'WORKTREE_AMBIGUOUS' });
  sql.prepare("DELETE FROM revisions WHERE id='extra'").run();
  for (const id of ['c1', 'c2'])
    sql
      .prepare(
        "INSERT INTO revisions(id,repository_id,kind,content_fingerprint,commit_identity)VALUES(?,?,'COMMIT',?,?)",
      )
      .run(id, input.repository.id, 'sha256:c', 'head');
  assert.throws(() => owned(db).store.findCommitRevisionId(input.repository.id, 'head'), {
    code: 'SOURCE_STATE_INVALID',
  });
  assert.equal(owned(db).store.findCommitRevisionId(input.repository.id, 'missing'), null);
  sql.prepare("DELETE FROM revisions WHERE id='c2'").run();
  assert.equal(owned(db).store.findCommitRevisionId(input.repository.id, 'head'), 'c1');
});
test('A4 bounded CAS supports update and preserves conflict, transition and rollback', async (t) => {
  const db = await fixture(t),
    next = structuredClone(input.state);
  next.revision.contentFingerprint = 'sha256:next';
  next.files = next.files.slice(1);
  owned(db).store.replace(input.state, next);
  assert.deepEqual(db.sourceState.load(input.repository.id), next);
  assert.throws(() => owned(db).store.replace(input.state, next), {
    code: 'SOURCE_STATE_CONFLICT',
  });
  const wrong = structuredClone(next);
  wrong.revision.id = 'foreign';
  wrong.files = wrong.files.map((f) => ({ ...f, revisionId: 'foreign' }));
  assert.throws(() => owned(db).store.replace(next, wrong), { code: 'SOURCE_STATE_INVALID' });
  db.database.exec(
    "CREATE TRIGGER a4fail BEFORE INSERT ON source_files BEGIN SELECT RAISE(ABORT,'fixture');END",
  );
  assert.throws(() => owned(db).store.replace(next, input.state), {
    code: 'SOURCE_STATE_WRITE_FAILED',
  });
  assert.deepEqual(db.sourceState.load(input.repository.id), next);
  assert.equal(db.database.isTransaction, false);
});

test('A4 legacy parser still sanitizes row getter failures', () => {
  const row = {
    get id() {
      throw Error('private SQL payload');
    },
  };
  assert.throws(() => sourceState.parseStoredSourceFile(row), { code: 'SOURCE_STATE_INVALID' });
});
test('A4 failed read rollback preserves original resource error', async (t) => {
  const db = await fixture(t),
    p = owned(db, { ...historyLimits, maxRows: 1 }),
    exec = db.database.exec.bind(db.database);
  db.database.exec = (sql) => {
    if (sql === 'ROLLBACK') throw Error('injected rollback failure');
    return exec(sql);
  };
  try {
    assert.throws(() => p.store.load(input.repository.id), { code: 'HISTORY_LIMIT_EXCEEDED' });
  } finally {
    db.database.exec = exec;
    if (db.database.isTransaction) exec('ROLLBACK');
  }
});

test('A4 non-UTF8 database cannot use BLOB sizes as UTF8 SQL fees', async (t) => {
  const { DatabaseSync } = await import('node:sqlite');
  const { applyMigrationPlan } = await import('../dist/migrations/runner.js');
  const { prefixPlan } = await import('./helpers/r011-history-fixture.mjs');
  const database = new DatabaseSync(':memory:');
  t.after(() => database.close());
  database.exec("PRAGMA encoding='UTF-16le'");
  applyMigrationPlan(database, await prefixPlan(10));
  database
    .prepare('INSERT INTO repository(slot,id,root_path)VALUES(1,?,?)')
    .run(input.repository.id, input.repository.rootPath);
  database.prepare('INSERT INTO repository_state(repository_id)VALUES(?)').run(input.repository.id);
  const p = owned({ database });
  const sample = database.prepare("SELECT length(CAST('文' AS BLOB)) AS bytes").get().bytes;
  assert.notEqual(sample, Buffer.byteLength('文'));
  assert.throws(() => p.store.load(input.repository.id), { code: 'SOURCE_STATE_INVALID' });
  assert.throws(() => p.account.checkpoint(), { code: 'STAGE_RELEASED' });
});
