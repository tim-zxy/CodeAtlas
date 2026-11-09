import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { sampleSet, approve, limits } from './helpers/offline-publication-fixture.mjs';
import { OfflinePublicationPreparer } from '../../application/dist/offline-publication.js';
import { evaluateCandidateRecord } from '../../application/dist/evaluation-record.js';
import { initializeOfflinePublicationStore } from '../dist/knowledge/offline-publication-store.js';
import { OfflineKnowledgeSearchIndex } from '../dist/knowledge/offline-knowledge-search.js';
async function setup(t, publish = true, make = sampleSet, evidence = false) {
  const f = make(),
    db = new DatabaseSync(':memory:');
  let store,
    deny = false,
    calls = 0,
    callback = () => {};
  const preparer = new OfflinePublicationPreparer({
    lookup: (subject, key, digest, c) => store.lookup(subject, key, digest, limits, c),
    readState: (c) => store.readState(limits, c),
  });
  store = initializeOfflinePublicationStore(db, 'w', limits, f.c, preparer.identity);
  const ready = await preparer.prepare(f.input, approve, f.c),
    attempt = store.begin(ready.handle, limits, f.c);
  if (publish) store.publish(attempt.handle, limits, f.c);
  const permissions = {
      kind: 'TEST_SEARCH_PERMISSIONS_NOT_AUTHORITY',
      check(manifest) {
        calls++;
        assert.equal(manifest.workspaceId, 'w');
        assert.ok(Object.isFrozen(manifest.heads));
        assert.ok(manifest.fields.includes('TITLE'));
        assert.ok(!manifest.fields.some((f) => /SNAPSHOT|CLAIM/.test(f)));
        if (!evidence) assert.ok(!manifest.fields.includes('SUPPORT_METADATA'));
        callback(manifest);
        if (deny) throw Error('denied');
      },
    },
    index = new OfflineKnowledgeSearchIndex(store, permissions);
  t.after(() => {
    index.close();
    if (db.isOpen) db.close();
  });
  return {
    ...f,
    db,
    store,
    preparer,
    attempt,
    index,
    permissions,
    setDeny(v) {
      deny = v;
    },
    setCheck(v) {
      callback = v;
    },
    get calls() {
      return calls;
    },
  };
}
test('actual FTS5 phrase search is deterministic, bounded and explicitly experimental', async (t) => {
  const f = await setup(t),
    built = f.index.rebuild(limits, f.c);
  assert.equal(built.items, 2);
  const result = f.index.search({ text: 'Matched contract', maxResults: 10 }, limits, f.c);
  assert.equal(result.results.length, 2);
  assert.deepEqual(
    result.results.map((r) => r.itemId),
    result.results.map((r) => r.itemId).sort(),
  );
  assert.equal(result.truncated, false);
  for (const hit of result.results) {
    assert.equal(hit.sourceFreshness, 'AFFECTED');
    assert.ok(hit.warnings.includes('AFFECTED'));
    assert.equal(typeof hit.rank, 'number');
  }
  const short = f.index.search({ text: 'Matched contract', maxResults: 1 }, limits, f.c);
  assert.equal(short.results.length, 1);
  assert.equal(short.truncated, true);
  assert.equal(short.totalMatches, 2);
  assert.equal(short.productionQuery, 'NOT_AUTHORIZED');
  assert.deepEqual(f.index.search({ text: '" OR *', maxResults: 10 }, limits, f.c).results, []);
});
test('pending candidates never enter index and query does not publish them', async (t) => {
  const f = await setup(t, false);
  f.index.rebuild(limits, f.c);
  assert.deepEqual(
    f.index.search({ text: 'Matched contract', maxResults: 10 }, limits, f.c).results,
    [],
  );
  assert.equal(f.db.prepare('SELECT count(*) n FROM offline_revisions').get().n, 0);
});
test('permission denial happens before text SELECT and generic full-command reader is never used', async (t) => {
  const f = await setup(t),
    prepare = f.db.prepare.bind(f.db);
  let textReads = 0;
  f.db.prepare = (sql) => {
    if (sql.startsWith('SELECT h.item_id AS item_id')) textReads++;
    assert.ok(!sql.startsWith('SELECT "payload_json"'));
    return prepare(sql);
  };
  f.store.readState = () => {
    throw Error('BROAD_READER_FORBIDDEN');
  };
  f.setDeny(true);
  assert.throws(() => f.index.rebuild(limits, f.c), { code: 'PERMISSION_DENIED' });
  assert.equal(textReads, 0);
  f.setDeny(false);
  f.index.rebuild(limits, f.c);
  assert.equal(textReads, 2);
  assert.equal(
    f.index.search({ text: 'Matched contract', maxResults: 10 }, limits, f.c).results.length,
    2,
  );
  assert.equal(textReads, 4);
});
test('permission loss after MATCH refuses result delivery; failed rebuild preserves old index', async (t) => {
  const f = await setup(t);
  f.index.rebuild(limits, f.c);
  let checks = 0;
  f.setCheck(() => {
    if (++checks === 3) throw Error('revoked after MATCH');
  });
  assert.throws(() => f.index.search({ text: 'Matched contract', maxResults: 10 }, limits, f.c), {
    code: 'PERMISSION_DENIED',
  });
  f.setCheck(() => {});
  f.setDeny(true);
  assert.throws(() => f.index.rebuild(limits, f.c), { code: 'PERMISSION_DENIED' });
  f.setDeny(false);
  assert.equal(
    f.index.search({ text: 'Matched contract', maxResults: 10 }, limits, f.c).results.length,
    2,
  );
});
test('head change invalidates derived index until explicit rebuild without changing old history', async (t) => {
  const f = await setup(t);
  f.index.rebuild(limits, f.c);
  const next = structuredClone(f.input);
  next.requestKey = 'search-update';
  next.candidates = [next.candidates[0]];
  next.subjects = [next.subjects[0]];
  next.candidates[0].payload.structuredContent.limitations.push('synthetic semantic change');
  next.candidates[0].payload.structuredContent.summary = 'Updated searchable phrase';
  next.subjects[0].candidateEnvelope = next.candidates[0];
  next.evaluation = evaluateCandidateRecord(
    {
      evaluationId: 'eval:updated',
      runId: next.runId,
      snapshot: next.snapshot,
      candidates: next.candidates,
    },
    f.c,
  );
  const prepared = await f.preparer.prepare(next, approve, f.c),
    attempt = f.store.begin(prepared.handle, limits, f.c);
  f.store.publish(attempt.handle, limits, f.c);
  assert.throws(() => f.index.search({ text: 'Matched contract', maxResults: 10 }, limits, f.c), {
    code: 'INDEX_UNAVAILABLE',
  });
  const revisions = f.db.prepare('SELECT count(*) n FROM offline_revisions').get().n;
  f.index.rebuild(limits, f.c);
  assert.equal(
    f.index.search({ text: 'Updated searchable phrase', maxResults: 10 }, limits, f.c).results
      .length,
    1,
  );
  assert.equal(f.db.prepare('SELECT count(*) n FROM offline_revisions').get().n, revisions);
});
test('missing index, invalid queries and exhausted budgets never masquerade as empty', async (t) => {
  const f = await setup(t);
  assert.throws(() => f.index.search({ text: 'Matched contract', maxResults: 10 }, limits, f.c), {
    code: 'INDEX_UNAVAILABLE',
  });
  f.index.rebuild(limits, f.c);
  assert.throws(() => f.index.search({ text: '', maxResults: 1 }, limits, f.c), {
    code: 'QUERY_INVALID',
  });
  assert.throws(() => f.index.search({ text: 'a', maxResults: 0 }, limits, f.c), {
    code: 'QUERY_INVALID',
  });
  assert.throws(
    () =>
      f.index.search({ text: 'Matched contract', maxResults: 1 }, { ...limits, maxRows: 1 }, f.c),
    { code: 'HISTORY_LIMIT_EXCEEDED' },
  );
  f.index.close();
  assert.throws(() => f.index.search({ text: 'a', maxResults: 1 }, limits, f.c), {
    code: 'INDEX_UNAVAILABLE',
  });
});
test('async/thenable permission callbacks and caller transaction replacement refuse', async (t) => {
  const f = await setup(t);
  assert.throws(
    () =>
      new OfflineKnowledgeSearchIndex(f.store, {
        kind: 'TEST_SEARCH_PERMISSIONS_NOT_AUTHORITY',
        async check() {},
      }),
  );
  const illegal = new OfflineKnowledgeSearchIndex(f.store, {
    kind: 'TEST_SEARCH_PERMISSIONS_NOT_AUTHORITY',
    check() {
      return Promise.reject(Error('not sync'));
    },
  });
  assert.throws(() => illegal.rebuild(limits, f.c), {
    code: 'PERMISSION_DENIED',
    cleanupState: 'UNKNOWN',
  });
  assert.throws(() => illegal.rebuild(limits, f.c), {
    code: 'INDEX_UNAVAILABLE',
    cleanupState: 'UNKNOWN',
  });
  illegal.close();
  let changed = false;
  f.setCheck(() => {
    if (!changed) {
      changed = true;
      f.db.exec('COMMIT;BEGIN');
    }
  });
  assert.throws(() => f.index.rebuild(limits, f.c), { code: 'INDEX_UNAVAILABLE' });
  assert.equal(f.db.isTransaction, true);
  f.db.exec('ROLLBACK');
});

