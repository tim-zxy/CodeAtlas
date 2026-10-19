import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as storage from '../dist/index.js';
import {
  validateNativeStateCandidate,
  validateNativeRefreshOverlay,
} from '../../providers/dist/index.js';
import { selectMergedGroup } from '../../providers/dist/fact-merger-selection.js';
import { baseCase } from '../../providers/test/helpers/native-full-v3-corpus.mjs';
import { emptyNativePatch } from './helpers/native-refresh-patch-fixture.mjs';

const limits = { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 16 * 1024 * 1024 };

for (const [rollback, captureFailure] of [
  [false, false],
  [true, false],
  [true, true],
])
  test(`D5 Store retirement owns raw rows and transferred IDs through ${rollback ? 'rollback' : 'activation'}${captureFailure ? ' despite capture failure' : ''}`, async (t) => {
    const { observeNativeApplySql } =
      await import('../dist/analysis/native-apply-sql-observation.js');
    const c = await emptyNativePatch(t, false, false, ['f-0', 'f-1']);
    c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
    c.stage.sealNativePatchState(c.expected, c.token, validateNativeRefreshOverlay);
    const before = image(c.db);
    const removals = c.db
      .prepare(
        "SELECT payload FROM temp.patch_event WHERE kind='REMOVE_NODE' ORDER BY source_path,provider_id,provider_fact_id,sequence",
      )
      .all();
    const expected = [];
    let retained = 0;
    const affectedIds = new Map();
    for (const event of removals) {
      const removal = JSON.parse(event.payload);
      const raw = c.db
        .prepare(
          "SELECT evidence_id,canonical_fact_id FROM provider_fact_bindings WHERE provider_id=? AND provider_fact_id=? AND fact_type='NODE'",
        )
        .get(removal.providerId, removal.providerFactId);
      const bytes = Buffer.byteLength(raw.evidence_id) + Buffer.byteLength(raw.canonical_fact_id);
      const ambient = 21 + Buffer.byteLength(event.payload);
      expected.push(['STORE_RETIRE_ROW', 'ENTER', ambient + retained + bytes]);
      retained -= affectedIds.get(raw.canonical_fact_id) ?? 0;
      affectedIds.set(raw.canonical_fact_id, Buffer.byteLength(raw.canonical_fact_id));
      retained += Buffer.byteLength(raw.canonical_fact_id);
      expected.push([
        'STORE_AFFECTED_ID',
        'ENTER',
        ambient + retained + Buffer.byteLength(raw.evidence_id),
      ]);
      expected.push(['STORE_RETIRE_ROW', 'EXIT', ambient + retained]);
      if (rollback) break;
    }
    assert.ok(removals.length > 1);
    if (rollback)
      c.db.exec(
        "CREATE TEMP TRIGGER d5_retire_failure AFTER UPDATE ON evidence WHEN NEW.status='INVALIDATED' BEGIN SELECT RAISE(ABORT, 'D5 retirement rollback'); END",
      );
    const records = [];
    const result = observeNativeApplySql(
      (r) => {
        records.push(r);
        if (captureFailure && r.phase === 'STORE_AFFECTED_ID') throw 0;
      },
      () =>
        new storage.RepositoryCanonicalFactStore(c.db).applyNativeAnalysisPatch(
          c.stage,
          {
            repositoryId: 'r',
            baseRevisionId: 'rev',
            baseContentFingerprint: 'base',
            targetRevisionId: 'rev',
            targetContentFingerprint: 'target',
            snapshot: c.snapshot,
          },
          c.token,
        ),
    );
    assert.equal(result.captureFailed, captureFailure);
    assert.equal(result.threw, rollback);
    if (rollback) assert.match(result.error.message, /D5 retirement rollback/);
    if (captureFailure) {
      assert.equal(result.captureFailure, 0);
      assert.equal(records.at(-1).phase, 'STORE_AFFECTED_ID');
      assert.equal(records.at(-1).boundary, 'ENTER');
      assert.ok(
        records.at(-1).retainedSqlBytes > 0,
        'Failed capture must not invent a later settled record',
      );
    } else {
      assert.deepEqual(
        records
          .filter(
            (r) =>
              r.phase === 'STORE_RETIRE_ROW' ||
              (r.phase === 'STORE_AFFECTED_ID' && r.boundary === 'ENTER'),
          )
          .map((r) => [r.phase, r.boundary, r.retainedSqlBytes]),
        expected,
      );
      assert.ok(records.some((r) => r.phase === 'STORE_AFFECTED_ID' && r.boundary === 'EXIT'));
      assert.equal(records.at(-1).retainedSqlBytes, 0);
    }
    assert.equal(c.db.isTransaction, false);
    if (rollback) assert.deepEqual(image(c.db), before);
    else
      assert.equal(
        c.db.prepare("SELECT count(*) AS n FROM evidence WHERE status='ACTIVE'").get().n,
        0,
      );
  });

