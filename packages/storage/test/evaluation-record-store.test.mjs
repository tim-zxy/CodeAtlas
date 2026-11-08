import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadMigrationPlan } from '../dist/migrations/manifest.js';
import { applyMigrationPlan } from '../dist/migrations/runner.js';
import { openCompilationInputStore } from '../dist/knowledge/compilation-input-store.js';
import {
  initializeOfflineEvaluationRecords,
  OfflineEvaluationRecordStore,
} from '../dist/knowledge/evaluation-record-store.js';
import { evaluateCandidateRecord } from '../../application/dist/evaluation-record.js';
import { createCompilationInputSnapshot } from '../../application/dist/compilation-input-contract.js';
import { buildCapturedIntegrationCandidate } from '../../application/dist/integration-candidate.js';
import {
  fixture,
  control,
  options,
  account,
} from '../../application/test/helpers/captured-integration-fixture.mjs';
const limits = {
    maxRows: 10000,
    maxSerializedBytes: 2000000,
    maxItems: 200000,
    maxDepth: 100,
    memoryBudgetBytes: 20000000,
  },
  check = () => {};
async function setup(t) {
  const root = await realpath(tmpdir()),
    dir = await mkdtemp(path.join(root, 'codeatlas-evaluation-')),
    file = path.join(dir, 'records.sqlite'),
    db = new DatabaseSync(':memory:'),
    records = new DatabaseSync(file),
    connections = [db, records];
  t.after(async () => {
    for (const c of connections) if (c.isOpen) c.close();
    assert.equal(path.dirname(dir), root);
    await rm(dir, { recursive: true, force: true });
  });
  const c = control(),
    f = fixture(),
    snapshot = createCompilationInputSnapshot(f.raw, c),
    candidate = buildCapturedIntegrationCandidate(snapshot, options(), c, account()).candidate;
  const plan = await loadMigrationPlan(
    new URL('../migrations/workspace/manifest.json', import.meta.url),
    'WORKSPACE',
  );
  assert.equal(plan.latestVersion, 8);
  applyMigrationPlan(db, plan);
  db.exec(
    "INSERT INTO workspace VALUES(1,'w','/owned');INSERT INTO repositories VALUES('r','w','/owned/r');INSERT INTO revision_sets VALUES('rs','w',0,0)",
  );
  db.prepare('INSERT INTO revision_set_items VALUES(?,?,?,?)').run(
    'rs',
    'r',
    'v',
    f.raw.repositories[0].repoBasis.contentFingerprint,
  );
  db.exec("UPDATE revision_sets SET frozen=1 WHERE id='rs'");
  for (const [v, name] of [
    [9, '009_knowledge.sql'],
    [10, '010_lifecycle.sql'],
  ]) {
    db.exec(
      await readFile(new URL('../migrations/workspace-proposed/' + name, import.meta.url), 'utf8'),
    );
    db.exec('PRAGMA user_version=' + v);
  }
  const captureRequest = {
    schemaVersion: 1,
    workspaceId: 'w',
    scope: f.raw.scope,
    revisionSetId: 'rs',
    ...f.raw.selection,
    policyVersions: f.raw.policyVersions,
  };
  const key = {
    runId: 'run',
    subject: { issuerNamespace: 'owned', subjectId: 'test' },
    requestKey: 'request',
    request: {
      schemaVersion: 1,
      captureRequest,
      updateMode: 'FULL',
      expectedHeads: { heads: [] },
      workflowRef: 'owned',
      modelPolicyRef: null,
    },
  };
  const source = await openCompilationInputStore(db, 'w', limits);
  source.createRun({ ...key, createdAtMs: 0 }, limits, c, check);
  source.putSnapshot(key, snapshot, limits, c, check);
  const record = evaluateCandidateRecord(
      { evaluationId: 'eval', runId: 'run', snapshot, candidates: [candidate] },
      c,
    ),
    store = initializeOfflineEvaluationRecords(records, 'w', limits, c);
  return { db, records, file, source, key, snapshot, candidate, record, store, c, connections };
}
test('actual snapshot association persists immutable structural record and reopens without publication', async (t) => {
  const f = await setup(t);
  assert.equal(
    f.store.put(f.source, f.key, [f.candidate], f.record, limits, f.c, check).status,
    'COMMITTED',
  );
  f.records.close();
  const db = new DatabaseSync(f.file);
  f.connections.push(db);
  const reopened = new OfflineEvaluationRecordStore(db, 'w');
  assert.deepEqual(
    reopened.read(f.source, f.key, [f.candidate], 'eval', limits, f.c, check),
    f.record,
  );
  assert.equal(f.db.prepare('SELECT count(*) n FROM knowledge_items').get().n, 0);
  for (const sql of [
    "UPDATE evaluation_records SET run_id='other'",
    'DELETE FROM evaluation_records',
    'INSERT OR REPLACE INTO evaluation_records SELECT * FROM evaluation_records',
  ])
    assert.throws(() => db.exec(sql));
});
test('candidate replacement, forged PASS, foreign scope and run never persist', async (t) => {
  const f = await setup(t),
    changed = structuredClone(f.candidate);
  changed.payload.structuredContent.summary += ' changed';
  for (const args of [
    [f.source, f.key, [changed], f.record],
    [f.source, f.key, [f.candidate], { ...f.record, quality: 'PASS' }],
    [f.source, { ...f.key, runId: 'foreign' }, [f.candidate], f.record],
  ])
    assert.throws(() => f.store.put(...args, limits, f.c, check));
  const foreign = new OfflineEvaluationRecordStore(f.records, 'foreign');
  assert.throws(() => foreign.put(f.source, f.key, [f.candidate], f.record, limits, f.c, check));
  assert.equal(f.records.prepare('SELECT count(*) n FROM evaluation_records').get().n, 0);
});
test('cancelled or exhausted records leave no row; user transaction is not adopted', async (t) => {
  const f = await setup(t),
    abort = new AbortController();
  abort.abort();
  assert.throws(() =>
    f.store.put(
      f.source,
      f.key,
      [f.candidate],
      f.record,
      limits,
      { ...f.c, signal: abort.signal },
      check,
    ),
  );
  assert.throws(() =>
    f.store.put(f.source, f.key, [f.candidate], f.record, { ...limits, maxRows: 1 }, f.c, check),
  );
  f.records.exec('BEGIN');
  assert.throws(() => f.store.put(f.source, f.key, [f.candidate], f.record, limits, f.c, check));
  assert.equal(f.records.isTransaction, true);
  f.records.exec('ROLLBACK');
  assert.equal(f.records.prepare('SELECT count(*) n FROM evaluation_records').get().n, 0);
});