test('same-head source text corruption cannot reuse a prior valid lexical index', async (t) => {
  const f = await setup(t);
  f.index.rebuild(limits, f.c);
  const ddl = f.db
    .prepare("SELECT sql FROM sqlite_schema WHERE name='offline_revisions_update'")
    .get().sql;
  f.db.exec(
    "DROP TRIGGER offline_revisions_update;UPDATE offline_revisions SET payload_json=json_set(payload_json,'$.revisionEnvelope.payload.structuredContent.summary','tampered text')",
  );
  f.db.exec(ddl);
  assert.throws(() => f.index.search({ text: 'Matched contract', maxResults: 10 }, limits, f.c), {
    code: 'INDEX_UNAVAILABLE',
  });
});

test('UTF8 processing budget rejects large nonprojected claim before any JSON projection prepare', async (t) => {
  const make = () => {
    const f = sampleSet();
    for (const subject of f.input.subjects)
      subject.stateBinding.claims[0].payload.value = { kind: 'LITERAL', value: '界'.repeat(30000) };
    return f;
  };
  const f = await setup(t, true, make),
    prepare = f.db.prepare.bind(f.db);
  const sizes = f.db
    .prepare(
      'SELECT sum(length(r.payload_json)+length(a.payload_json)+length(p.payload_json)) chars,sum(length(CAST(r.payload_json AS BLOB))+length(CAST(a.payload_json AS BLOB))+length(CAST(p.payload_json AS BLOB))) bytes FROM offline_heads h JOIN offline_revisions r ON r.id=h.revision_id JOIN offline_attempts a ON a.id=r.attempt_id JOIN offline_receipts p ON p.attempt_id=a.id',
    )
    .get();
  assert.ok(sizes.bytes > sizes.chars * 2);
  let jsonQueries = 0;
  f.db.prepare = (sql) => {
    if (/json_extract|json_each/.test(sql)) jsonQueries++;
    return prepare(sql);
  };
  assert.throws(
    () =>
      f.index.rebuild(
        { ...limits, maxSerializedBytes: Math.floor((sizes.chars + sizes.bytes) / 2) },
        f.c,
      ),
    { code: 'HISTORY_LIMIT_EXCEEDED' },
  );
  assert.equal(jsonQueries, 0);
});
test('consistently corrupted candidate/draft status cannot masquerade as published source', async (t) => {
  const f = await setup(t),
    revision = f.db
      .prepare('SELECT id,attempt_id,payload_json FROM offline_revisions LIMIT 1')
      .get(),
    attempt = f.db
      .prepare('SELECT payload_json FROM offline_attempts WHERE id=?')
      .get(revision.attempt_id),
    record = JSON.parse(revision.payload_json),
    command = JSON.parse(attempt.payload_json);
  record.itemEnvelope.payload.lifecycleState = 'DRAFT';
  record.revisionEnvelope.payload.publicationState = 'CANDIDATE';
  command.entries.find((e) => e.record.revisionEnvelope.payload.id === revision.id).record = record;
  const triggers = ['offline_revisions_update', 'offline_attempts_update'].map(
    (name) => f.db.prepare('SELECT sql FROM sqlite_schema WHERE name=?').get(name).sql,
  );
  f.db.exec('DROP TRIGGER offline_revisions_update;DROP TRIGGER offline_attempts_update');
  f.db
    .prepare('UPDATE offline_revisions SET payload_json=? WHERE id=?')
    .run(JSON.stringify(record), revision.id);
  f.db
    .prepare('UPDATE offline_attempts SET payload_json=? WHERE id=?')
    .run(JSON.stringify(command), revision.attempt_id);
  for (const ddl of triggers) f.db.exec(ddl);
  assert.throws(() => f.index.rebuild(limits, f.c), { code: 'INDEX_UNAVAILABLE' });
});