for (const mismatch of [false, true])
  test(`D5 Store source file and range checks own actual fields ${mismatch ? 'on mismatch' : 'through validation'}`, async (t) => {
    const { observeNativeApplySql } =
      await import('../dist/analysis/native-apply-sql-observation.js');
    const c = await emptyNativePatch(t, true);
    const file = structuredClone(c.context.targetSourceFiles[0]);
    if (mismatch) file.path = 'src/mismatch.java';
    await c.stage.acceptNativeEvent({ type: 'SOURCE_FILE', payload: file });
    const fileBytes = Buffer.byteLength(
      c.db.prepare("SELECT payload FROM temp.patch_event WHERE kind='SOURCE_FILE'").get().payload,
    );
    const snapshot = { ...c.snapshot, diagnostics: [{ sourceRange: { sourceFileId: 'f-0' } }] };
    // The actual shared validation method and real TEMP rows; no publication shortcut.
    const resultRows = [];
    const result = observeNativeApplySql(
      (r) => resultRows.push(r),
      () =>
        new storage.RepositoryCanonicalFactStore(c.db).validatePatchSources(
          c.stage,
          'r',
          'rev',
          snapshot,
          true,
        ),
    );
    assert.equal(result.captureFailed, false);
    assert.equal(result.threw, mismatch);
    if (mismatch) assert.equal(result.error.code, 'INVALID_PATCH');
    assert.deepEqual(
      resultRows
        .filter((r) => r.phase === 'STORE_SOURCE_FILE' || r.phase === 'STORE_SOURCE_RANGE')
        .map((r) => [r.phase, r.boundary, r.retainedSqlBytes]),
      mismatch
        ? [
            ['STORE_SOURCE_FILE', 'ENTER', fileBytes + 14],
            ['STORE_SOURCE_FILE', 'EXIT', fileBytes],
          ]
        : [
            ['STORE_SOURCE_FILE', 'ENTER', fileBytes + 14],
            ['STORE_SOURCE_FILE', 'EXIT', fileBytes],
            ['STORE_SOURCE_RANGE', 'ENTER', 14],
            ['STORE_SOURCE_RANGE', 'EXIT', 0],
          ],
    );
    if (mismatch)
      assert.equal(
        resultRows.filter((r) => r.phase.startsWith('STORE_SOURCE')).length,
        2,
        'Refusal must not invent later lookup records',
      );
    assert.equal(c.db.isTransaction, false);
  });

for (const missing of [false, true])
  test(`D5 Store source lookup records ${missing ? 'missing-row rollback' : 'raw coverage fields'}`, async (t) => {
    const { observeNativeApplySql } =
      await import('../dist/analysis/native-apply-sql-observation.js');
    const c = await emptyNativePatch(t, true, true);
    c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
    c.stage.sealNativePatchState(c.expected, c.token, validateNativeRefreshOverlay);
    const before = image(c.db);
    const sourceBefore = c.db.prepare('SELECT * FROM source_files ORDER BY id').all();
    const coverageBytes = Buffer.byteLength(
      c.db
        .prepare(
          "SELECT payload FROM temp.patch_event WHERE kind='COVERAGE' ORDER BY sequence LIMIT 1",
        )
        .get().payload,
    );
    const records = [];
    const result = observeNativeApplySql(
      (r) => {
        records.push(r);
        // Test-only drift under the existing Apply lock, after Native prechecks.
        if (missing && r.phase === 'STORE_POINTER' && r.boundary === 'ENTER')
          c.db.prepare("DELETE FROM source_files WHERE id='f-0'").run();
      },
      () =>
        new storage.RepositoryCanonicalFactStore(c.db).applyNativeAnalysisPatch(
          c.stage,
          {
            repositoryId: 'r',
            baseRevisionId: 'rev',
            baseContentFingerprint: 'base',
            targetRevisionId: 'rev',
            targetContentFingerprint: 'base',
            snapshot: c.snapshot,
          },
          c.token,
        ),
    );
    assert.equal(result.captureFailed, false);
    assert.equal(result.threw, missing);
    if (missing) assert.equal(result.error.code, 'INVALID_PATCH');
    // Locals19 and suspended coverage payload; src/0.java10 + fp-0 4.
    assert.deepEqual(
      records
        .filter((r) => r.phase === 'STORE_SOURCE_COVERAGE')
        .map((r) => [r.boundary, r.retainedSqlBytes]),
      missing
        ? [
            ['ENTER', 19 + coverageBytes],
            ['EXIT', 19 + coverageBytes],
          ]
        : [
            ['ENTER', 33 + coverageBytes],
            ['EXIT', 19 + coverageBytes],
            ['ENTER', 33 + coverageBytes],
            ['EXIT', 19 + coverageBytes],
          ],
    );
    assert.equal(records.at(-1).retainedSqlBytes, 0);
    assert.equal(c.db.isTransaction, false);
    assert.deepEqual(c.db.prepare('SELECT * FROM source_files ORDER BY id').all(), sourceBefore);
    if (missing) assert.deepEqual(image(c.db), before);
    else
      assert.equal(
        storage.captureNativeActivationToken(c.db, 'r').indexedContentFingerprint,
        'base',
      );
  });

for (const rollback of [false, true])
  test(`D5 Store candidate group stays owned through real reselection ${rollback ? 'rollback' : 'activation'}`, async (t) => {
    const { observeNativeApplySql } =
      await import('../dist/analysis/native-apply-sql-observation.js');
    const c = await emptyNativePatch(t, false, false, ['f-0', 'f-1'], ':memory:', 'source-less');
    c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
    c.stage.sealNativePatchState(c.expected, c.token, validateNativeRefreshOverlay);
    const before = image(c.db);
    const raw = c.db
      .prepare(
        `SELECT a.candidate_json,b.provider_id,b.provider_fact_id,
      b.provider_snapshot_id,b.evidence_id FROM provider_fact_bindings b
      JOIN active_support_candidates a ON a.evidence_id=b.evidence_id WHERE b.provider_id='z-other'`,
      )
      .get();
    const bytes = Object.values(raw).reduce((sum, value) => sum + Buffer.byteLength(value), 0);
    // The affected Map retains one raw SQL ID per NODE key after Native retirement.
    const retiredIdBytes = c.db
      .prepare(
        "SELECT DISTINCT canonical_fact_id FROM provider_fact_bindings WHERE provider_id='native' AND fact_type='NODE'",
      )
      .all()
      .reduce((sum, row) => sum + Buffer.byteLength(row.canonical_fact_id), 0);
    if (rollback)
      c.db.exec(
        "CREATE TEMP TRIGGER d5_group_failure AFTER UPDATE ON canonical_nodes WHEN NEW.name='OtherProviderName' BEGIN SELECT RAISE(ABORT, 'D5 group rollback'); END",
      );
    const records = [];
    let selectorOwned = false;
    const select = c.stage.selectGroup.bind(c.stage);
    c.stage.selectGroup = (group) => {
      selectorOwned =
        records.at(-1)?.phase === 'STORE_CANDIDATE_GROUP' &&
        records.at(-1)?.boundary === 'ENTER' &&
        records.at(-1)?.retainedSqlBytes === 21 + retiredIdBytes + bytes;
      return select(group);
    };
    const result = observeNativeApplySql(
      (r) => records.push(r),
      () =>
        new storage.RepositoryCanonicalFactStore(c.db).applyNativeAnalysisPatch(
          c.stage,
          {
            repositoryId: 'r',
            baseRevisionId: 'rev',
            baseContentFingerprint: 'base',
            targetRevisionId: 'rev',
            targetContentFingerprint: 'target',
            snapshot: c.snapshot,
          },
          c.token,
        ),
    );
    assert.equal(result.threw, rollback);
    if (rollback) assert.match(result.error.message, /D5 group rollback/);
    assert.equal(result.captureFailed, false);
    assert.equal(selectorOwned, true);
    const owned = records.filter((r) => r.phase === 'STORE_CANDIDATE_GROUP');
    assert.deepEqual(
      owned.map((r) => [r.boundary, r.retainedSqlBytes]),
      [
        ['ENTER', 21 + retiredIdBytes + bytes],
        ['EXIT', 21 + retiredIdBytes],
      ],
    );
    assert.equal(records.at(-1).retainedSqlBytes, 0);
    assert.equal(c.db.isTransaction, false);
    if (rollback) assert.deepEqual(image(c.db), before);
    else
      assert.equal(
        c.db.prepare('SELECT name FROM canonical_nodes WHERE id=?').get(c.otherSupport.canonical.id)
          .name,
        'OtherProviderName',
      );
  });

