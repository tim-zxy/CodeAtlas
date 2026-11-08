import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sample, sampleSet, approve, limits } from './helpers/offline-publication-fixture.mjs';
import {
  prepareOfflinePublication,
  OfflinePublicationPreparer,
} from '../../application/dist/offline-publication.js';
import { evaluateCandidateRecord } from '../../application/dist/evaluation-record.js';
import {
  initializeOfflinePublicationStore,
  OfflinePublicationStore,
} from '../dist/knowledge/offline-publication-store.js';
async function setup(t, make = sample) {
  const f = make(),
    root = await realpath(tmpdir()),
    dir = await mkdtemp(path.join(root, 'codeatlas-publication-')),
    file = path.join(dir, 'owned.sqlite'),
    db = new DatabaseSync(file),
    connections = [db];
  t.after(async () => {
    for (const c of connections) if (c.isOpen) c.close();
    assert.equal(path.dirname(dir), root);
    await rm(dir, { recursive: true, force: true });
  });
  let store;
  const preparer = new OfflinePublicationPreparer({
    lookup: (subject, key, digest, c) => store.lookup(subject, key, digest, limits, c),
    readState: (c) => store.readState(limits, c),
  });
  store = initializeOfflinePublicationStore(db, 'w', limits, f.c, preparer.identity);
  const ready = await preparer.prepare(f.input, approve, f.c);
  return {
    ...f,
    db,
    file,
    connections,
    store,
    preparer,
    command: ready.command,
    handle: ready.handle,
  };
}
const counts = (db) =>
  Object.fromEntries(
    ['offline_attempts', 'offline_revisions', 'offline_receipts', 'offline_heads'].map((table) => [
      table,
      db.prepare('SELECT count(*) n FROM ' + table).get().n,
    ]),
  );