test('owned filtered first page returns exact projected provenance and filters before limit', async (t) => {
  const f = await setup(t, true, sampleSet, true);
  f.index.rebuild(limits, f.c);
  assert.equal(typeof f.index.searchPage, 'function');
  const r = f.index.searchPage(
    { text: 'Matched contract', maxResults: 1, types: ['INTEGRATION'] },
    limits,
    f.c,
  );
  assert.equal(r.results.length, 1);
  assert.equal(r.truncated, true);
  const hit = r.results[0];
  assert.equal(hit.type, 'INTEGRATION');
  assert.ok(hit.supportRefs.length > 0);
  assert.ok(hit.coverage);
  assert.equal(hit.provenance.runId, 'run:set');
  const other = f.index.searchPage(
    { text: 'Matched contract', maxResults: 1, types: ['COMPONENT'] },
    limits,
    f.c,
  );
  assert.deepEqual(other.results, []);
  assert.equal(other.truncated, false);
  assert.throws(
    () => f.index.searchPage({ text: 'Matched contract', maxResults: 1, types: [] }, limits, f.c),
    { code: 'QUERY_INVALID' },
  );
  assert.throws(
    () =>
      f.index.searchPage({ text: 'Matched contract', maxResults: 1, types: ['BAD'] }, limits, f.c),
    { code: 'QUERY_INVALID' },
  );
});