test('D5 Store baseline owns each raw candidate together with its fact-key lookup', async (t) => {
  const { observeNativeApplySql } =
    await import('../dist/analysis/native-apply-sql-observation.js');
  const c = await emptyNativePatch(t, false, false, []);
  c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
  c.stage.sealNativePatchState(c.expected, c.token, validateNativeRefreshOverlay);
  // Independent byte oracle from the fixture's persisted input, not the observer.
  const input = c.db
    .prepare(
      `SELECT b.fact_type, b.canonical_fact_id, b.provider_id,
    b.provider_fact_id, a.candidate_json, n.fact_key
    FROM provider_fact_bindings b JOIN active_support_candidates a ON a.evidence_id=b.evidence_id
    JOIN canonical_nodes n ON n.id=b.canonical_fact_id AND n.revision_id='rev'`,
    )
    .all();
  assert.ok(input.length > 0);
  const expected = input
    .map((row) => {
      const raw = [
        'fact_type',
        'canonical_fact_id',
        'provider_id',
        'provider_fact_id',
        'candidate_json',
      ].reduce((bytes, key) => bytes + Buffer.byteLength(row[key]), 0);
      // WORKTREE8 + target6; indexed rev3 + base4 = 21 retained local bytes.
      return [21 + raw, 21 + raw + Buffer.byteLength(row.fact_key), 21 + raw, 21];
    })
    .sort((a, b) => a[0] - b[0]);
  const records = [];
  const result = observeNativeApplySql(
    (record) => records.push(record),
    () =>
      new storage.RepositoryCanonicalFactStore(c.db).applyNativeAnalysisPatch(
        c.stage,
        {
          repositoryId: 'r',
          baseRevisionId: 'rev',
          baseContentFingerprint: 'base',
          targetRevisionId: 'rev',
          targetContentFingerprint: 'target',
          snapshot: c.snapshot,
        },
        c.token,
      ),
  );
  assert.equal(result.threw, false);
  assert.equal(result.captureFailed, false);
  const baseline = records.filter((r) => r.phase.startsWith('STORE_BASELINE'));
  const actual = [];
  for (let i = 0; i < baseline.length; i += 4) {
    assert.deepEqual(
      baseline.slice(i, i + 4).map((r) => [r.phase, r.boundary]),
      [
        ['STORE_BASELINE_ROW', 'ENTER'],
        ['STORE_BASELINE_FACT', 'ENTER'],
        ['STORE_BASELINE_FACT', 'EXIT'],
        ['STORE_BASELINE_ROW', 'EXIT'],
      ],
    );
    actual.push(baseline.slice(i, i + 4).map((r) => r.retainedSqlBytes));
  }
  assert.deepEqual(
    actual.sort((a, b) => a[0] - b[0]),
    expected,
  );
  assert.ok(baseline.every((r) => r.retainedSqlStringChargeBytes === 2 * r.retainedSqlBytes));
  assert.equal(c.db.isTransaction, false);
  assert.equal(storage.captureNativeActivationToken(c.db, 'r').indexedContentFingerprint, 'target');
});

test('D5 Store malformed baseline records the row prefix and rolls back without a fact lookup', async (t) => {
  const { observeNativeApplySql } =
    await import('../dist/analysis/native-apply-sql-observation.js');
  const c = await emptyNativePatch(t, false, false, []);
  c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
  c.stage.sealNativePatchState(c.expected, c.token, validateNativeRefreshOverlay);
  const before = image(c.db);
  const records = [];
  const result = observeNativeApplySql(
    (record) => {
      records.push(record);
      if (record.phase === 'STORE_POINTER' && record.boundary === 'ENTER')
        c.db.prepare("UPDATE active_support_candidates SET candidate_json='{}'").run();
    },
    () =>
      new storage.RepositoryCanonicalFactStore(c.db).applyNativeAnalysisPatch(
        c.stage,
        {
          repositoryId: 'r',
          baseRevisionId: 'rev',
          baseContentFingerprint: 'base',
          targetRevisionId: 'rev',
          targetContentFingerprint: 'target',
          snapshot: c.snapshot,
        },
        c.token,
      ),
  );
  assert.equal(result.threw, true);
  assert.equal(result.error.code, 'FULL_ANALYSIS_REQUIRED');
  assert.equal(result.captureFailed, false);
  assert.deepEqual(
    records.filter((r) => r.phase.startsWith('STORE_BASELINE')).map((r) => [r.phase, r.boundary]),
    [
      ['STORE_BASELINE_ROW', 'ENTER'],
      ['STORE_BASELINE_ROW', 'EXIT'],
    ],
  );
  assert.equal(records.at(-1).retainedSqlBytes, 0);
  assert.equal(c.db.isTransaction, false);
  assert.deepEqual(image(c.db), before);
});
const tables = [
  'canonical_nodes',
  'canonical_edges',
  'unresolved_targets',
  'evidence',
  'fact_evidence',
  'provider_fact_bindings',
  'active_support_candidates',
  'provider_snapshots',
  'analysis_coverage',
  'analysis_diagnostics',
  'native_analysis_state',
  'native_analysis_file',
  'repository_state',
];
function image(db) {
  return Object.fromEntries(
    tables.map((table) => [
      table,
      db
        .prepare(`SELECT * FROM ${table}`)
        .all()
        .map((row) => JSON.stringify(row))
        .sort(),
    ]),
  );
}

