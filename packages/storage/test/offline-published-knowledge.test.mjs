import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import { sampleSet, approve, limits } from './helpers/offline-publication-fixture.mjs';
import { OfflinePublicationPreparer } from '../../application/dist/offline-publication.js';
import { evaluateCandidateRecord } from '../../application/dist/evaluation-record.js';
import {
  initializeOfflinePublicationStore,
  OfflinePublicationStore,
} from '../dist/knowledge/offline-publication-store.js';
import { OfflineKnowledgeSearchIndex } from '../dist/knowledge/offline-knowledge-search.js';

const fields = [
  'PUBLISHED_ITEM',
  'PUBLISHED_REVISION',
  'REFERENCE_CONTEXT_METADATA',
  'COVERAGE',
  'PROVENANCE_IDS',
  'CURRENT_HEAD_ID',
];
async function setup(t, { publish = true, sentinel = false } = {}) {
  const f = sampleSet(),
    db = new DatabaseSync(':memory:');
  if (sentinel)
    for (const s of f.input.subjects)
      s.stateBinding.claims[0].payload.value.value = 'PRIVATE_CLAIM_BODY_SENTINEL';
  let store,
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
  t.after(() => {
    if (db.isOpen) db.close();
  });
  const refs = ready.command.entries.map((e) => ({
    itemId: e.record.itemEnvelope.payload.id,
    revisionId: e.record.revisionEnvelope.payload.id,
  }));
  const permissions = {
    kind: 'TEST_KNOWLEDGE_READ_NOT_AUTHORITY',
    check(manifest) {
      calls++;
      assert.equal(manifest.workspaceId, 'w');
      assert.equal(manifest.evidenceKind, 'TEST_KNOWLEDGE_READ_NOT_AUTHORITY');
      assert.deepEqual([...manifest.fields].sort(), [...fields].sort());
      assert.ok(Object.isFrozen(manifest) && Object.isFrozen(manifest.heads));
      callback(manifest);
    },
  };
  return {
    ...f,
    db,
    store,
    preparer,
    ready,
    attempt,
    refs,
    permissions,
    setCheck(fn) {
      callback = fn;
    },
    get calls() {
      return calls;
    },
  };
}
function read(f, refs = f.refs, permissions = f.permissions, readLimits = limits, c = f.c) {
  return f.store.readPublishedKnowledge(refs, permissions, readLimits, c);
}
function forbidBroadReads(f) {
  const prepare = f.db.prepare.bind(f.db),
    observed = [];
  f.db.prepare = (sql) => {
    observed.push(sql);
    assert.ok(
      !/SELECT\s+(?:\w+\.)?["`]?payload_json["`]?(?:\s|,)/i.test(sql),
      'whole stored JSON is forbidden',
    );
    return prepare(sql);
  };
  f.store.readState = () => {
    throw Error('BROAD_STATE_READER_FORBIDDEN');
  };
  f.store.committed = () => {
    throw Error('BROAD_COMMIT_READER_FORBIDDEN');
  };
  return observed;
}
function mutateRows(f, transform) {
  const triggers = ['offline_revisions_update', 'offline_attempts_update'].map(
    (name) => f.db.prepare('SELECT sql FROM sqlite_schema WHERE name=?').get(name).sql,
  );
  const revisions = f.db.prepare('SELECT id,attempt_id,payload_json FROM offline_revisions').all();
  const attempts = f.db.prepare('SELECT id,payload_json FROM offline_attempts').all();
  f.db.exec('DROP TRIGGER offline_revisions_update;DROP TRIGGER offline_attempts_update');
  for (const row of revisions) {
    const value = JSON.parse(row.payload_json);
    transform(value, null);
    f.db
      .prepare('UPDATE offline_revisions SET payload_json=? WHERE id=?')
      .run(JSON.stringify(value), row.id);
  }
  for (const row of attempts) {
    const value = JSON.parse(row.payload_json);
    transform(null, value);
    f.db
      .prepare('UPDATE offline_attempts SET payload_json=? WHERE id=?')
      .run(JSON.stringify(value), row.id);
  }
  for (const ddl of triggers) f.db.exec(ddl);
}

test('exact current selection returns both published revisions with trimmed reference metadata and real coverage', async (t) => {
  const f = await setup(t),
    statements = forbidBroadReads(f),
    result = read(f);
  assert.equal(result.kind, 'OWNED_TEST_PUBLICATION');
  assert.equal(result.workspaceId, 'w');
  assert.equal(result.productionQuery, 'NOT_AUTHORIZED');
  assert.equal(result.quality, 'NOT_EVALUABLE');
  assert.match(result.selectionDigest, /^[a-f0-9]{64}$/);
  assert.equal(result.records.length, 2);
  for (const row of result.records) {
    const entry = f.ready.command.entries.find(
      (e) => e.record.revisionEnvelope.payload.id === row.revisionEnvelope.payload.id,
    );
    const candidate = f.input.candidates.find((c) => c.payload.id === entry.candidateId);
    assert.deepEqual(row.itemEnvelope, entry.record.itemEnvelope);
    assert.deepEqual(row.revisionEnvelope, entry.record.revisionEnvelope);
    assert.deepEqual(row.coverage, candidate.payload.coverage);
    assert.equal(row.currentHeadRevisionId, row.revisionEnvelope.payload.id);
    assert.equal(row.isCurrentHead, true);
    assert.deepEqual(row.warnings, ['LIVE_SOURCE_NOT_OBSERVED', 'AFFECTED']);
    assert.deepEqual(row.provenance, {
      attemptId: f.attempt.attemptId,
      runId: f.input.runId,
      snapshotId: f.input.snapshot.snapshotId,
      revisionSetId: f.input.snapshot.revisionSetId,
      evaluationId: f.input.evaluation.evaluationId,
    });
    const actualRefs = [
      ...candidate.payload.structuredContent.participantRefs,
      ...candidate.payload.structuredContent.contractMatchRefs,
      ...candidate.payload.structuredContent.boundaryRefs,
    ];
    const allowed = [
      ...actualRefs,
      ...candidate.payload.supportRefs.map((s) => ({
        scope: 'REPOSITORY',
        repositoryId: s.basis.repositoryId,
        entity: s.entity,
      })),
    ];
    for (const ref of row.referenceContext.availableEntities)
      assert.ok(
        allowed.some((r) => isDeepStrictEqual(r, ref)),
        'other candidate context leaked',
      );
    for (const ref of actualRefs)
      assert.ok(row.referenceContext.availableEntities.some((r) => isDeepStrictEqual(r, ref)));
    assert.deepEqual(row.referenceContext.availableSupports, candidate.payload.supportRefs);
  }
  assert.ok(statements.length > 0);
  assert.ok(Object.isFrozen(result.records));
});

test('owned publication search hit opens its exact published knowledge without changing history', async (t) => {
  const f = await setup(t);
  const history = () =>
    ['offline_attempts', 'offline_revisions', 'offline_receipts', 'offline_heads'].map((table) =>
      f.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    );
  const before = history();
  const index = new OfflineKnowledgeSearchIndex(f.store, {
    kind: 'TEST_SEARCH_PERMISSIONS_NOT_AUTHORITY',
    check(manifest) {
      assert.equal(manifest.workspaceId, 'w');
      assert.ok(manifest.fields.includes('TITLE'));
    },
  });
  try {
    assert.equal(index.rebuild(limits, f.c).items, 2);
    const search = index.search({ text: 'Matched contract', maxResults: 10 }, limits, f.c);
    assert.equal(search.productionQuery, 'NOT_AUTHORIZED');
    assert.equal(search.results.length, 2);
    const hit = search.results[0];
    const result = read(f, [{ itemId: hit.itemId, revisionId: hit.revisionId }]);
    assert.equal(result.records.length, 1);
    const row = result.records[0];
    assert.equal(row.itemEnvelope.payload.id, hit.itemId);
    assert.equal(row.revisionEnvelope.payload.id, hit.revisionId);
    const entry = f.ready.command.entries.find(
      (e) => e.record.revisionEnvelope.payload.id === hit.revisionId,
    );
    const candidate = f.input.candidates.find((c) => c.payload.id === entry.candidateId);
    assert.deepEqual(row.revisionEnvelope, entry.record.revisionEnvelope);
    assert.deepEqual(row.coverage, candidate.payload.coverage);
    assert.deepEqual(row.referenceContext.availableSupports, candidate.payload.supportRefs);
    for (const ref of [
      ...candidate.payload.structuredContent.participantRefs,
      ...candidate.payload.structuredContent.contractMatchRefs,
      ...candidate.payload.structuredContent.boundaryRefs,
    ])
      assert.ok(
        row.referenceContext.availableEntities.some((actual) => isDeepStrictEqual(actual, ref)),
      );
    assert.equal(result.productionQuery, 'NOT_AUTHORIZED');
    assert.equal(result.quality, 'NOT_EVALUABLE');
    assert.deepEqual(history(), before);
  } finally {
    index.close();
  }
});

test('pending, missing, wrong-item and foreign-workspace selections fail as a whole', async (t) => {
  const pending = await setup(t, { publish: false });
  assert.throws(() => read(pending), { code: 'KNOWLEDGE_REVISION_NOT_FOUND' });
  const f = await setup(t);
  for (const refs of [
    [f.refs[0], { itemId: 'missing', revisionId: 'missing' }],
    [{ itemId: f.refs[0].itemId, revisionId: f.refs[1].revisionId }],
  ])
    assert.throws(() => read(f, refs), { code: 'KNOWLEDGE_REVISION_NOT_FOUND' });
  const foreign = new OfflinePublicationStore(f.db, 'foreign', f.preparer.identity);
  assert.throws(
    () =>
      foreign.readPublishedKnowledge(
        f.refs,
        { kind: 'TEST_KNOWLEDGE_READ_NOT_AUTHORITY', check() {} },
        limits,
        f.c,
      ),
    { code: 'KNOWLEDGE_REVISION_NOT_FOUND' },
  );
});

test('historical exact revision remains readable after update and reports current head separately', async (t) => {
  const f = await setup(t),
    next = structuredClone(f.input);
  next.requestKey = 'read:update';
  next.candidates = [next.candidates[0]];
  next.subjects = [next.subjects[0]];
  next.candidates[0].payload.structuredContent.limitations.push('synthetic semantic update');
  next.subjects[0].candidateEnvelope = next.candidates[0];
  next.evaluation = evaluateCandidateRecord(
    {
      evaluationId: 'eval:update',
      runId: next.runId,
      snapshot: next.snapshot,
      candidates: next.candidates,
    },
    f.c,
  );
  const ready = await f.preparer.prepare(next, approve, f.c),
    attempt = f.store.begin(ready.handle, limits, f.c);
  f.store.publish(attempt.handle, limits, f.c);
  const updated = ready.command.entries[0],
    old = read(f, [f.refs[0]]).records[0];
  assert.equal(old.revisionEnvelope.payload.id, f.refs[0].revisionId);
  assert.equal(old.currentHeadRevisionId, updated.record.revisionEnvelope.payload.id);
  assert.equal(old.isCurrentHead, false);
  assert.deepEqual(old.warnings, [
    'LIVE_SOURCE_NOT_OBSERVED',
    'AFFECTED',
    'HISTORICAL_PUBLISHED_REVISION',
  ]);
  assert.deepEqual(old.coverage, f.input.candidates[0].payload.coverage);
  const current = read(f, [{ itemId: f.refs[0].itemId, revisionId: old.currentHeadRevisionId }])
    .records[0];
  assert.equal(current.isCurrentHead, true);
  assert.equal(
    current.revisionEnvelope.payload.previousRevisionId,
    old.revisionEnvelope.payload.id,
  );
});

test('permission denial precedes body projection and delivery rechecks current permissions', async (t) => {
  const f = await setup(t),
    statements = forbidBroadReads(f);
  const bodies = () =>
    statements.filter((sql) =>
      /\$\.(?:referenceContext|revisionEnvelope['"]|itemEnvelope['"]|request\.candidates)/.test(
        sql,
      ),
    );
  f.setCheck((manifest) => {
    assert.deepEqual(
      [...manifest.heads].sort((a, b) => a.itemId.localeCompare(b.itemId)),
      [...f.refs].sort((a, b) => a.itemId.localeCompare(b.itemId)),
    );
    throw Error('denied');
  });
  assert.throws(() => read(f), { code: 'KNOWLEDGE_PERMISSION_DENIED' });
  assert.equal(bodies().length, 0);
  f.setCheck(() => {});
  read(f);
  assert.ok(bodies().length > 0);
  let checks = 0;
  f.setCheck(() => {
    if (++checks === 2) throw Error('revoked');
  });
  assert.throws(() => read(f), { code: 'KNOWLEDGE_PERMISSION_DENIED' });
  assert.equal(checks, 2);
});

test('selected knowledge never materializes snapshot or synthetic Claim bodies', async (t) => {
  const f = await setup(t, { sentinel: true }),
    statements = forbidBroadReads(f),
    result = read(f, [f.refs[0]]);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('PRIVATE_CLAIM_BODY_SENTINEL'));
  assert.ok(!serialized.includes('stateBinding'));
  assert.ok(!serialized.includes('"snapshot":'));
  assert.ok(!serialized.includes('capturedValueDigest'));
  for (const sql of statements)
    assert.ok(!/json_extract\([^)]*,'\$\.(?:stateBinding|request\.snapshot)['"]/.test(sql));
});

test('corrupt candidate coverage or consistently nonpublished source refuses', async (t) => {
  for (const kind of ['coverage', 'publication']) {
    const f = await setup(t);
    mutateRows(f, (record, command) => {
      if (kind === 'coverage' && command)
        for (const candidate of command.request.candidates)
          candidate.payload.coverage.status = 'BOGUS';
      if (kind === 'publication') {
        if (record) record.revisionEnvelope.payload.publicationState = 'CANDIDATE';
        if (command)
          for (const entry of command.entries)
            entry.record.revisionEnvelope.payload.publicationState = 'CANDIDATE';
      }
    });
    assert.throws(() => read(f), { code: 'KNOWLEDGE_RECORD_INVALID' });
  }
});

test('another real candidate cannot replace the selected revision candidate membership', async (t) => {
  const f = await setup(t),
    selected = f.ready.command.entries[0],
    other = f.input.candidates.find((candidate) => candidate.payload.id !== selected.candidateId);
  assert.ok(other);
  mutateRows(f, (_record, command) => {
    if (command) command.entries[0].candidateId = other.payload.id;
  });
  assert.throws(() => read(f, [f.refs[0]]), { code: 'KNOWLEDGE_RECORD_INVALID' });
});

test('consistent record and entry header corruption cannot change fixed type or previous revision', async (t) => {
  for (const kind of ['type', 'previousRevisionId']) {
    const f = await setup(t),
      selectedId = f.refs[0].revisionId;
    const corrupt = (record) => {
      if (record.revisionEnvelope.payload.id !== selectedId) return;
      if (kind === 'type') record.itemEnvelope.payload.type = 'CAPABILITY';
      else record.revisionEnvelope.payload.previousRevisionId = f.refs[1].revisionId;
    };
    mutateRows(f, (record, command) => {
      if (record) corrupt(record);
      if (command) for (const entry of command.entries) corrupt(entry.record);
    });
    // The SQL previous_id and receipt remain the original immutable NEW header.
    assert.equal(
      f.db.prepare('SELECT previous_id FROM offline_revisions WHERE id=?').get(selectedId)
        .previous_id,
      null,
    );
    assert.throws(() => read(f, [f.refs[0]]), { code: 'KNOWLEDGE_RECORD_INVALID' });
  }
});

test('empty duplicate malformed selection, cancellation and exhausted budget refuse', async (t) => {
  const f = await setup(t);
  for (const refs of [
    [],
    [f.refs[0], f.refs[0]],
    [{ ...f.refs[0], extra: true }],
    [{ itemId: f.refs[0].itemId, revisionId: '' }],
  ])
    assert.throws(() => read(f, refs), { code: 'KNOWLEDGE_QUERY_INVALID' });
  const abort = new AbortController();
  abort.abort();
  assert.throws(() => read(f, f.refs, f.permissions, limits, { ...f.c, signal: abort.signal }), {
    code: 'CANCELLED',
  });
  assert.throws(() => read(f, f.refs, f.permissions, { ...limits, maxRows: 1 }), {
    code: 'HISTORY_LIMIT_EXCEEDED',
  });
});

test('async permission function refuses and Promise outcome blocks subsequent knowledge reads as UNKNOWN', async (t) => {
  const f = await setup(t);
  assert.throws(
    () => read(f, f.refs, { kind: 'TEST_KNOWLEDGE_READ_NOT_AUTHORITY', async check() {} }),
    { code: 'KNOWLEDGE_PERMISSION_DENIED' },
  );
  assert.throws(
    () =>
      read(f, f.refs, {
        kind: 'TEST_KNOWLEDGE_READ_NOT_AUTHORITY',
        check() {
          return Promise.reject(Error('not synchronous'));
        },
      }),
    { code: 'KNOWLEDGE_PERMISSION_DENIED', cleanupState: 'UNKNOWN' },
  );
  assert.throws(() => read(f), { code: 'KNOWLEDGE_SOURCE_UNAVAILABLE', cleanupState: 'UNKNOWN' });
});