test('type filtering excludes an unrelated derived row before LIMIT', async (t) => {
  const exec = DatabaseSync.prototype.exec;
  DatabaseSync.prototype.exec = function (sql) {
    const result = exec.call(this, sql);
    if (sql.startsWith('CREATE VIRTUAL TABLE lexical'))
      this.prepare(
        'INSERT INTO lexical(item_id,revision_id,item_type,title,summary,goal) VALUES(?,?,?,?,?,?)',
      ).run(
        '0:derived-component',
        'derived:revision',
        'COMPONENT',
        'Matched contract',
        'Matched contract',
        'Matched contract',
      );
    return result;
  };
  let f;
  try {
    f = await setup(t, true, sampleSet, true);
    f.index.rebuild(limits, f.c);
  } finally {
    DatabaseSync.prototype.exec = exec;
  }
  const r = f.index.searchPage(
    { text: 'Matched contract', maxResults: 1, types: ['INTEGRATION'] },
    limits,
    f.c,
  );
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].type, 'INTEGRATION');
  assert.equal(r.totalMatches, 2);
});
test('evidence projection requires its own metadata permission', async (t) => {
  const f = await setup(t, true, sampleSet, false);
  f.index.rebuild(limits, f.c);
  assert.throws(
    () => f.index.searchPage({ text: 'Matched contract', maxResults: 1, types: null }, limits, f.c),
    { code: 'PERMISSION_DENIED' },
  );
});