// Real disk Store/Provider component; not admitted Runtime or Rust acceptance.
async function preparedEmpty(t) {
  const dir = await mkdtemp(join(tmpdir(), 'codeatlas-refresh-store-'));
  const path = join(dir, 'repository.sqlite');
  const db = new DatabaseSync(path);
  const plan = await storage.loadMigrationPlan(
    new URL('../migrations/repository/manifest.json', import.meta.url),
    'REPOSITORY',
  );
  for (const migration of plan.migrations) db.exec(migration.sql);
  db.exec('PRAGMA user_version=10');
  db.prepare('INSERT INTO repository(slot,id,root_path) VALUES(1,?,?)').run('r', '/r');
  db.prepare('INSERT INTO repository_state(repository_id) VALUES(?)').run('r');
  db.prepare(
    'INSERT INTO revisions(id,repository_id,kind,content_fingerprint) VALUES(?,?,?,?)',
  ).run('rev', 'r', 'WORKTREE', 'base');
  const bundle = baseCase('zero-file').bundle;
  const { schemaVersion, sourceFileCount, summaryDigest, ...expectation } = bundle.header;
  const snapshot = {
    id: 'snap',
    repositoryId: 'r',
    providerId: 'native',
    providerVersion: '0.0.0',
    runtimeVersion: '0.0.0',
    requestedRevisionId: 'rev',
    requestedRevisionFingerprint: 'base',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:01.000Z',
    capabilities: [{ name: 'SYMBOL', support: 'SUPPORTED', coverage: 'COMPLETE' }],
    diagnostics: [],
    outcome: 'SUCCEEDED',
  };
  const full = new storage.RepositoryAnalysisStage(db, limits);
  const store = new storage.RepositoryCanonicalFactStore(db);
  try {
    full.confirmSucceeded({
      type: 'ANALYSIS_COMPLETED',
      payload: {
        outcome: 'SUCCEEDED',
        repositoryId: 'r',
        revisionId: 'rev',
        revisionFingerprint: 'base',
        providerSnapshotId: 'snap',
        capabilities: snapshot.capabilities,
        counts: { sourceFiles: 0, nodes: 0, edges: 0, coverage: 0, diagnostics: 0 },
      },
    });
    full.sealNativeState(
      JSON.stringify(bundle.header),
      expectation,
      validateNativeStateCandidate,
      limits,
    );
    store.applyNativeAnalysisBatch(
      full,
      { repositoryId: 'r', revisionId: 'rev', contentFingerprint: 'base', snapshot },
      storage.captureNativeActivationToken(db, 'r'),
    );
  } finally {
    full.close();
  }
  const read = storage.readNativeAnalysisState(
    db,
    expectation,
    validateNativeStateCandidate,
    limits,
  );
  assert.equal(read.status, 'AVAILABLE');
  const stage = new storage.RepositoryPatchStage(
    db,
    (group) => selectMergedGroup(group).fact,
    limits,
    { baseline: read.state, targetSourceFiles: [] },
  );
  const next = { ...snapshot, id: 'snap-next' };
  stage.confirmNativeSucceeded(
    {
      type: 'REFRESH_COMPLETED',
      payload: {
        outcome: 'SUCCEEDED',
        repositoryId: 'r',
        revisionId: 'rev',
        revisionFingerprint: 'base',
        providerSnapshotId: next.id,
        capabilities: next.capabilities,
        counts: {
          sourceFiles: 0,
          upsertedNodes: 0,
          removedNodes: 0,
          upsertedEdges: 0,
          removedEdges: 0,
          coverage: 0,
          diagnostics: 0,
        },
        summaryRecords: 0,
        analysisState: bundle.header,
      },
    },
    next,
  );
  stage.sealNativePatchState(expectation, read.token, validateNativeRefreshOverlay);
  let closed = false;
  function reopen() {
    stage.close();
    db.close();
    closed = true;
    return new DatabaseSync(path);
  }
  t.after(async () => {
    if (!closed) {
      stage.close();
      db.close();
    }
    await rm(dir, { recursive: true, force: true });
  });
  return {
    db,
    store,
    stage,
    token: read.token,
    reopen,
    path,
    baseline: read.state,
    expectation,
    header: bundle.header,
    expected: {
      repositoryId: 'r',
      baseRevisionId: 'rev',
      baseContentFingerprint: 'base',
      targetRevisionId: 'rev',
      targetContentFingerprint: 'base',
      snapshot: next,
    },
  };
}

