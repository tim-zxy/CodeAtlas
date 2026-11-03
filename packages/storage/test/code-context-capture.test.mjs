import assert from 'node:assert/strict';
import { test } from 'node:test';

const api = await import('../dist/index.js');

// Break caught: capture cannot be used when its Storage export is missing.
test('Code capture exposes its read-only contract', () => {
  assert.equal(typeof api.captureRepositoryCodeContext, 'function');
  assert.equal(typeof api.recheckRepositoryCodeContext, 'function');
  assert.equal(typeof api.releaseRepositoryCodeContext, 'function');
});

// Break caught: positive expected graphs cannot be reached through validated Apply.
test('independent capture inputs build through normal owned Source and Apply workflows', async (t) => {
  const { cases, captureFixture } = await import('./helpers/code-context-capture-fixture.mjs');
  for (const sample of cases)
    await t.test(sample.id, async (t) => {
      const f = await captureFixture(t, sample.id);
      assert.equal(f.db.isTransaction, false);
      assert.equal(
        f.db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n,
        sample.runs.length,
      );
      for (const [table, expected] of [
        ['canonical_nodes', sample.canonicalNodes],
        ['canonical_edges', sample.canonicalEdges],
      ]) {
        assert.equal(f.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, expected.length);
        for (const fact of expected) {
          const row = f.db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(fact.id);
          assert.equal(row.fact_key, fact.factKey);
          assert.deepEqual(JSON.parse(row.confidence_reasons_json), fact.confidence.reasons);
          assert.equal(row.confidence_method, fact.confidence.method);
          if (table === 'canonical_nodes') assert.equal(row.name, fact.name);
          else {
            assert.equal(row.source_node_id, fact.source.id);
            assert.equal(row.target_node_id, fact.target.target.id);
          }
        }
      }
    });
});

// Break caught: header-only hashing, lost candidates/coverage, wrong UTF-8 framing.
test('capture matches every independently frozen Code and Source vector', async (t) => {
  const { cases, captureFixture } = await import('./helpers/code-context-capture-fixture.mjs');
  for (const sample of cases)
    await t.test(sample.id, async (t) => {
      const f = await captureFixture(t, sample.id);
      assert.equal(typeof api.captureRepositoryCodeContext, 'function');
      const captured = api.captureRepositoryCodeContext(f.db, sample.repository.id, f.limits);
      assert.deepEqual(captured.view, f.expected);
      assert.deepEqual(Object.keys(captured.handle), []);
      assert.equal(Object.isFrozen(captured.handle), true);
      assert.equal(Object.isFrozen(captured.view), true);
      if (captured.view.activeBasis) assert.equal(Object.isFrozen(captured.view.activeBasis), true);
      assert.equal(f.db.isTransaction, false);
    });
});