test('same-head projected text drift after MATCH refuses delivery', async (t) => {
  const f = await setup(t, true, sampleSet, true);
  f.index.rebuild(limits, f.c);
  const proto = Object.getPrototypeOf(f.store),
    read = proto.readSearchProjection;
  let full = 0;
  proto.readSearchProjection = function (...args) {
    const value = read.apply(this, args);
    if (!args[3] && ++full === 2) {
      const changed = structuredClone(value);
      changed.records[0].title = 'Changed after MATCH';
      return changed;
    }
    return value;
  };
  try {
    assert.throws(
      () =>
        f.index.searchPage(
          { text: 'Matched contract', maxResults: 1, types: ['INTEGRATION'] },
          limits,
          f.c,
        ),
      { code: 'INDEX_UNAVAILABLE' },
    );
  } finally {
    proto.readSearchProjection = read;
  }
});

test('explicit context metadata selects exact refs before display projection and never substitutes current versions', async (t) => {
  const f = await setup(t, true, sampleSet, true);
  assert.equal(typeof f.store.readProjectContextProjection, 'function');
  const rows = f.db.prepare('SELECT item_id,revision_id FROM offline_heads ORDER BY item_id').all();
  const selected = [{ itemId: rows[0].item_id, revisionId: rows[0].revision_id }];
  let manifests = [];
  const r = f.store.readProjectContextProjection(
    selected,
    (m) => {
      manifests.push(m);
    },
    limits,
    f.c,
  );
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].itemId, selected[0].itemId);
  assert.ok(
    manifests.every((m) => m.heads.length === 1 && m.heads[0].itemId === selected[0].itemId),
  );
  assert.deepEqual(
    f.store.readProjectContextProjection(
      [{ ...selected[0], revisionId: 'historical:not-current' }],
      () => {},
      limits,
      f.c,
    ).records,
    [],
  );
});

test('status projection never selects display fields and authorizes only selected metadata', async (t) => {
  const f = await setup(t, true, sampleSet, true);
  assert.equal(typeof f.store.readKnowledgeStatusProjection, 'function');
  const rows = f.db.prepare('SELECT item_id,revision_id FROM offline_heads ORDER BY item_id').all();
  const selected = [{ itemId: rows[0].item_id, revisionId: rows[0].revision_id }];
  const prepare = f.db.prepare.bind(f.db);
  let statusQueries = 0;
  f.db.prepare = (sql) => {
    if (sql.includes('FROM offline_heads h')) {
      assert.doesNotMatch(
        sql,
        /structuredContent\.(?:title|summary|goal)| AS (?:title|summary|goal)(?:,| FROM)/,
      );
      statusQueries++;
    }
    return prepare(sql);
  };
  const r = f.store.readKnowledgeStatusProjection(
    selected,
    (m) => {
      assert.ok(!m.fields.some((f) => ['TITLE', 'SUMMARY', 'GOAL'].includes(f)));
      assert.equal(m.heads.length, 1);
    },
    limits,
    f.c,
  );
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].title, undefined);
  assert.equal(r.records[0].summary, undefined);
  assert.equal(r.records[0].goal, undefined);
  assert.ok(r.records[0].evidence.coverage);
  assert.ok(statusQueries > 0);
});