test('D5 Store raw locals overlap inside real Apply and unwind without changing activation', async (t) => {
  const module = await import('../dist/analysis/native-apply-sql-observation.js').catch((error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  });
  assert.equal(typeof module.observeNativeApplySql, 'function', 'Apply SQL owner missing');
  const c = await preparedEmpty(t);
  const rawTokenRow = c.db.prepare('SELECT * FROM native_analysis_state').get();
  const tokenRowBytes = Object.values(rawTokenRow).reduce(
    (sum, field) => sum + Buffer.byteLength(field),
    0,
  );
  const tokenTupleBytes =
    Buffer.byteLength(rawTokenRow.provider_id) +
    Buffer.byteLength(rawTokenRow.provider_snapshot_id) +
    64;
  const tokenTrace = [7, 7 + tokenRowBytes, 7 + tokenRowBytes + 64, 7 + tokenTupleBytes, 0];
  const tokenRecords = ['POINTER', 'ROW', 'ACCEPTED', 'RETURN', 'SCOPE'].map((phase, index) => [
    `STORE_TOKEN_${phase}`,
    index === 4 ? 'EXIT' : 'ENTER',
    tokenTrace[index],
  ]);
  assert.equal(c.db.prepare("SELECT count(*) AS n FROM evidence WHERE status='ACTIVE'").get().n, 0);
  tokenRecords.push(
    ['STORE_ACTIVE_SUPPORT_RETURN', 'ENTER', 0],
    ['STORE_ACTIVE_SUPPORT_SCOPE', 'EXIT', 0],
  );
  const records = [];
  const result = module.observeNativeApplySql(
    (r) => records.push(r),
    () => c.store.applyNativeAnalysisPatch(c.stage, c.expected, c.token),
  );
  assert.equal(result.threw, false);
  assert.equal(result.captureFailed, false);
  assert.deepEqual(
    records.map((r) => [r.phase, r.boundary, r.retainedSqlBytes]),
    [
      // WORKTREE(8) + base(4); pointer adds rev(3) + base(4).
      ...tokenRecords,
      ...tokenRecords,
      ['STORE_REVISION', 'ENTER', 12],
      ['STORE_POINTER', 'ENTER', 19],
      ['STORE_POINTER', 'EXIT', 12],
      ['STORE_REVISION', 'EXIT', 0],
    ],
  );
  assert.equal(c.db.isTransaction, false);
  const reopened = c.reopen();
  try {
    assert.equal(reopened.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 2);
    assert.equal(
      reopened.prepare('SELECT provider_snapshot_id FROM native_analysis_state').get()
        .provider_snapshot_id,
      'snap-next',
    );
  } finally {
    reopened.close();
  }
});

test('D5 Store raw locals unwind on real rollback and capture failure cannot mask SQLite failure', async (t) => {
  const { observeNativeApplySql } =
    await import('../dist/analysis/native-apply-sql-observation.js');
  const c = await preparedEmpty(t);
  const before = image(c.db);
  const rawTokenRow = c.db.prepare('SELECT * FROM native_analysis_state').get();
  const tokenRowBytes = Object.values(rawTokenRow).reduce(
    (sum, field) => sum + Buffer.byteLength(field),
    0,
  );
  const tokenTupleBytes =
    Buffer.byteLength(rawTokenRow.provider_id) +
    Buffer.byteLength(rawTokenRow.provider_snapshot_id) +
    64;
  const tokenTrace = [7, 7 + tokenRowBytes, 7 + tokenRowBytes + 64, 7 + tokenTupleBytes, 0];
  c.db.exec(`CREATE TEMP TRIGGER fail_owner_apply BEFORE INSERT ON native_analysis_state
    BEGIN SELECT RAISE(ABORT, 'owner rollback'); END`);
  const records = [];
  const result = observeNativeApplySql(
    (r) => records.push(r),
    () => c.store.applyNativeAnalysisPatch(c.stage, c.expected, c.token),
  );
  assert.equal(result.threw, true);
  assert.equal(result.error.code, 'ERR_SQLITE_ERROR');
  assert.equal(result.captureFailed, false);
  assert.deepEqual(
    records.map((r) => r.retainedSqlBytes),
    [...tokenTrace, 0, 0, ...tokenTrace, 0, 0, 12, 19, 12, 0],
  );
  assert.equal(c.db.isTransaction, false);
  assert.deepEqual(image(c.db), before);
  const failedCapture = observeNativeApplySql(
    () => {
      throw 0;
    },
    () => c.store.applyNativeAnalysisPatch(c.stage, c.expected, c.token),
  );
  assert.equal(failedCapture.threw, true);
  assert.equal(failedCapture.error.code, 'ERR_SQLITE_ERROR');
  assert.equal(failedCapture.captureFailed, true);
  assert.equal(failedCapture.captureFailure, 0);
  assert.equal(c.db.isTransaction, false);
  assert.deepEqual(image(c.db), before);
  const reopened = c.reopen();
  try {
    assert.deepEqual(image(reopened), before);
  } finally {
    reopened.close();
  }
});

test('Native empty refresh coactivates snapshot and derived header, survives reopen, and legacy stays closed', async (t) => {
  const c = await preparedEmpty(t);
  assert.throws(() => c.store.applyAnalysisPatch(c.stage, c.expected), /seal/i);
  assert.equal(typeof c.store.applyNativeAnalysisPatch, 'function');
  assert.ok(c.store.applyNativeAnalysisPatch(c.stage, c.expected, c.token) >= 0);
  const db = c.reopen();
  try {
    assert.deepEqual(
      db
        .prepare('SELECT id FROM provider_snapshots ORDER BY id')
        .all()
        .map((r) => r.id),
      ['snap', 'snap-next'],
    );
    assert.equal(
      db.prepare('SELECT provider_snapshot_id FROM native_analysis_state').get()
        .provider_snapshot_id,
      'snap-next',
    );
    assert.equal(db.prepare('SELECT count(*) AS n FROM native_analysis_file').get().n, 0);
    assert.equal(
      db.prepare('SELECT indexed_content_fingerprint FROM repository_state').get()
        .indexed_content_fingerprint,
      'base',
    );
  } finally {
    db.close();
  }
});

function prepareLegacyPatch(c, db = c.db, snapshot = c.expected.snapshot) {
  if (db === c.db) c.stage.close();
  const stage = new storage.RepositoryPatchStage(db, (group) => selectMergedGroup(group).fact);
  stage.confirmSucceeded({
    type: 'REFRESH_COMPLETED',
    payload: {
      outcome: 'SUCCEEDED',
      repositoryId: 'r',
      revisionId: 'rev',
      revisionFingerprint: 'base',
      providerSnapshotId: snapshot.id,
      counts: {
        sourceFiles: 0,
        upsertedNodes: 0,
        removedNodes: 0,
        upsertedEdges: 0,
        removedEdges: 0,
        coverage: 0,
        diagnostics: 0,
      },
    },
  });
  return stage;
}