async function owned(t, id = 'complete') {
  const { captureFixture } = await import('./helpers/code-context-capture-fixture.mjs');
  assert.equal(typeof api.captureRepositoryCodeContext, 'function');
  return captureFixture(t, id);
}
function rejectsCapture(f, code, limits = f.limits) {
  assert.throws(
    () => api.captureRepositoryCodeContext(f.db, f.sample.repository.id, limits),
    (e) => e.code === code && e.message === code,
  );
  assert.equal(f.db.isTransaction, false);
}
// Break caught: a silently ignored control permits work beyond the explicit bound.
test('each independent exact resource boundary refuses one below', async (t) => {
  const { cases, captureFixture } = await import('./helpers/code-context-capture-fixture.mjs');
  assert.equal(typeof api.captureRepositoryCodeContext, 'function');
  for (const sample of cases)
    await t.test(sample.id, async (t) => {
      const f = await captureFixture(t, sample.id);
      for (const key of ['maxRows', 'maxSerializedBytes', 'memoryBudgetBytes'])
        rejectsCapture(f, 'CODE_CAPTURE_LIMIT_EXCEEDED', { ...f.limits, [key]: f.limits[key] - 1 });
      assert.deepEqual(
        api.captureRepositoryCodeContext(f.db, sample.repository.id, f.limits).view,
        f.expected,
      );
    });
});
// Break caught: structural/proxy/getter limits execute user code or gain defaults.
test('capture rejects fake connections and non-data exact limits without getters', async (t) => {
  const f = await owned(t);
  let getterCalls = 0;
  const accessor = { ...f.limits };
  Object.defineProperty(accessor, 'maxRows', {
    enumerable: true,
    get() {
      getterCalls++;
      return f.limits.maxRows;
    },
  });
  const invalid = [
    null,
    {},
    { ...f.limits, extra: 1 },
    accessor,
    new Proxy(f.limits, {}),
    { ...f.limits, maxRows: NaN },
    { ...f.limits, maxRows: Infinity },
    { ...f.limits, maxRows: -0 },
    { ...f.limits, maxRows: 0 },
    { ...f.limits, maxRows: Number.MAX_SAFE_INTEGER + 1 },
  ];
  for (const limits of invalid) rejectsCapture(f, 'INVALID_CODE_CAPTURE', limits);
  assert.equal(getterCalls, 0);
  for (const db of [{}, Object.create(Object.getPrototypeOf(f.db)), new Proxy(f.db, {})])
    assert.throws(
      () => api.captureRepositoryCodeContext(db, f.sample.repository.id, f.limits),
      (e) => e.code === 'INVALID_CODE_CAPTURE' && e.message === e.code,
    );
});
// NEGATIVE_ONLY: corruption in this test's explicitly owned disposable DB.
// Break caught: inner joins silently hide missing candidates/orphan relations.
test('capture rejects damaged support and unsupported schema without repair', async (t) => {
  const mutations = [
    [
      'missing-candidate',
      'DELETE FROM active_support_candidates WHERE rowid=(SELECT min(rowid) FROM active_support_candidates)',
      'CODE_CAPTURE_UNAVAILABLE',
    ],
    [
      'bad-candidate',
      `UPDATE active_support_candidates SET candidate_json='{"private-sentinel":"do-not-leak"}' WHERE rowid=(SELECT min(rowid) FROM active_support_candidates)`,
      'INVALID_CODE_CAPTURE',
    ],
    [
      'orphan-link',
      `PRAGMA foreign_keys=OFF; INSERT INTO fact_evidence VALUES('NODE','missing','missing')`,
      'INVALID_CODE_CAPTURE',
    ],
    [
      'orphan-binding',
      `PRAGMA foreign_keys=OFF; INSERT INTO provider_fact_bindings VALUES('NODE','p','pf','missing','missing','missing')`,
      'INVALID_CODE_CAPTURE',
    ],
    [
      'half-index',
      `UPDATE repository_state SET indexed_content_fingerprint=NULL`,
      'INVALID_CODE_CAPTURE',
    ],
    [
      'foreign-active',
      `PRAGMA foreign_keys=OFF; UPDATE evidence SET revision_id='foreign' WHERE rowid=(SELECT min(rowid) FROM evidence)`,
      'INVALID_CODE_CAPTURE',
    ],
    [
      'bad-unresolved',
      `INSERT INTO unresolved_targets VALUES('capture-worktree','edge:call','sentinel','[]')`,
      'INVALID_CODE_CAPTURE',
    ],
    ['missing-table', 'DROP TABLE active_support_candidates', 'CODE_CAPTURE_UNAVAILABLE'],
    ['unknown-version', 'PRAGMA user_version=11', 'CODE_CAPTURE_UNAVAILABLE'],
  ];
  for (const [id, sql, code] of mutations)
    await t.test(id, async (t) => {
      const f = await owned(t);
      f.db.exec(sql);
      rejectsCapture(f, code);
    });
});
// Break caught: the loader fetches an oversized payload before checking SQL lengths.
test('numeric preflight refuses oversized TEXT and BLOB before payload acquisition', async (t) => {
  for (const kind of ['TEXT', 'BLOB'])
    await t.test(kind, async (t) => {
      const f = await owned(t, 'source-only');
      if (kind === 'TEXT')
        f.db
          .prepare('UPDATE source_files SET path=?')
          .run('private-sentinel/'.repeat(f.limits.maxSerializedBytes));
      else {
        f.db.exec(
          'PRAGMA foreign_keys=OFF; ALTER TABLE source_files RENAME TO discarded_source_files; CREATE TABLE source_files AS SELECT * FROM discarded_source_files',
        );
        f.db.prepare('UPDATE source_files SET path=?').run(Buffer.from('private-sentinel'));
      }
      let payloadReads = 0;
      const prepare = f.db.prepare;
      t.mock.method(f.db, 'prepare', function (sql) {
        if (
          /^SELECT /i.test(sql) &&
          /\bpath\b/i.test(sql) &&
          !/length|typeof|pragma|count\(/i.test(sql)
        )
          payloadReads++;
        return prepare.call(this, sql);
      });
      rejectsCapture(f, kind === 'TEXT' ? 'CODE_CAPTURE_LIMIT_EXCEEDED' : 'INVALID_CODE_CAPTURE');
      assert.equal(payloadReads, 0);
    });
});

// Break caught: duplicate semantic keys are silently hashed as two valid facts.
test('duplicate Source and Canonical keys refuse before successful capture', async (t) => {
  for (const table of ['source_files', 'canonical_nodes'])
    await t.test(table, async (t) => {
      const f = await owned(t);
      // NEGATIVE_ONLY: remove constraints in this disposable corrupt-schema control.
      f.db.exec(
        `PRAGMA foreign_keys=OFF; CREATE TABLE duplicate_copy AS SELECT * FROM ${table}; DROP TABLE ${table}; ALTER TABLE duplicate_copy RENAME TO ${table}; INSERT INTO ${table} SELECT * FROM ${table} LIMIT 1`,
      );
      rejectsCapture(f, 'INVALID_CODE_CAPTURE');
    });
});
// Break caught: physical order or JSON member order substitutes for semantic order.
test('capture ignores validated observation order and equivalent JSON text layout', async (t) => {
  const { captureFixture } = await import('./helpers/code-context-capture-fixture.mjs');
  const f = await captureFixture(t, 'unicode-order', { reverseInputOrder: true });
  assert.deepEqual(
    api.captureRepositoryCodeContext(f.db, f.sample.repository.id, f.limits).view,
    f.expected,
  );
  const other = await captureFixture(t, 'complete');
  const prepare = other.db.prepare;
  let transformed = 0;
  t.mock.method(other.db, 'prepare', function (sql) {
    const statement = prepare.call(this, sql);
    if (
      /^SELECT evidence_id,fact_type,canonical_fact_id,candidate_json FROM active_support_candidates WHERE rowid=\?/i.test(
        sql,
      )
    ) {
      const get = statement.get;
      t.mock.method(statement, 'get', function (...args) {
        const row = get.apply(this, args);
        if (row) {
          row.candidate_json = JSON.stringify(
            Object.fromEntries(Object.entries(JSON.parse(row.candidate_json)).reverse()),
          );
          transformed++;
        }
        return row;
      });
    }
    return statement;
  });
  assert.deepEqual(
    api.captureRepositoryCodeContext(other.db, other.sample.repository.id, other.limits).view,
    other.expected,
  );
  assert.ok(transformed > 0);
});

// Break caught: a copied digest or another connection gains authority.
test('live handles stay private and connection-bound; cross failures preserve owner', async (t) => {
  const f = await owned(t),
    g = await owned(t);
  const c = api.captureRepositoryCodeContext(f.db, f.sample.repository.id, f.limits);
  assert.equal(api.recheckRepositoryCodeContext(f.db, c.handle, f.limits), undefined);
  for (const handle of [
    {},
    structuredClone(c.handle),
    JSON.parse(JSON.stringify(c.view)),
    new Proxy(c.handle, {}),
  ]) {
    assert.throws(
      () => api.recheckRepositoryCodeContext(f.db, handle, f.limits),
      (e) => e.code === 'INVALID_CODE_CAPTURE',
    );
    assert.throws(
      () => api.releaseRepositoryCodeContext(f.db, handle),
      (e) => e.code === 'INVALID_CODE_CAPTURE',
    );
  }
  for (const op of [
    () => api.recheckRepositoryCodeContext(g.db, c.handle, g.limits),
    () => api.releaseRepositoryCodeContext(g.db, c.handle),
  ])
    assert.throws(op, (e) => e.code === 'INVALID_CODE_CAPTURE');
  assert.equal(api.recheckRepositoryCodeContext(f.db, c.handle, f.limits), undefined);
});
// Break caught: ambient old snapshots are inherited or implicitly rolled back.
test('ambient transactions refuse before SQL and leave caller transaction intact', async (t) => {
  const f = await owned(t),
    capture = api.captureRepositoryCodeContext(f.db, f.sample.repository.id, f.limits);
  f.db.exec('BEGIN');
  f.db.prepare('SELECT count(*) FROM repository').get();
  const prepare = f.db.prepare;
  let calls = 0;
  t.mock.method(f.db, 'prepare', function (...args) {
    calls++;
    return prepare.apply(this, args);
  });
  try {
    for (const op of [
      () => api.captureRepositoryCodeContext(f.db, f.sample.repository.id, f.limits),
      () => api.recheckRepositoryCodeContext(f.db, capture.handle, f.limits),
    ])
      assert.throws(op, (e) => e.code === 'INVALID_CODE_CAPTURE');
    assert.equal(calls, 0);
    assert.equal(f.db.isTransaction, true);
  } finally {
    f.db.exec('ROLLBACK');
  }
  assert.throws(
    () => api.recheckRepositoryCodeContext(f.db, capture.handle, f.limits),
    (e) => e.code === 'CODE_CAPTURE_RELEASED',
  );
});
// Break caught: a failed recheck revives, or invalidates unrelated valid handles.
test('valid-handle limits and data failures permanently invalidate only that handle', async (t) => {
  for (const mode of ['LIMIT', 'ARGUMENT', 'IR', 'SQL'])
    await t.test(mode, async (t) => {
      const f = await owned(t),
        one = api.captureRepositoryCodeContext(f.db, f.sample.repository.id, f.limits),
        two = api.captureRepositoryCodeContext(f.db, f.sample.repository.id, f.limits);
      let limits = f.limits,
        code = 'INVALID_CODE_CAPTURE';
      if (mode === 'LIMIT') {
        limits = { ...limits, maxRows: limits.maxRows - 1 };
        code = 'CODE_CAPTURE_LIMIT_EXCEEDED';
      }
      if (mode === 'ARGUMENT') limits = { ...limits, unexpected: 1 };
      if (mode === 'IR')
        f.db.exec(
          `UPDATE active_support_candidates SET candidate_json='{"private-sentinel":"no"}' WHERE rowid=(SELECT min(rowid) FROM active_support_candidates)`,
        );
      if (mode === 'SQL')
        t.mock.method(f.db, 'prepare', () => {
          throw new Error('private-sentinel SQL path');
        });
      assert.throws(
        () => api.recheckRepositoryCodeContext(f.db, one.handle, limits),
        (e) => e.code === code && e.message === code,
      );
      if (mode === 'SQL') t.mock.restoreAll();
      assert.equal(f.db.isTransaction, false);
      assert.throws(
        () => api.recheckRepositoryCodeContext(f.db, one.handle, f.limits),
        (e) => e.code === 'CODE_CAPTURE_RELEASED',
      );
      if (mode === 'LIMIT' || mode === 'ARGUMENT')
        assert.equal(api.recheckRepositoryCodeContext(f.db, two.handle, f.limits), undefined);
    });
});
// Break caught: Source changes under identical indexed WORKTREE are ignored.
test('normal Source replacement changes capture and invalidates the old handle', async (t) => {
  const f = await owned(t),
    c = api.captureRepositoryCodeContext(f.db, f.sample.repository.id, f.limits);
  const state = f.session.sourceState.load(f.sample.repository.id);
  const replacement = {
    revision: { ...state.revision, contentFingerprint: 'capture-fingerprinz' },
    files: state.files,
  };
  f.session.sourceState.replace(state, replacement);
  const { readPlan } = await import('../../../fixtures/phase1/code-context-capture/authoring.mjs');
  const controls = readPlan({ ...f.sample, revision: replacement.revision }, f.rootPath).limits;
  assert.throws(
    () => api.recheckRepositoryCodeContext(f.db, c.handle, controls),
    (e) => e.code === 'CODE_CAPTURE_CHANGED' && e.message === e.code,
  );
  assert.throws(
    () => api.recheckRepositoryCodeContext(f.db, c.handle, controls),
    (e) => e.code === 'CODE_CAPTURE_RELEASED',
  );
});
// Break caught: a short read transaction survives capture or sees stale data on recheck.
test('a second real connection publishes normally; recheck sees its committed Code', async (t) => {
  const f = await owned(t),
    c = api.captureRepositoryCodeContext(f.db, f.sample.repository.id, f.limits);
  const { DatabaseSync } = await import('node:sqlite');
  const database = new DatabaseSync(f.databasePath, { enableForeignKeyConstraints: true });
  const writer = { database, close: () => database.close() };
  try {
    const { cases, readPlan } =
      await import('../../../fixtures/phase1/code-context-capture/authoring.mjs');
    const history = cases.find((c) => c.id === 'history-snapshot-set'),
      next = structuredClone(history.runs[1]);
    f.sample.runs.push(next);
    await f.applyRun(next, 1, writer.database);
    assert.equal(f.db.isTransaction, false);
    assert.throws(
      () => api.recheckRepositoryCodeContext(f.db, c.handle, readPlan(history, f.rootPath).limits),
      (e) => e.code === 'CODE_CAPTURE_CHANGED',
    );
  } finally {
    writer.close();
  }
});
// Break caught: close/reopen of the SAME JS object revives a prior connection handle.
test('closed and reopened connection incarnations never revive handles', async (t) => {
  for (const reopen of [false, true])
    await t.test(String(reopen), async (t) => {
      const f = await owned(t),
        c = api.captureRepositoryCodeContext(f.db, f.sample.repository.id, f.limits);
      f.db.close();
      if (reopen) f.db.open();
      assert.throws(
        () => api.recheckRepositoryCodeContext(f.db, c.handle, f.limits),
        (e) => e.code === 'CODE_CAPTURE_RELEASED',
      );
      assert.equal(api.releaseRepositoryCodeContext(f.db, c.handle), undefined);
    });
});
// Break caught: release issues SQL, accepts foreign handles, or is not idempotent.
test('release has no SQL and is idempotent; first closed release reports RELEASED', async (t) => {
  for (const closed of [false, true])
    await t.test(String(closed), async (t) => {
      const f = await owned(t),
        c = api.captureRepositoryCodeContext(f.db, f.sample.repository.id, f.limits);
      if (closed) f.db.close();
      t.mock.method(f.db, 'prepare', () => assert.fail('release must not prepare SQL'));
      t.mock.method(f.db, 'exec', () => assert.fail('release must not exec SQL'));
      if (closed)
        assert.throws(
          () => api.releaseRepositoryCodeContext(f.db, c.handle),
          (e) => e.code === 'CODE_CAPTURE_RELEASED',
        );
      else assert.equal(api.releaseRepositoryCodeContext(f.db, c.handle), undefined);
      assert.equal(api.releaseRepositoryCodeContext(f.db, c.handle), undefined);
      assert.throws(
        () => api.recheckRepositoryCodeContext(f.db, c.handle, f.limits),
        (e) => e.code === 'CODE_CAPTURE_RELEASED',
      );
      t.mock.restoreAll();
    });
});

// NEGATIVE_ONLY: catches ACTIVE evidence disappearing behind forward-only joins.
test('active Evidence without binding and dangling unresolved candidates refuse', async (t) => {
  for (const mode of ['EVIDENCE', 'CANDIDATE'])
    await t.test(mode, async (t) => {
      const f = await owned(t, 'same-header-losing-support-A');
      f.db.exec('PRAGMA foreign_keys=OFF');
      if (mode === 'EVIDENCE')
        f.db.exec(
          "DELETE FROM active_support_candidates WHERE evidence_id=(SELECT id FROM evidence WHERE provider_id='beta' AND fact_type='NODE' LIMIT 1); DELETE FROM fact_evidence WHERE evidence_id=(SELECT id FROM evidence WHERE provider_id='beta' AND fact_type='NODE' LIMIT 1); DELETE FROM provider_fact_bindings WHERE evidence_id=(SELECT id FROM evidence WHERE provider_id='beta' AND fact_type='NODE' LIMIT 1)",
        );
      else
        f.db.exec(
          "UPDATE active_support_candidates SET candidate_json=json_set(candidate_json,'$.source.id','missing-node') WHERE fact_type='EDGE'",
        );
      rejectsCapture(f, 'INVALID_CODE_CAPTURE');
    });
});

// Break caught: hidden reads, repeated lookup omission, or TEXT fetched outside the read plan.
test('real SQL deliveries and UTF-8 payload bytes equal the independent read plan', async (t) => {
  const { cases, captureFixture } = await import('./helpers/code-context-capture-fixture.mjs');
  for (const sample of cases)
    await t.test(sample.id, async (t) => {
      const f = await captureFixture(t, sample.id);
      let rows = 0,
        text = 0;
      const prepare = f.db.prepare;
      const delivered = (row) => {
        if (row) {
          rows++;
          for (const v of Object.values(row))
            if (typeof v === 'string') text += Buffer.byteLength(v);
        }
      };
      t.mock.method(f.db, 'prepare', function (sql) {
        const stmt = prepare.call(this, sql),
          get = stmt.get,
          iterate = stmt.iterate;
        t.mock.method(stmt, 'get', function (...args) {
          const row = get.apply(this, args);
          delivered(row);
          return row;
        });
        t.mock.method(stmt, 'iterate', function* (...args) {
          for (const row of iterate.apply(this, args)) {
            delivered(row);
            yield row;
          }
        });
        return stmt;
      });
      assert.deepEqual(
        api.captureRepositoryCodeContext(f.db, sample.repository.id, f.limits).view,
        f.expected,
      );
      assert.equal(rows, f.readPlan.limits.maxRows);
      assert.equal(text, f.readPlan.payloadTextBytes);
    });
});
// Supplemental independent input is frozen in the owned sample before capture.
// Break caught: unresolved hint/candidate content is omitted or dangling refs pass.
test('complete unresolved targets match independent frames and reject missing candidate nodes', async (t) => {
  const { captureFixture } = await import('./helpers/code-context-capture-fixture.mjs');
  const f = await captureFixture(t, 'complete', {
    mutateSample(sample) {
      const target = {
        state: 'UNRESOLVED',
        resolution: 'AMBIGUOUS',
        originalHint: 'independent-target',
        candidates: [
          { factType: 'NODE', id: 'node:a' },
          { factType: 'NODE', id: 'node:b' },
        ],
      };
      sample.canonicalEdges[0].target = structuredClone(target);
      sample.runs[0].edges[0].canonical.target = structuredClone(target);
    },
  });
  assert.deepEqual(
    api.captureRepositoryCodeContext(f.db, f.sample.repository.id, f.limits).view,
    f.expected,
  );
  // NEGATIVE_ONLY: change a same-length target,never reactivate or publish it.
  f.db.exec(
    'UPDATE unresolved_targets SET candidates_json=\'[{"factType":"NODE","id":"node:z"},{"factType":"NODE","id":"node:b"}]\'',
  );
  rejectsCapture(f, 'INVALID_CODE_CAPTURE');
});

// Break caught: read-only capture writes persistent state or requires a writable session.
test('a real read-only connection captures without changing database bytes', async (t) => {
  const f = await owned(t);
  const { readFile } = await import('node:fs/promises');
  const { DatabaseSync } = await import('node:sqlite');
  const before = await readFile(f.databasePath),
    db = new DatabaseSync(f.databasePath, { readOnly: true });
  try {
    assert.deepEqual(
      api.captureRepositoryCodeContext(db, f.sample.repository.id, f.limits).view,
      f.expected,
    );
  } finally {
    db.close();
  }
  assert.deepEqual(await readFile(f.databasePath), before);
});
// Break caught: only the Source fingerprint,or only Code,is rechecked.
test('Source classification and stored locator changes invalidate captures', async (t) => {
  for (const mode of ['CLASSIFICATION', 'LOCATOR'])
    await t.test(mode, async (t) => {
      const f = await owned(t),
        c = api.captureRepositoryCodeContext(f.db, f.sample.repository.id, f.limits);
      if (mode === 'CLASSIFICATION') {
        const before = f.session.sourceState.load(f.sample.repository.id);
        f.session.sourceState.replace(before, {
          revision: before.revision,
          files: before.files.map((file) => ({
            ...file,
            classification: { ...file.classification, role: 'TEST' },
          })),
        });
      } else {
        // NEGATIVE_ONLY: store locator is an identity,not filesystem authorization.
        f.db.prepare('UPDATE repository SET root_path=?').run(f.rootPath.slice(0, -1) + 'x');
      }
      assert.throws(
        () => api.recheckRepositoryCodeContext(f.db, c.handle, f.limits),
        (e) => e.code === 'CODE_CAPTURE_CHANGED',
      );
    });
});
// Break caught: unsupported SQLite encoding reaches TEXT acquisition.
test('non-UTF-8 capture refuses before schema and payload reads', async (t) => {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("PRAGMA encoding='UTF-16le';CREATE TABLE marker(id INTEGER);PRAGMA user_version=10");
    const prepare = db.prepare;
    let schemaReads = 0;
    t.mock.method(db, 'prepare', function (sql) {
      if (/pragma_table_info/.test(sql)) schemaReads++;
      return prepare.call(this, sql);
    });
    assert.throws(
      () =>
        api.captureRepositoryCodeContext(db, 'capture-repo', {
          maxRows: 2,
          maxSerializedBytes: 1,
          memoryBudgetBytes: 1,
        }),
      (e) => e.code === 'CODE_CAPTURE_UNAVAILABLE',
    );
    assert.equal(schemaReads, 0);
    assert.equal(db.isTransaction, false);
  } finally {
    db.close();
  }
});

// NEGATIVE_ONLY: equal column count must not hide a missing released R010 column.
test('coverage schema requires its physical id even though identity excludes it', async (t) => {
  const f = await owned(t);
  f.db.exec(
    'PRAGMA foreign_keys=OFF;CREATE TABLE wrong_coverage AS SELECT id AS substituted_id,provider_snapshot_id,capability_name,source_file_id,status FROM analysis_coverage;DROP TABLE analysis_coverage;ALTER TABLE wrong_coverage RENAME TO analysis_coverage',
  );
  rejectsCapture(f, 'CODE_CAPTURE_UNAVAILABLE');
});