test('callback cannot substitute run binding; lost commit acknowledgement stays unknown', async (t) => {
  const f = await setup(t),
    key = structuredClone(f.key);
  let changed = false;
  assert.throws(() =>
    f.store.put(f.source, key, [f.candidate], { ...f.record, runId: 'other' }, limits, f.c, () => {
      if (!changed) {
        changed = true;
        key.runId = 'other';
      }
    }),
  );
  assert.equal(changed, true);
  assert.equal(f.records.prepare('SELECT count(*) n FROM evaluation_records').get().n, 0);
  const exec = f.records.exec.bind(f.records);
  f.records.exec = (sql) => {
    exec(sql);
    if (sql === 'COMMIT') throw Error('lost acknowledgement');
  };
  assert.throws(() => f.store.put(f.source, f.key, [f.candidate], f.record, limits, f.c, check), {
    code: 'COMMIT_OUTCOME_UNKNOWN',
    cleanupState: 'SETTLED',
  });
  f.records.exec = exec;
  assert.deepEqual(
    f.store.read(f.source, f.key, [f.candidate], 'eval', limits, f.c, check),
    f.record,
  );
  assert.throws(() => f.store.put(f.source, f.key, [f.candidate], f.record, limits, f.c, check));
});

test('schema change during snapshot check is rejected under write lock', async (t) => {
  const f = await setup(t);
  let changed = false;
  assert.throws(() =>
    f.store.put(f.source, f.key, [f.candidate], f.record, limits, f.c, () => {
      if (!changed) {
        changed = true;
        f.records.exec('DROP TRIGGER evaluation_records_update');
      }
    }),
  );
  assert.equal(f.records.prepare('SELECT count(*) n FROM evaluation_records').get().n, 0);
  assert.equal(f.records.isTransaction, false);
});
test('read schema, preflight and delivery keep one WAL snapshot', async (t) => {
  const f = await setup(t);
  f.records.exec('PRAGMA journal_mode=WAL');
  f.store.put(f.source, f.key, [f.candidate], f.record, limits, f.c, check);
  const writer = new DatabaseSync(f.file);
  f.connections.push(writer);
  const prepare = f.records.prepare.bind(f.records);
  let changed = false;
  f.records.prepare = (sql) => {
    if (sql.includes('FROM "evaluation_records"') && sql.startsWith('SELECT count') && !changed) {
      changed = true;
      writer.exec(
        "DROP TRIGGER evaluation_records_update;UPDATE evaluation_records SET payload_json='{}'",
      );
    }
    return prepare(sql);
  };
  assert.deepEqual(
    f.store.read(f.source, f.key, [f.candidate], 'eval', limits, f.c, check),
    f.record,
  );
  assert.equal(changed, true);
  assert.throws(() => f.store.read(f.source, f.key, [f.candidate], 'eval', limits, f.c, check));
});