test('successful legacy patch invalidates Native summaries even at the same fingerprint after reopen', async (t) => {
  const c = await preparedEmpty(t);
  const legacy = prepareLegacyPatch(c);
  try {
    c.store.applyAnalysisPatch(legacy, c.expected);
  } finally {
    legacy.close();
  }
  const db = c.reopen();
  try {
    assert.equal(db.prepare('SELECT count(*) AS n FROM native_analysis_state').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM native_analysis_file').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 2);
    assert.equal(
      db.prepare('SELECT indexed_content_fingerprint FROM repository_state').get()
        .indexed_content_fingerprint,
      'base',
    );
    assert.equal(
      storage.readNativeAnalysisState(db, c.expectation, validateNativeStateCandidate, limits)
        .status,
      'UNAVAILABLE',
    );
    const token = storage.captureNativeActivationToken(db, 'r');
    assert.equal(token.committedSnapshotCount, c.token.committedSnapshotCount + 1);
  } finally {
    db.close();
  }
});

test('failed legacy summary invalidation preserves the exact Native baseline after reopen', async (t) => {
  const c = await preparedEmpty(t);
  const before = image(c.db);
  const legacy = prepareLegacyPatch(c);
  c.db.exec(
    "CREATE TRIGGER legacy_failure AFTER DELETE ON native_analysis_state BEGIN SELECT RAISE(ABORT, 'injected legacy failure'); END",
  );
  try {
    assert.throws(() => c.store.applyAnalysisPatch(legacy, c.expected), /injected legacy failure/);
    assert.equal(c.db.isTransaction, false);
  } finally {
    legacy.close();
  }
  const db = c.reopen();
  try {
    assert.deepEqual(image(db), before);
    const read = storage.readNativeAnalysisState(
      db,
      c.expectation,
      validateNativeStateCandidate,
      limits,
    );
    assert.equal(read.status, 'AVAILABLE');
    assert.deepEqual(read.token, c.token);
  } finally {
    db.close();
  }
});

for (const [name, trigger] of [
  ['snapshot insertion', "AFTER INSERT ON provider_snapshots WHEN NEW.id='snap-next'"],
  ['summary deletion', 'AFTER DELETE ON native_analysis_state'],
  [
    'summary insertion',
    "AFTER INSERT ON native_analysis_state WHEN NEW.provider_snapshot_id='snap-next'",
  ],
  ['pointer update', 'AFTER UPDATE ON repository_state'],
])
  test(`Native refresh ${name} failure preserves exact reopened old image`, async (t) => {
    const c = await preparedEmpty(t),
      before = image(c.db);
    c.db.exec(
      `CREATE TRIGGER refresh_failure ${trigger} BEGIN SELECT RAISE(ABORT, 'injected refresh failure'); END`,
    );
    assert.equal(typeof c.store.applyNativeAnalysisPatch, 'function');
    assert.throws(
      () => c.store.applyNativeAnalysisPatch(c.stage, c.expected, c.token),
      /injected refresh failure/,
    );
    assert.equal(c.db.isTransaction, false);
    const db = c.reopen();
    try {
      assert.deepEqual(image(db), before);
    } finally {
      db.close();
    }
  });

test('Native activation refuses changed token before starting a write transaction', async (t) => {
  const c = await preparedEmpty(t);
  const before = image(c.db);
  assert.equal(typeof c.store.applyNativeAnalysisPatch, 'function');
  assert.throws(
    () =>
      c.store.applyNativeAnalysisPatch(c.stage, c.expected, {
        ...c.token,
        committedSnapshotCount: c.token.committedSnapshotCount + 1,
      }),
    /token|baseline/i,
  );
  assert.equal(c.db.isTransaction, false);
  assert.deepEqual(image(c.db), before);
});

for (const owners of [['f-0'], ['f-0', 'f-1']])
  test(`Native named owner deletion ${owners.join(',')} preserves retained provenance after reopen`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'codeatlas-refresh-delete-'));
    const path = join(dir, 'repository.sqlite');
    const c = await emptyNativePatch(t, false, false, owners, path);
    t.after(() => rm(dir, { recursive: true, force: true }));
    c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
    c.stage.sealNativePatchState(c.expected, c.token, validateNativeRefreshOverlay);
    const beforeEvidence = c.db
      .prepare(
        "SELECT id,provider_fact_id,provider_snapshot_id FROM evidence WHERE status='ACTIVE'",
      )
      .all();
    const retained = new Set(
      c.stage
        .readSealedNativeState()
        .files.flatMap((f) => JSON.parse(f.summaryJson).emittedFacts.map((x) => x.providerFactId)),
    );
    const expected = {
      repositoryId: 'r',
      baseRevisionId: 'rev',
      baseContentFingerprint: 'base',
      targetRevisionId: 'rev',
      targetContentFingerprint: 'target',
      snapshot: c.snapshot,
    };
    new storage.RepositoryCanonicalFactStore(c.db).applyNativeAnalysisPatch(
      c.stage,
      expected,
      c.token,
    );
    c.stage.close();
    c.db.close();
    const reopened = new DatabaseSync(path);
    try {
      const active = reopened
        .prepare(
          "SELECT id,provider_fact_id,provider_snapshot_id FROM evidence WHERE status='ACTIVE'",
        )
        .all();
      assert.deepEqual(
        active.map((r) => ({ ...r })).sort((a, b) => a.id.localeCompare(b.id)),
        beforeEvidence
          .filter((r) => retained.has(r.provider_fact_id))
          .map((r) => ({ ...r }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      );
      assert.ok(active.every((r) => r.provider_snapshot_id === 'snap'));
      assert.equal(
        reopened.prepare('SELECT count(*) AS n FROM native_analysis_file').get().n,
        2 - owners.length,
      );
      assert.equal(
        reopened.prepare('SELECT indexed_content_fingerprint FROM repository_state').get()
          .indexed_content_fingerprint,
        'target',
      );
      assert.equal(
        reopened.prepare("SELECT count(*) AS n FROM evidence WHERE status='INVALIDATED'").get().n,
        owners.length === 1 ? 1 : 3,
      );
    } finally {
      reopened.close();
    }
  });