test('complete set registers opaque IDs, atomically publishes and reuses original receipt after restart', async (t) => {
  const f = await setup(t),
    a = f.store.begin(f.handle, limits, f.c);
  assert.equal(a.status, 'PREPARED');
  assert.deepEqual(counts(f.db), {
    offline_attempts: 1,
    offline_revisions: 0,
    offline_receipts: 0,
    offline_heads: 0,
  });
  const done = f.store.publish(a.handle, limits, f.c);
  assert.equal(done.status, 'COMMITTED');
  assert.equal(done.receipt.quality, 'NOT_EVALUABLE');
  assert.equal(done.receipt.productionPublication, 'NOT_AUTHORIZED');
  assert.deepEqual(counts(f.db), {
    offline_attempts: 1,
    offline_revisions: 1,
    offline_receipts: 1,
    offline_heads: 1,
  });
  const state = f.store.readState(limits, f.c);
  assert.equal(
    state.records[0].itemEnvelope.payload.id,
    f.command.entries[0].record.itemEnvelope.payload.id,
  );
  const other = await prepareOfflinePublication(f.input, f.state, approve, f.c);
  assert.notEqual(other.commandDigest, f.command.commandDigest);
  assert.equal(other.requestDigest, f.command.requestDigest);
  assert.throws(() => f.store.begin(other, limits, f.c));
  const retry = await f.preparer.prepare(f.input, approve, f.c);
  assert.deepEqual(retry, {
    status: 'EXISTING',
    inspection: { status: 'COMMITTED', receipt: done.receipt },
  });
  assert.deepEqual(f.store.begin(f.handle, limits, f.c), {
    status: 'COMMITTED',
    receipt: done.receipt,
    reused: true,
  });
  f.db.close();
  const db = new DatabaseSync(f.file);
  f.connections.push(db);
  const reopened = new OfflinePublicationStore(db, 'w');
  assert.deepEqual(
    reopened.inspect(f.input.subject, f.input.requestKey, f.command.requestDigest, limits, f.c),
    { status: 'COMMITTED', receipt: done.receipt },
  );
  assert.throws(() => reopened.begin(f.handle, limits, f.c));
  assert.deepEqual(counts(db), {
    offline_attempts: 1,
    offline_revisions: 1,
    offline_receipts: 1,
    offline_heads: 1,
  });
});
test('same logical key with different input refuses, prepared owner is not resurrected', async (t) => {
  const f = await setup(t),
    a = f.store.begin(f.handle, limits, f.c),
    db = new DatabaseSync(f.file);
  f.connections.push(db);
  const reopened = new OfflinePublicationStore(db, 'w');
  assert.throws(() => reopened.begin(f.handle, limits, f.c));
  assert.equal(
    reopened.inspect(f.input.subject, f.input.requestKey, f.command.requestDigest, limits, f.c)
      .status,
    'COMMIT_OUTCOME_UNKNOWN',
  );
  const changed = structuredClone(f.input);
  changed.candidates[0].payload.structuredContent.summary += ' changed';
  changed.subjects[0].candidateEnvelope = changed.candidates[0];
  changed.evaluation = evaluateCandidateRecord(
    {
      evaluationId: 'eval',
      runId: 'run',
      snapshot: changed.snapshot,
      candidates: changed.candidates,
    },
    f.c,
  );
  await assert.rejects(() => f.preparer.prepare(changed, approve, f.c));
  assert.equal(f.store.publish(a.handle, limits, f.c).status, 'COMMITTED');
});
test('workspace head race refuses whole second set', async (t) => {
  const f = await setup(t),
    second = structuredClone(f.input);
  second.requestKey = 'second';
  const ready = await f.preparer.prepare(second, approve, f.c),
    command = ready.command,
    a = f.store.begin(f.handle, limits, f.c),
    b = f.store.begin(ready.handle, limits, f.c);
  f.store.publish(a.handle, limits, f.c);
  assert.throws(() => f.store.publish(b.handle, limits, f.c));
  assert.equal(
    f.store.inspect(second.subject, second.requestKey, command.requestDigest, limits, f.c).status,
    'NOT_COMMITTED',
  );
  assert.equal(counts(f.db).offline_revisions, 1);
  assert.equal(counts(f.db).offline_heads, 1);
  assert.throws(() => f.store.publish(b.handle, limits, f.c));
});
test('real mid-transaction failure rolls back all history, receipt and pointers', async (t) => {
  const f = await setup(t),
    a = f.store.begin(f.handle, limits, f.c),
    prepare = f.db.prepare.bind(f.db);
  f.db.prepare = (sql) => {
    if (sql.startsWith('INSERT INTO "offline_heads"')) throw Error('fault before heads');
    return prepare(sql);
  };
  assert.throws(() => f.store.publish(a.handle, limits, f.c));
  f.db.prepare = prepare;
  assert.deepEqual(counts(f.db), {
    offline_attempts: 1,
    offline_revisions: 0,
    offline_receipts: 0,
    offline_heads: 0,
  });
  assert.equal(
    f.store.inspect(f.input.subject, f.input.requestKey, f.command.requestDigest, limits, f.c)
      .status,
    'NOT_COMMITTED',
  );
});
test('actual COMMIT acknowledgement loss only permits inspection and preserves all committed rows', async (t) => {
  const f = await setup(t),
    a = f.store.begin(f.handle, limits, f.c),
    exec = f.db.exec.bind(f.db);
  f.db.exec = (sql) => {
    exec(sql);
    if (sql === 'COMMIT') throw Error('lost acknowledgement');
  };
  assert.throws(() => f.store.publish(a.handle, limits, f.c), {
    code: 'COMMIT_OUTCOME_UNKNOWN',
    cleanupState: 'SETTLED',
  });
  f.db.exec = exec;
  assert.equal(
    f.store.inspect(f.input.subject, f.input.requestKey, f.command.requestDigest, limits, f.c)
      .status,
    'COMMITTED',
  );
  assert.throws(() => f.store.publish(a.handle, limits, f.c));
  const db = new DatabaseSync(f.file);
  f.connections.push(db);
  assert.equal(
    new OfflinePublicationStore(db, 'w').inspect(
      f.input.subject,
      f.input.requestKey,
      f.command.requestDigest,
      limits,
      f.c,
    ).status,
    'COMMITTED',
  );
  assert.deepEqual(counts(db), {
    offline_attempts: 1,
    offline_revisions: 1,
    offline_receipts: 1,
    offline_heads: 1,
  });
});
test('UPDATE uses actual current state, keeps item and immutable prior revision', async (t) => {
  const f = await setup(t),
    a = f.store.begin(f.handle, limits, f.c);
  f.store.publish(a.handle, limits, f.c);
  const next = structuredClone(f.input);
  next.requestKey = 'update';
  next.candidates[0].payload.structuredContent.limitations.push('test semantic update');
  next.subjects[0].candidateEnvelope = next.candidates[0];
  next.evaluation = evaluateCandidateRecord(
    {
      evaluationId: 'eval:update',
      runId: 'run',
      snapshot: next.snapshot,
      candidates: next.candidates,
    },
    f.c,
  );
  const ready = await f.preparer.prepare(next, approve, f.c),
    command = ready.command,
    b = f.store.begin(ready.handle, limits, f.c);
  assert.equal(command.entries[0].operation, 'UPDATE');
  f.store.publish(b.handle, limits, f.c);
  const state = f.store.readState(limits, f.c);
  assert.equal(
    state.records[0].itemEnvelope.payload.id,
    f.command.entries[0].record.itemEnvelope.payload.id,
  );
  assert.equal(
    state.records[0].revisionEnvelope.payload.previousRevisionId,
    f.command.entries[0].record.revisionEnvelope.payload.id,
  );
  assert.equal(counts(f.db).offline_revisions, 2);
  assert.equal(counts(f.db).offline_heads, 1);
  assert.throws(() => f.db.exec('DELETE FROM offline_revisions'));
});