for (const scenario of ['preserve', 'preserve-nonlast', 'dangling', 'reselection-rollback'])
  test(`Native owner deletion other Provider ${scenario} after reopen`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'codeatlas-refresh-other-'));
    const path = join(dir, 'repository.sqlite');
    const c = await emptyNativePatch(
      t,
      false,
      false,
      scenario === 'preserve-nonlast' ? ['f-0'] : ['f-0', 'f-1'],
      path,
      scenario === 'dangling' ? 'source-backed' : 'source-less',
    );
    t.after(() => rm(dir, { recursive: true, force: true }));
    c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
    const before = image(c.db);
    const otherBefore = c.db
      .prepare('SELECT * FROM evidence WHERE id=?')
      .get(c.otherSupport.evidence.id);
    const candidateBefore = c.db
      .prepare('SELECT * FROM active_support_candidates WHERE evidence_id=?')
      .get(c.otherSupport.evidence.id);
    const selectedBefore = c.db
      .prepare('SELECT name FROM canonical_nodes WHERE id=?')
      .get(c.otherSupport.canonical.id).name;
    const expected = {
      repositoryId: 'r',
      baseRevisionId: 'rev',
      baseContentFingerprint: 'base',
      targetRevisionId: 'rev',
      targetContentFingerprint: 'target',
      snapshot: c.snapshot,
    };
    const apply = () =>
      new storage.RepositoryCanonicalFactStore(c.db).applyNativeAnalysisPatch(
        c.stage,
        expected,
        c.token,
      );
    if (scenario === 'dangling') {
      assert.throws(
        () => c.stage.sealNativePatchState(c.expected, c.token, validateNativeRefreshOverlay),
        /Dangling retained source/,
      );
      assert.throws(apply, /seal/i);
    } else {
      c.stage.sealNativePatchState(c.expected, c.token, validateNativeRefreshOverlay);
      if (scenario === 'reselection-rollback') {
        c.db.exec(
          "CREATE TRIGGER reselection_failure AFTER UPDATE ON canonical_nodes WHEN NEW.name='OtherProviderName' BEGIN SELECT RAISE(ABORT, 'injected reselection failure'); END",
        );
        assert.throws(apply, /injected reselection failure/);
      } else apply();
    }
    assert.equal(c.db.isTransaction, false);
    c.stage.close();
    c.db.close();
    const db = new DatabaseSync(path);
    try {
      if (scenario === 'dangling' || scenario === 'reselection-rollback')
        assert.deepEqual(image(db), before);
      else {
        assert.deepEqual(
          db.prepare('SELECT * FROM evidence WHERE id=?').get(c.otherSupport.evidence.id),
          otherBefore,
        );
        assert.equal(
          db
            .prepare('SELECT count(*) AS n FROM active_support_candidates WHERE evidence_id=?')
            .get(c.otherSupport.evidence.id).n,
          1,
        );
        assert.equal(
          db.prepare('SELECT name FROM canonical_nodes WHERE id=?').get(c.otherSupport.canonical.id)
            .name,
          scenario === 'preserve-nonlast' ? selectedBefore : 'OtherProviderName',
        );
        assert.deepEqual(
          db
            .prepare('SELECT * FROM active_support_candidates WHERE evidence_id=?')
            .get(c.otherSupport.evidence.id),
          candidateBefore,
        );
        assert.equal(
          db.prepare('SELECT count(*) AS n FROM native_analysis_file').get().n,
          scenario === 'preserve-nonlast' ? 1 : 0,
        );
      }
    } finally {
      db.close();
    }
  });

test('two same-fingerprint Native attempts cannot activate from one baseline token', async (t) => {
  const c = await preparedEmpty(t);
  const second = new DatabaseSync(c.path);
  const stage = new storage.RepositoryPatchStage(
    second,
    (group) => selectMergedGroup(group).fact,
    limits,
    { baseline: c.baseline, targetSourceFiles: [] },
  );
  try {
    const snapshot = { ...c.expected.snapshot, id: 'snap-race' };
    stage.confirmNativeSucceeded(
      {
        type: 'REFRESH_COMPLETED',
        payload: {
          outcome: 'SUCCEEDED',
          repositoryId: 'r',
          revisionId: 'rev',
          revisionFingerprint: 'base',
          providerSnapshotId: snapshot.id,
          capabilities: snapshot.capabilities,
          counts: {
            sourceFiles: 0,
            upsertedNodes: 0,
            removedNodes: 0,
            upsertedEdges: 0,
            removedEdges: 0,
            coverage: 0,
            diagnostics: 0,
          },
          summaryRecords: 0,
          analysisState: c.header,
        },
      },
      snapshot,
    );
    stage.sealNativePatchState(c.expectation, c.token, validateNativeRefreshOverlay);
    c.store.applyNativeAnalysisPatch(c.stage, c.expected, c.token);
    const committed = image(c.db);
    assert.throws(
      () =>
        new storage.RepositoryCanonicalFactStore(second).applyNativeAnalysisPatch(
          stage,
          { ...c.expected, snapshot },
          c.token,
        ),
      /baseline|token/i,
    );
    assert.deepEqual(image(second), committed);
    assert.equal(second.isTransaction, false);
  } finally {
    stage.close();
    second.close();
  }
});

for (const providerId of ['native', 'z-other'])
  for (const locked of [false, true])
    test(`same-fingerprint ${providerId} legacy activation ${locked ? 'between precheck and lock' : 'after seal'} refuses stale Native patch after reopen`, async (t) => {
      const c = await preparedEmpty(t);
      const second = new DatabaseSync(c.path);
      const snapshot = { ...c.expected.snapshot, id: 'snap-legacy-race', providerId };
      const legacy = prepareLegacyPatch(c, second, snapshot);
      const exec = c.db.exec.bind(c.db);
      let committed;
      let competitorCommits = 0;
      const activateCompetitor = () => {
        new storage.RepositoryCanonicalFactStore(second).applyAnalysisPatch(legacy, {
          ...c.expected,
          snapshot,
        });
        competitorCommits += 1;
        committed = image(second);
      };
      try {
        if (locked)
          c.db.exec = (sql) => {
            if (sql === 'BEGIN IMMEDIATE') activateCompetitor();
            return exec(sql);
          };
        else activateCompetitor();
        assert.throws(
          () => c.store.applyNativeAnalysisPatch(c.stage, c.expected, c.token),
          /token|baseline/i,
        );
        assert.equal(competitorCommits, 1);
        assert.equal(c.db.isTransaction, false);
        assert.deepEqual(image(c.db), committed);
        assert.equal(second.prepare('SELECT count(*) AS n FROM native_analysis_state').get().n, 0);
        assert.equal(second.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 2);
        assert.equal(
          second.prepare('SELECT indexed_content_fingerprint FROM repository_state').get()
            .indexed_content_fingerprint,
          'base',
        );
      } finally {
        c.db.exec = exec;
        legacy.close();
        second.close();
      }
      const db = c.reopen();
      try {
        assert.deepEqual(image(db), committed);
      } finally {
        db.close();
      }
    });