test('two distinct candidates publish as one complete set and partial revision insert rolls back', async (t) => {
  for (const fault of [false, true]) {
    const f = await setup(t, sampleSet),
      a = f.store.begin(f.handle, limits, f.c);
    assert.equal(f.command.entries.length, 2);
    const prepare = f.db.prepare.bind(f.db);
    let writes = 0;
    f.db.prepare = (sql) => {
      if (fault && sql.startsWith('INSERT INTO "offline_revisions"') && ++writes === 2)
        throw Error('second revision fault');
      return prepare(sql);
    };
    if (fault) assert.throws(() => f.store.publish(a.handle, limits, f.c));
    else f.store.publish(a.handle, limits, f.c);
    f.db.prepare = prepare;
    assert.equal(counts(f.db).offline_revisions, fault ? 0 : 2);
    assert.equal(counts(f.db).offline_heads, fault ? 0 : 2);
    assert.equal(counts(f.db).offline_receipts, fault ? 0 : 1);
  }
});
test('registration acknowledgement loss does not revive execution after reconnect', async (t) => {
  const f = await setup(t),
    exec = f.db.exec.bind(f.db);
  f.db.exec = (sql) => {
    exec(sql);
    if (sql === 'COMMIT') throw Error('lost registration ACK');
  };
  assert.throws(() => f.store.begin(f.handle, limits, f.c), { code: 'COMMIT_OUTCOME_UNKNOWN' });
  f.db.exec = exec;
  assert.equal(
    f.store.inspect(f.input.subject, f.input.requestKey, f.command.requestDigest, limits, f.c)
      .status,
    'COMMIT_OUTCOME_UNKNOWN',
  );
  const db = new DatabaseSync(f.file);
  f.connections.push(db);
  const reopened = new OfflinePublicationStore(db, 'w', f.preparer.identity);
  assert.throws(() => reopened.begin(f.handle, limits, f.c), { code: 'OFFLINE_ATTEMPT_UNSETTLED' });
  assert.equal(counts(db).offline_attempts, 1);
  assert.equal(counts(db).offline_revisions, 0);
});
test('foreign issuer, bare rewritten command, transaction ownership and SQL budget refuse', async (t) => {
  const f = await setup(t),
    other = new OfflinePublicationPreparer({
      lookup: () => ({ status: 'ABSENT' }),
      readState: () => f.state,
    }),
    foreign = await other.prepare(f.input, approve, f.c);
  assert.throws(() => f.store.begin(f.command, limits, f.c));
  assert.throws(() => f.store.begin(foreign.handle, limits, f.c));
  f.db.exec('BEGIN');
  assert.throws(() => f.store.begin(f.handle, limits, f.c));
  assert.equal(f.db.isTransaction, true);
  f.db.exec('ROLLBACK');
  assert.throws(() => f.store.begin(f.handle, { ...limits, maxRows: 1 }, f.c));
  assert.equal(f.db.isTransaction, false);
  assert.equal(counts(f.db).offline_attempts, 0);
});

test('acknowledged publication remains committed when post-commit connection settlement is unknown', async (t) => {
  const f = await setup(t),
    a = f.store.begin(f.handle, limits, f.c),
    exec = f.db.exec.bind(f.db);
  f.db.exec = (sql) => {
    exec(sql);
    if (sql === 'COMMIT') f.db.close();
  };
  const done = f.store.publish(a.handle, limits, f.c);
  assert.equal(done.status, 'COMMITTED');
  assert.equal(done.cleanupState, 'UNKNOWN');
  const db = new DatabaseSync(f.file);
  f.connections.push(db);
  assert.equal(
    new OfflinePublicationStore(db, 'w').inspect(
      f.input.subject,
      f.input.requestKey,
      f.command.requestDigest,
      limits,
      f.c,
    ).status,
    'COMMITTED',
  );
  assert.throws(() => f.store.publish(a.handle, limits, f.c));
});