test('other Provider dangling candidate introduced between precheck and lock refuses Native deletion after reopen', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'codeatlas-refresh-locked-other-'));
  const path = join(dir, 'repository.sqlite');
  const c = await emptyNativePatch(t, false, false, ['f-0', 'f-1'], path, 'source-less');
  t.after(() => rm(dir, { recursive: true, force: true }));
  c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
  c.stage.sealNativePatchState(c.expected, c.token, validateNativeRefreshOverlay);
  const before = image(c.db);
  const second = new DatabaseSync(path);
  const exec = c.db.exec.bind(c.db);
  let drifted;
  let driftCount = 0;
  c.db.exec = (sql) => {
    if (sql === 'BEGIN IMMEDIATE') {
      // Test-only corruption of existing other-Provider support, not publication.
      second
        .prepare('UPDATE active_support_candidates SET candidate_json=? WHERE evidence_id=?')
        .run(
          JSON.stringify({
            ...c.otherSupport.canonical,
            sourceRange: {
              sourceFileId: 'f-0',
              startLine: 0,
              startColumn: 0,
              endLine: 0,
              endColumn: 1,
            },
          }),
          c.otherSupport.evidence.id,
        );
      drifted = image(second);
      driftCount += 1;
    }
    return exec(sql);
  };
  try {
    assert.throws(
      () =>
        new storage.RepositoryCanonicalFactStore(c.db).applyNativeAnalysisPatch(
          c.stage,
          {
            repositoryId: 'r',
            baseRevisionId: 'rev',
            baseContentFingerprint: 'base',
            targetRevisionId: 'rev',
            targetContentFingerprint: 'target',
            snapshot: c.snapshot,
          },
          c.token,
        ),
      (error) => error.code === 'FULL_ANALYSIS_REQUIRED',
    );
    assert.equal(driftCount, 1);
    assert.equal(c.db.isTransaction, false);
    assert.notDeepEqual(drifted.active_support_candidates, before.active_support_candidates);
    for (const table of tables.filter((table) => table !== 'active_support_candidates'))
      assert.deepEqual(drifted[table], before[table]);
    assert.deepEqual(image(c.db), drifted);
  } finally {
    c.db.exec = exec;
    second.close();
    c.stage.close();
    c.db.close();
  }
  const db = new DatabaseSync(path);
  try {
    assert.deepEqual(image(db), drifted);
  } finally {
    db.close();
  }
});

for (const locked of [false, true])
  test(`complete source classification drift ${locked ? 'under lock' : 'after seal'} refuses activation`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'codeatlas-refresh-race-'));
    const path = join(dir, 'repository.sqlite');
    const c = await emptyNativePatch(t, false, false, [], path);
    t.after(() => rm(dir, { recursive: true, force: true }));
    c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
    c.stage.sealNativePatchState(c.expected, c.token, validateNativeRefreshOverlay);
    const before = image(c.db),
      second = new DatabaseSync(path);
    const mutate = () =>
      second.prepare("UPDATE source_files SET sensitivity='SENSITIVE' WHERE id='f-0'").run();
    const exec = c.db.exec.bind(c.db);
    if (locked)
      c.db.exec = (sql) => {
        if (sql === 'BEGIN IMMEDIATE') mutate();
        return exec(sql);
      };
    else mutate();
    try {
      assert.throws(
        () =>
          new storage.RepositoryCanonicalFactStore(c.db).applyNativeAnalysisPatch(
            c.stage,
            {
              repositoryId: 'r',
              baseRevisionId: 'rev',
              baseContentFingerprint: 'base',
              targetRevisionId: 'rev',
              targetContentFingerprint: 'target',
              snapshot: c.snapshot,
            },
            c.token,
          ),
        /inventory/i,
      );
      assert.equal(c.db.isTransaction, false);
      assert.deepEqual(image(second), before);
    } finally {
      second.close();
      c.db.exec = exec;
    }
  });

test('failure after actual Native support retirement preserves the exact reopened image', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'codeatlas-refresh-retire-'));
  const path = join(dir, 'repository.sqlite');
  const c = await emptyNativePatch(t, false, false, ['f-0'], path);
  t.after(() => rm(dir, { recursive: true, force: true }));
  c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
  c.stage.sealNativePatchState(c.expected, c.token, validateNativeRefreshOverlay);
  const before = image(c.db);
  c.db.exec(
    "CREATE TRIGGER retire_failure AFTER UPDATE ON evidence WHEN NEW.status='INVALIDATED' BEGIN SELECT RAISE(ABORT, 'injected retirement failure'); END",
  );
  assert.throws(
    () =>
      new storage.RepositoryCanonicalFactStore(c.db).applyNativeAnalysisPatch(
        c.stage,
        {
          repositoryId: 'r',
          baseRevisionId: 'rev',
          baseContentFingerprint: 'base',
          targetRevisionId: 'rev',
          targetContentFingerprint: 'target',
          snapshot: c.snapshot,
        },
        c.token,
      ),
    /injected retirement failure/,
  );
  c.stage.close();
  c.db.close();
  const reopened = new DatabaseSync(path);
  try {
    assert.deepEqual(image(reopened), before);
  } finally {
    reopened.close();
  }
});
