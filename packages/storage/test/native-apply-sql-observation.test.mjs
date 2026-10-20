import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { emptyNativePatch } from './helpers/native-refresh-patch-fixture.mjs';
import { baseCase } from '../../providers/test/helpers/native-full-v3-corpus.mjs';
import {
  captureNativeActivationToken,
  readNativePatchActiveSupports,
  RepositoryCanonicalFactStore,
  RepositoryPatchStage,
} from '../dist/index.js';
import { validateNativeRefreshOverlay } from '../../providers/dist/index.js';

async function stageAccountingApi() {
  const module = await api();
  assert.equal(
    typeof module.observeNativeStageAccounting,
    'function',
    'Stage accounting owner missing',
  );
  return module.observeNativeStageAccounting;
}

test('D5 enclosing raw owners preserve same-point ancestors and parent restoration without summing', async () => {
  const {
    observeNativeStageAccounting,
    nativeStageAccountingCheckpoint: point,
    observeNativeApplySql,
    withNativeApplySqlFields,
  } = await api();
  const records = [];
  const stage = {};
  const capture = await observeNativeStageAccounting(
    () => {
      point(stage, 7, 14);
      observeNativeApplySql(
        () => {},
        () =>
          withNativeApplySqlFields('outer', ['é'], () => {
            observeNativeApplySql(
              () => {},
              () =>
                withNativeApplySqlFields('middle', ['猫'], () => {
                  observeNativeApplySql(
                    () => {},
                    () => withNativeApplySqlFields('inner', ['x'], () => point(stage, 7, 14)),
                  );
                  point(stage, 7, 14);
                }),
            );
            point(stage, 7, 14);
          }),
      );
      point(stage, 7, 14);
      return 42;
    },
    (record) => records.push(record),
  );
  assert.equal(capture.value, 42);
  assert.equal(capture.captureFailed, false);
  assert.equal(records[0].enclosingRawSql, null);
  assert.equal(records[4].enclosingRawSql, null);
  assert.deepEqual(
    records.slice(1, 4).map((r) => r.enclosingRawSql.map((o) => o.retainedSqlBytes)),
    [[3, 2], [2], []],
  );
  assert.deepEqual(
    records.slice(1, 4).map((r) => r.rawSql.retainedSqlBytes),
    [1, 3, 2],
  );
  assert.equal(records[1].enclosingRawSql[0].ownerId, records[2].rawSql.ownerId);
  assert.equal(records[1].enclosingRawSql[1].ownerId, records[3].rawSql.ownerId);
  assert.equal(
    new Set([records[1].rawSql.ownerId, ...records[1].enclosingRawSql.map((o) => o.ownerId)]).size,
    3,
  );
  for (const record of records.slice(1, 4)) {
    assert.equal(record.retainedSqlBytes, 7);
    assert.equal(Object.isFrozen(record.enclosingRawSql), true);
    for (const owner of record.enclosingRawSql) {
      assert.equal(owner.scope, 'ENCLOSING_RAW_SQL_OWNER_CHECKPOINT_ONLY');
      assert.equal(Object.isFrozen(owner), true);
      assert.equal(owner.retainedSqlStringChargeBytes, 2 * owner.retainedSqlBytes);
    }
  }
});

test('D5 enclosing raw owners refuse failed ancestors without replacing original falsy throws', async () => {
  const {
    observeNativeStageAccounting,
    nativeStageAccountingCheckpoint: point,
    observeNativeApplySql,
    withNativeApplySqlFields,
  } = await api();
  for (const failure of [0, null, undefined, '']) {
    const capture = await observeNativeStageAccounting(
      () => {
        const outer = observeNativeApplySql(
          () => {
            throw failure;
          },
          () =>
            withNativeApplySqlFields('outer', ['é'], () => {
              const inner = observeNativeApplySql(
                () => {},
                () => point({}, 1, 2),
              );
              assert.equal(inner.threw, false);
              throw failure;
            }),
        );
        assert.equal(outer.threw, true);
        throw outer.error;
      },
      () => assert.fail('A failed ancestor must not deliver evidence'),
    );
    assert.equal(capture.threw, true);
    assert.equal(capture.error, failure);
    assert.equal(capture.captureFailed, true);
    assert.equal(capture.captureFailure, failure);
  }
});

test('D5 same-point raw distinguishes absent, zero and nested current owners without summing', async () => {
  const {
    observeNativeStageAccounting,
    nativeStageAccountingCheckpoint: point,
    observeNativeApplySql,
    withNativeApplySqlFields,
  } = await api();
  const records = [];
  const stage = {};
  const capture = await observeNativeStageAccounting(
    () => {
      point(stage, 7, 14);
      observeNativeApplySql(
        () => {},
        () => {
          point(stage, 7, 14);
          withNativeApplySqlFields('outer', ['é'], () => {
            point(stage, 7, 14);
            observeNativeApplySql(
              () => {},
              () => {
                withNativeApplySqlFields('inner', ['猫'], () => point(stage, 7, 14));
              },
            );
            point(stage, 7, 14);
          });
          point(stage, 7, 14);
        },
      );
      point(stage, 7, 14);
      return 42;
    },
    (record) => records.push(record),
  );
  assert.equal(capture.value, 42);
  assert.equal(capture.captureFailed, false);
  assert.deepEqual(
    records.map((record) => record.rawSql),
    [
      null,
      {
        scope: 'CURRENT_RAW_SQL_OWNER_CHECKPOINT_ONLY',
        ownerId: 1,
        retainedSqlBytes: 0,
        retainedSqlStringChargeBytes: 0,
      },
      {
        scope: 'CURRENT_RAW_SQL_OWNER_CHECKPOINT_ONLY',
        ownerId: 1,
        retainedSqlBytes: 2,
        retainedSqlStringChargeBytes: 4,
      },
      {
        scope: 'CURRENT_RAW_SQL_OWNER_CHECKPOINT_ONLY',
        ownerId: 2,
        retainedSqlBytes: 3,
        retainedSqlStringChargeBytes: 6,
      },
      {
        scope: 'CURRENT_RAW_SQL_OWNER_CHECKPOINT_ONLY',
        ownerId: 1,
        retainedSqlBytes: 2,
        retainedSqlStringChargeBytes: 4,
      },
      {
        scope: 'CURRENT_RAW_SQL_OWNER_CHECKPOINT_ONLY',
        ownerId: 1,
        retainedSqlBytes: 0,
        retainedSqlStringChargeBytes: 0,
      },
      null,
    ],
  );
  assert.ok(records.every((record) => record.retainedSqlBytes === 7));
  assert.ok(
    records.filter((record) => record.rawSql).every((record) => Object.isFrozen(record.rawSql)),
  );
});

test('D5 same-point raw failure refuses evidence and preserves falsy operation errors', async () => {
  const {
    observeNativeStageAccounting,
    nativeStageAccountingCheckpoint: point,
    observeNativeApplySql,
    withNativeApplySqlFields,
  } = await api();
  for (const original of [undefined, null, false, 0, '', new Error('original')]) {
    const records = [];
    let raw;
    const capture = await observeNativeStageAccounting(
      () => {
        raw = observeNativeApplySql(
          () => {
            throw 0;
          },
          () => {
            withNativeApplySqlFields('failed', ['é'], () => point({}, 0, 0));
          },
        );
        throw original;
      },
      (record) => records.push(record),
    );
    assert.equal(raw.captureFailed, true);
    assert.equal(raw.captureFailure, 0);
    assert.equal(capture.captureFailed, true);
    assert.equal(capture.captureFailure, 0);
    assert.equal(capture.threw, true);
    assert.equal(capture.error, original);
    assert.deepEqual(records, []);
  }
});

test('D5 same-point raw owner IDs are local to nested Stage captures', async () => {
  const {
    observeNativeStageAccounting,
    nativeStageAccountingCheckpoint: point,
    observeNativeApplySql,
  } = await api();
  const outer = [],
    inner = [];
  await observeNativeStageAccounting(
    async () => {
      observeNativeApplySql(
        () => {},
        () => point({}, 0, 0),
      );
      await observeNativeStageAccounting(
        () => {
          observeNativeApplySql(
            () => {},
            () => point({}, 0, 0),
          );
        },
        (record) => inner.push(record),
      );
      observeNativeApplySql(
        () => {},
        () => point({}, 0, 0),
      );
    },
    (record) => outer.push(record),
  );
  assert.deepEqual(
    outer.map((record) => record.rawSql.ownerId),
    [1, 2],
  );
  assert.deepEqual(
    inner.map((record) => record.rawSql.ownerId),
    [1],
  );
});

function accountingStage(t) {
  const db = new DatabaseSync(':memory:');
  const stage = new RepositoryPatchStage(db, () => assert.fail('No merge in accounting fixture'), {
    maxSerializedBytes: 1_000_000,
    memoryBudgetBytes: 16 * 1024 * 1024,
  });
  t.after(() => {
    stage.close();
    db.close();
  });
  return { db, stage };
}

test('D5 budget components distinguish pending insert charge from admitted SQL', async (t) => {
  const observe = await stageAccountingApi();
  const { db, stage } = accountingStage(t);
  const diagnostic = { code: 'N', severity: 'INFO', message: 'é猫', sourceRange: null };
  const bytes = 10 + Buffer.byteLength(JSON.stringify(diagnostic));
  const records = [];
  const capture = await observe(
    async () => {
      await stage.acceptNativeEvent({ type: 'DIAGNOSTIC', payload: diagnostic });
      assert.equal(
        db
          .prepare(
            'SELECT length(CAST(kind AS BLOB))+length(CAST(payload AS BLOB)) AS n FROM temp.patch_event',
          )
          .get().n,
        bytes,
      );
      stage.preflightNativeRows();
    },
    (record) => records.push(record),
  );
  assert.equal(capture.captureFailed, false);
  assert.deepEqual(
    records.map((record) => record.budgetComponents),
    [
      {
        scope: 'STAGE_BUDGET_COMPONENTS_ONLY',
        source: 'ROW_INSERT_ADMISSION',
        stageSqlBytes: 0,
        additionalSqlAllowanceBytes: 0,
        otherBudgetChargeBytes: 2 * bytes,
        resultCopyChargeBytes: 0,
      },
      {
        scope: 'STAGE_BUDGET_COMPONENTS_ONLY',
        source: 'ROW_PREFLIGHT',
        stageSqlBytes: bytes,
        additionalSqlAllowanceBytes: 0,
        otherBudgetChargeBytes: 0,
        resultCopyChargeBytes: 0,
      },
    ],
  );
  assert.ok(records.every((record) => Object.isFrozen(record.budgetComponents)));
});

test('D5 budget components reject incoherent attribution without replacing falsy errors', async () => {
  const { observeNativeStageAccounting: observe, nativeStageAccountingCheckpoint: emit } =
    await api();
  const valid = {
    scope: 'STAGE_BUDGET_COMPONENTS_ONLY',
    source: 'TOKEN_ADMISSION',
    stageSqlBytes: 3,
    additionalSqlAllowanceBytes: 2,
    otherBudgetChargeBytes: 6,
    resultCopyChargeBytes: 0,
  };
  for (const broken of [
    { ...valid, source: 'UNKNOWN' },
    { ...valid, source: 'ROW_PREFLIGHT' },
    {
      ...valid,
      source: 'SEAL_RESULT_ADMISSION',
      otherBudgetChargeBytes: 4,
      resultCopyChargeBytes: 2,
    },
    { ...valid, stageSqlBytes: 4 },
    { ...valid, otherBudgetChargeBytes: 5 },
    { ...valid, resultCopyChargeBytes: NaN },
    { ...valid, additionalSqlAllowanceBytes: -1 },
    { ...valid, stageSqlBytes: Number.MAX_SAFE_INTEGER },
  ]) {
    const records = [];
    const capture = await observe(
      () => {
        emit({}, 5, 16, broken);
        throw 0;
      },
      (record) => records.push(record),
    );
    assert.equal(capture.captureFailed, true);
    assert.equal(capture.threw, true);
    assert.equal(capture.error, 0);
    assert.deepEqual(records, []);
  }
  const records = [];
  const capture = await observe(
    () => {
      emit({}, 5, 16, valid);
      return false;
    },
    (record) => records.push(record),
  );
  assert.equal(capture.value, false);
  assert.equal(capture.captureFailed, false);
  assert.deepEqual(records[0].budgetComponents, valid);
});

test('D5 budget components leave an unclassified private checkpoint unavailable', async () => {
  const { observeNativeStageAccounting: observe, nativeStageAccountingCheckpoint: emit } =
    await api();
  const records = [];
  await observe(
    () => emit({}, 0, 0),
    (record) => records.push(record),
  );
  assert.equal(records[0].budgetComponents, null);
});

test('D5 budget components identify real token admission and three seal-result representations', async (t) => {
  const { observeNativeStageAccounting: observe, observeNativeApplySql } = await api();
  const c = await emptyNativePatch(t, true);
  const header = c.db
    .prepare(
      'SELECT repository_id,provider_id,provider_snapshot_id,revision_id,content_fingerprint,header_json FROM native_analysis_state',
    )
    .all();
  const pointer = c.db
    .prepare('SELECT indexed_revision_id,indexed_content_fingerprint FROM repository_state')
    .all();
  const tokenBytes = [...header, ...pointer]
    .flatMap((row) => Object.values(row))
    .reduce((n, value) => n + (typeof value === 'string' ? Buffer.byteLength(value) : 0), 0);
  const records = [];
  const capture = await observe(
    () =>
      observeNativeApplySql(
        () => {},
        () => {
          c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
          c.stage.sealNativePatchState(c.expected, c.token, validateNativeRefreshOverlay);
          c.stage.assertNativeApplicable(c.db, { ...c.expected, snapshot: c.snapshot }, c.token);
        },
      ),
    (record) => records.push(record),
  );
  assert.equal(capture.threw, false);
  assert.equal(capture.captureFailed, false);
  assert.equal(capture.value.threw, false);
  assert.equal(capture.value.captureFailed, false);
  const token = records.find((record) => record.budgetComponents.source === 'TOKEN_ADMISSION');
  assert.equal(token.budgetComponents.additionalSqlAllowanceBytes, tokenBytes);
  assert.equal(token.rawSql.retainedSqlBytes, 0, 'Token budget precedes token TEXT ownership');
  const result = records.find(
    (record) => record.budgetComponents.source === 'SEAL_RESULT_ADMISSION',
  );
  assert.equal(
    result.budgetComponents.resultCopyChargeBytes,
    3 * Buffer.byteLength(JSON.stringify(c.stage.readSealedNativeState())),
  );
  assert.ok(records.some((record) => record.budgetComponents.source === 'SEAL_ACTIVE_ADMISSION'));
  assert.ok(records.some((record) => record.budgetComponents.source === 'APPLY_ACTIVE_ADMISSION'));
  for (const record of records) {
    const parts = record.budgetComponents;
    assert.equal(record.retainedSqlBytes, parts.stageSqlBytes + parts.additionalSqlAllowanceBytes);
    assert.equal(
      record.retainedStringChargeBytes,
      2 * record.retainedSqlBytes + parts.otherBudgetChargeBytes + parts.resultCopyChargeBytes,
    );
  }
});

test('D5 Stage accounting observes actual insert and numeric preflight, not close-zero', async (t) => {
  const observe = await stageAccountingApi();
  const { db, stage } = accountingStage(t);
  const diagnostic = { code: 'N', severity: 'INFO', message: 'é猫', sourceRange: null };
  const inputBytes = 10 + Buffer.byteLength(JSON.stringify(diagnostic));
  const records = [];
  const capture = await observe(
    async () => {
      await stage.acceptNativeEvent({ type: 'DIAGNOSTIC', payload: diagnostic });
      const oracle = db
        .prepare(
          'SELECT length(CAST(kind AS BLOB))+length(CAST(payload AS BLOB)) AS n FROM temp.patch_event',
        )
        .get().n;
      assert.equal(oracle, inputBytes);
      stage.preflightNativeRows();
      const count = records.length;
      stage.close();
      assert.equal(records.length, count, 'Close must not invent a release checkpoint');
      return 'original result';
    },
    (record) => records.push(record),
  );
  assert.equal(capture.threw, false);
  assert.equal(capture.captureFailed, false);
  assert.equal(capture.value, 'original result');
  assert.deepEqual(records, [
    {
      scope: 'STAGE_ACCOUNTING_CHECKPOINT_ONLY',
      stageId: 1,
      retainedSqlBytes: 0,
      retainedStringChargeBytes: 2 * inputBytes,
      rawSql: null,
      enclosingRawSql: null,
      budgetComponents: {
        scope: 'STAGE_BUDGET_COMPONENTS_ONLY',
        source: 'ROW_INSERT_ADMISSION',
        stageSqlBytes: 0,
        additionalSqlAllowanceBytes: 0,
        otherBudgetChargeBytes: 2 * inputBytes,
        resultCopyChargeBytes: 0,
      },
    },
    {
      scope: 'STAGE_ACCOUNTING_CHECKPOINT_ONLY',
      stageId: 1,
      retainedSqlBytes: inputBytes,
      retainedStringChargeBytes: 2 * inputBytes,
      rawSql: null,
      enclosingRawSql: null,
      budgetComponents: {
        scope: 'STAGE_BUDGET_COMPONENTS_ONLY',
        source: 'ROW_PREFLIGHT',
        stageSqlBytes: inputBytes,
        additionalSqlAllowanceBytes: 0,
        otherBudgetChargeBytes: 0,
        resultCopyChargeBytes: 0,
      },
    },
  ]);
  assert.ok(records.every(Object.isFrozen));
  assert.equal(stage.readNativeRetentionMeasurement().retainedSqlBytes, inputBytes);
});

test('D5 Stage accounting keeps decreasing checkpoints separate from historical maxima', async (t) => {
  const observe = await stageAccountingApi();
  const { db, stage } = accountingStage(t);
  await stage.acceptNativeEvent({
    type: 'DIAGNOSTIC',
    payload: { code: 'N', severity: 'INFO', message: 'é猫', sourceRange: null },
  });
  const bytes = db
    .prepare(
      'SELECT length(CAST(kind AS BLOB))+length(CAST(payload AS BLOB)) AS n FROM temp.patch_event',
    )
    .get().n;
  const records = [];
  const capture = await observe(
    () => {
      stage.preflightNativeRows();
      db.exec('DELETE FROM temp.patch_event');
      stage.preflightNativeRows();
    },
    (record) => records.push(record),
  );
  assert.equal(capture.threw, false);
  assert.deepEqual(
    records.map((r) => r.retainedSqlBytes),
    [bytes, 0],
  );
  assert.equal(stage.readNativeRetentionMeasurement().retainedSqlBytes, bytes);
});

test('D5 Stage accounting isolates main and competitor instances and nested owners', async (t) => {
  const observe = await stageAccountingApi();
  const main = accountingStage(t),
    competitor = accountingStage(t);
  const outer = [],
    inner = [];
  const capture = await observe(
    async () => {
      main.stage.preflightNativeRows();
      const nested = await observe(
        () => competitor.stage.preflightNativeRows(),
        (r) => inner.push(r),
      );
      assert.equal(nested.threw, false);
      competitor.stage.preflightNativeRows();
      main.stage.preflightNativeRows();
    },
    (r) => outer.push(r),
  );
  assert.equal(capture.threw, false);
  assert.deepEqual(
    outer.map((r) => r.stageId),
    [1, 2, 1],
  );
  assert.deepEqual(
    inner.map((r) => r.stageId),
    [1],
  );
});

test('D5 Stage accounting isolates concurrent owners across awaited work', async (t) => {
  const observe = await stageAccountingApi();
  const a = accountingStage(t),
    b = accountingStage(t);
  const left = [],
    right = [];
  const captures = await Promise.all([
    observe(
      async () => {
        a.stage.preflightNativeRows();
        await new Promise((resolve) => setImmediate(resolve));
        a.stage.preflightNativeRows();
      },
      (r) => left.push(r),
    ),
    observe(
      async () => {
        b.stage.preflightNativeRows();
        await Promise.resolve();
        b.stage.preflightNativeRows();
      },
      (r) => right.push(r),
    ),
  ]);
  assert.ok(captures.every((c) => !c.threw && !c.captureFailed));
  assert.deepEqual(
    left.map((r) => r.stageId),
    [1, 1],
  );
  assert.deepEqual(
    right.map((r) => r.stageId),
    [1, 1],
  );
});

test('D5 Stage accounting capture failure preserves returns and original falsy throws', async (t) => {
  const observe = await stageAccountingApi();
  const { stage } = accountingStage(t);
  for (const original of [undefined, null, false, 0, '', new Error('original')]) {
    let calls = 0;
    const capture = await observe(
      () => {
        stage.preflightNativeRows();
        stage.preflightNativeRows();
        throw original;
      },
      () => {
        calls++;
        throw 0;
      },
    );
    assert.equal(capture.threw, true);
    assert.strictEqual(capture.error, original);
    assert.equal(capture.captureFailed, true);
    assert.strictEqual(capture.captureFailure, 0);
    assert.equal(calls, 1);
  }
  const capture = await observe(
    () => stage.preflightNativeRows(),
    () => {
      throw '';
    },
  );
  assert.equal(capture.threw, false);
  assert.deepEqual(capture.value, { retainedSqlBytes: 0 });
  assert.strictEqual(capture.captureFailure, '');
});

test('D5 Stage accounting preserves actual seal validation rollback on capture failure', async (t) => {
  const observe = await stageAccountingApi();
  const c = await emptyNativePatch(t, true);
  c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
  const before = c.db.prepare('SELECT * FROM repository_state').all();
  const capture = await observe(
    () =>
      c.stage.sealNativePatchState(c.expected, c.token, () => {
        throw 0;
      }),
    () => {
      throw '';
    },
  );
  assert.equal(capture.threw, true);
  assert.strictEqual(capture.error, 0);
  assert.equal(capture.captureFailed, true);
  assert.strictEqual(capture.captureFailure, '');
  assert.equal(c.db.isTransaction, false);
  assert.deepEqual(c.db.prepare('SELECT * FROM repository_state').all(), before);
  assert.throws(() => c.stage.readSealedNativeState(), /not been sealed/);
});

test('D5 Stage accounting adds no queries to original numeric preflight', async (t) => {
  const observe = await stageAccountingApi();
  const { db, stage } = accountingStage(t);
  const prepare = db.prepare;
  let queries = [];
  db.prepare = function (sql) {
    queries.push(sql);
    return prepare.call(this, sql);
  };
  try {
    stage.preflightNativeRows();
    const plain = queries;
    queries = [];
    const capture = await observe(
      () => stage.preflightNativeRows(),
      () => {},
    );
    assert.equal(capture.threw, false);
    assert.deepEqual(queries, plain);
    assert.equal(queries.length, 4);
  } finally {
    db.prepare = prepare;
  }
});

test('D5 Stage accounting ignores detached descendants after owner settlement', async (t) => {
  const observe = await stageAccountingApi();
  const { stage } = accountingStage(t);
  const records = [];
  let resume, detached;
  const capture = await observe(
    () => {
      stage.preflightNativeRows();
      detached = new Promise((resolve) => {
        resume = resolve;
      }).then(() => stage.preflightNativeRows());
    },
    (r) => records.push(r),
  );
  assert.equal(capture.threw, false);
  resume();
  await detached;
  stage.preflightNativeRows();
  assert.equal(records.length, 1);
});

test('D5 Stage accounting invalid numeric evidence refuses capture without changing the operation', async () => {
  const observe = await stageAccountingApi();
  const { nativeStageAccountingCheckpoint } = await api();
  for (const [sql, charge] of [
    [-1, 0],
    [0, -1],
    [1, 1],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    [NaN, 0],
  ]) {
    const records = [];
    const stage = {};
    const capture = await observe(
      () => {
        nativeStageAccountingCheckpoint(stage, sql, charge);
        nativeStageAccountingCheckpoint(stage, 0, 0);
        return 'unchanged';
      },
      (r) => records.push(r),
    );
    assert.equal(capture.threw, false);
    assert.equal(capture.value, 'unchanged');
    assert.equal(capture.captureFailed, true);
    assert.match(capture.captureFailure.message, /Unsafe Stage accounting/);
    assert.deepEqual(records, []);
  }
});

async function api() {
  const module = await import('../dist/analysis/native-apply-sql-observation.js').catch((error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  });
  assert.equal(typeof module.observeNativeApplySql, 'function', 'Apply SQL owner missing');
  assert.equal(typeof module.withNativeApplySqlFields, 'function', 'Apply SQL frame missing');
  return module;
}

for (const mode of ['SUCCESS', 'INVALID', 'CAPTURE_FAILURE'])
  test(`D5 completion diagnostic ${mode} charges actual UTF-8 SQL payload`, async (t) => {
    const { observeNativeApplySql } = await api();
    const c = await emptyNativePatch(t, true);
    const diagnostic = { code: 'N', severity: 'INFO', message: 'é猫', sourceRange: null };
    await c.stage.acceptNativeEvent({ type: 'DIAGNOSTIC', payload: diagnostic });
    if (mode === 'INVALID')
      c.db.prepare("UPDATE temp.patch_event SET payload='{' WHERE kind='DIAGNOSTIC'").run();
    const bytes = c.db
      .prepare(
        "SELECT length(CAST(payload AS BLOB)) AS n FROM temp.patch_event WHERE kind='DIAGNOSTIC'",
      )
      .get().n;
    const records = [];
    const capture = observeNativeApplySql(
      (r) => {
        records.push(r);
        if (mode === 'CAPTURE_FAILURE') throw '';
      },
      () => [...c.stage.readDiagnostics()],
    );
    assert.equal(capture.threw, mode === 'INVALID');
    assert.equal(capture.captureFailed, mode === 'CAPTURE_FAILURE');
    if (mode === 'INVALID') assert.ok(capture.error instanceof SyntaxError);
    else assert.deepEqual(capture.value, [diagnostic]);
    if (mode === 'CAPTURE_FAILURE') assert.strictEqual(capture.captureFailure, '');
    else
      assert.deepEqual(
        records.map((r) => [r.phase, r.boundary, r.retainedSqlBytes]),
        [
          ['STAGE_EVENT_ROW', 'ENTER', bytes],
          ['STAGE_EVENT_ROW', 'EXIT', 0],
        ],
      );
    for (const r of records) assert.equal(r.retainedSqlStringChargeBytes, 2 * r.retainedSqlBytes);
    assert.equal(c.db.isTransaction, false);
  });

for (const kind of ['EVENT', 'REMOVAL'])
  for (const mode of ['SUCCESS', 'INVALID', 'CAPTURE_FAILURE'])
    test(`D5 completion ${kind} ${mode} owns each actual row through its synchronous check`, async (t) => {
      const { observeNativeApplySql } = await api();
      const c =
        kind === 'EVENT'
          ? await emptyNativePatch(t, true)
          : await emptyNativePatch(t, true, false, ['f-0', 'f-1']);
      if (kind === 'EVENT') {
        await c.stage.acceptNativeEvent({
          type: 'SOURCE_FILE',
          payload: c.context.targetSourceFiles[0],
        });
        c.terminal.payload.counts.sourceFiles = 1;
        if (mode === 'INVALID')
          c.db.prepare("UPDATE temp.patch_event SET payload='{}' WHERE kind='SOURCE_FILE'").run();
      } else if (mode === 'INVALID')
        c.db
          .prepare("UPDATE temp.patch_event SET provider_id='unknown' WHERE kind='REMOVE_NODE'")
          .run();
      const selected =
        kind === 'EVENT' ? ['kind', 'payload'] : ['fact_type', 'provider_id', 'provider_fact_id'];
      const predicate =
        kind === 'EVENT'
          ? "kind IN ('SOURCE_FILE','UPSERT_NODE','UPSERT_EDGE')"
          : "kind IN ('REMOVE_NODE','REMOVE_EDGE')";
      const rows = c.db
        .prepare(
          `SELECT ${selected.map((f) => `length(CAST(${f} AS BLOB))`).join('+')} AS bytes FROM temp.patch_event WHERE ${predicate}`,
        )
        .all();
      assert.ok(rows.length > 0);
      const before = c.db.prepare('SELECT * FROM repository_state').all();
      const records = [];
      const phase = `STAGE_COMPLETION_${kind}_ROW`;
      const result = observeNativeApplySql(
        (r) => {
          records.push(r);
          if (mode === 'CAPTURE_FAILURE') throw 0;
        },
        () => c.stage.confirmNativeSucceeded(c.terminal, c.snapshot),
      );
      assert.equal(result.threw, mode === 'INVALID', String(result.error?.stack ?? result.error));
      assert.equal(result.captureFailed, mode === 'CAPTURE_FAILURE');
      if (mode === 'CAPTURE_FAILURE') {
        assert.strictEqual(result.captureFailure, 0);
        assert.equal(records.length, 1);
      } else {
        const read = mode === 'INVALID' ? rows.slice(0, 1) : rows;
        assert.deepEqual(
          records.map((r) => [r.phase, r.boundary, r.retainedSqlBytes]),
          read.flatMap((row) => [
            [phase, 'ENTER', row.bytes],
            [phase, 'EXIT', 0],
          ]),
        );
        for (const r of records)
          assert.equal(r.retainedSqlStringChargeBytes, 2 * r.retainedSqlBytes);
      }
      if (mode === 'INVALID')
        assert.match(result.error.message, kind === 'EVENT' ? /context differs/ : /exactly one/);
      assert.equal(c.db.isTransaction, false);
      assert.deepEqual(c.db.prepare('SELECT * FROM repository_state').all(), before);
    });

test('D5 Stage summary scope retains distinct equal fields and restores nested ownership', async () => {
  const {
    observeNativeApplySql,
    withNativeApplySqlSummaries,
    yieldNativeApplySqlFields,
    withNativeApplySqlFields,
  } = await api();
  assert.equal(typeof withNativeApplySqlSummaries, 'function', 'Summary scope missing');
  const records = [];
  const result = observeNativeApplySql(
    (r) => records.push(r),
    () =>
      withNativeApplySqlSummaries(() => {
        const rows = yieldNativeApplySqlFields('STAGE_SUMMARY_ROW', ['é', 'é'], () => 42);
        assert.equal(rows.next().value, 42);
        rows.return();
        const inner = observeNativeApplySql(
          () => {},
          () =>
            withNativeApplySqlSummaries(() => {
              const nested = yieldNativeApplySqlFields('STAGE_SUMMARY_ROW', ['猫'], () => 7);
              nested.next();
              nested.return();
            }),
        );
        assert.equal(inner.captureFailed, false);
        withNativeApplySqlSummaries(() => {
          const nested = yieldNativeApplySqlFields('STAGE_SUMMARY_ROW', ['猫'], () => 7);
          nested.next();
          nested.return();
        });
        withNativeApplySqlFields('summary-consumer', ['é'], () => {});
      }),
  );
  assert.equal(result.captureFailed, false);
  assert.deepEqual(
    records.map((r) => r.retainedSqlBytes),
    [4, 7, 4, 6, 4, 0],
  );
  assert.equal(records.at(-1).phase, 'STORE_STAGE_SUMMARY_SCOPE');
});

test('D5 Stage summary observation is silent without an owner and preserves falsy errors on capture failure', async () => {
  const { observeNativeApplySql, withNativeApplySqlSummaries, yieldNativeApplySqlFields } =
    await api();
  const fields = {
    *[Symbol.iterator]() {
      throw new Error('Unobserved fields enumerated');
    },
  };
  withNativeApplySqlSummaries(() => {
    const iterator = yieldNativeApplySqlFields('STAGE_SUMMARY_ROW', fields, () => 42);
    assert.equal(iterator.next().value, 42);
    iterator.return();
  });
  for (const error of [0, null, undefined, '']) {
    const result = observeNativeApplySql(
      () => {
        throw 'capture';
      },
      () =>
        withNativeApplySqlSummaries(() => {
          const iterator = yieldNativeApplySqlFields('STAGE_SUMMARY_ROW', ['é'], () => 42);
          iterator.next();
          iterator.return();
          throw error;
        }),
    );
    assert.equal(result.threw, true);
    assert.strictEqual(result.error, error);
    assert.equal(result.captureFailed, true);
    assert.strictEqual(result.captureFailure, 'capture');
  }
});

for (const mode of [
  'SUCCESS',
  'EARLY_FAILURE',
  'VALIDATION_FAILURE',
  'RESULT_FAILURE',
  'CAPTURE_FAILURE',
  'CAPTURE_EARLY_FAILURE',
])
  test(`D5 actual Stage summary handoff ${mode} retains previous rows until seal scope settles`, async (t) => {
    const { observeNativeApplySql, withNativeApplySqlFields } = await api();
    const c = await emptyNativePatch(t, true, true);
    c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
    if (mode === 'VALIDATION_FAILURE')
      c.db
        .prepare(
          "UPDATE temp.patch_native_summary SET summary_json='{}' WHERE source_path='src/1.java'",
        )
        .run();
    // Independent SQLite UTF-8 oracle; do not derive expectations from observer helpers.
    const rows = c.db
      .prepare(
        `SELECT
      length(CAST(source_file_id AS BLOB))+length(CAST(source_path AS BLOB))+
      length(CAST(content_fingerprint AS BLOB))+length(CAST(summary_json AS BLOB)) AS bytes
      FROM temp.patch_native_summary ORDER BY source_path`,
      )
      .all();
    assert.equal(rows.length, 2);
    const total = rows[0].bytes + rows[1].bytes;
    const before = c.db.prepare('SELECT * FROM repository_state').all();
    const records = [];
    const result = observeNativeApplySql(
      (r) => {
        records.push(r);
        if (mode.startsWith('CAPTURE') && r.phase === 'STORE_STAGE_SUMMARY_ROW') throw 0;
      },
      () =>
        c.stage.sealNativePatchState(c.expected, c.token, (input) => {
          if (mode === 'EARLY_FAILURE' || mode === 'CAPTURE_EARLY_FAILURE') {
            for (const row of input.files) {
              assert.equal(typeof row.summaryJson, 'string');
              withNativeApplySqlFields('summary-handoff', [], () => {});
              throw undefined;
            }
          }
          const files = input.files;
          function* forwarded() {
            for (const row of files) {
              yield row;
              withNativeApplySqlFields('summary-handoff', [], () => {});
            }
          }
          const state = validateNativeRefreshOverlay({ ...input, files: forwarded() });
          withNativeApplySqlFields('summary-return', [], () => {});
          if (mode === 'RESULT_FAILURE') return { ...state, unexpected: true };
          return state;
        }),
    );
    const failure = [
      'EARLY_FAILURE',
      'VALIDATION_FAILURE',
      'RESULT_FAILURE',
      'CAPTURE_EARLY_FAILURE',
    ].includes(mode);
    assert.equal(result.threw, failure, String(result.error?.stack ?? result.error));
    assert.equal(result.captureFailed, mode.startsWith('CAPTURE'));
    if (mode.startsWith('CAPTURE')) assert.strictEqual(result.captureFailure, 0);
    else {
      const materialized = records.filter(
        (r) =>
          (r.phase === 'STORE_STAGE_SUMMARY_ROW' || r.phase === 'STAGE_SUMMARY_ROW') &&
          r.boundary === 'ENTER',
      );
      assert.deepEqual(
        materialized.map((r) => r.retainedSqlBytes),
        mode === 'EARLY_FAILURE' ? [rows[0].bytes] : [rows[0].bytes, total],
      );
      assert.equal(
        records.find((r) => r.phase === 'summary-handoff')?.retainedSqlBytes,
        rows[0].bytes,
      );
      if (!failure)
        assert.equal(records.find((r) => r.phase === 'summary-return')?.retainedSqlBytes, total);
      assert.equal(
        records.find((r) => r.phase === 'STORE_STAGE_SUMMARY_SCOPE')?.retainedSqlBytes,
        0,
      );
      assert.equal(records.at(-1).retainedSqlBytes, 0);
      for (const r of records) assert.equal(r.retainedSqlStringChargeBytes, 2 * r.retainedSqlBytes);
    }
    if (mode === 'EARLY_FAILURE' || mode === 'CAPTURE_EARLY_FAILURE')
      assert.strictEqual(result.error, undefined);
    if (mode === 'RESULT_FAILURE') assert.match(result.error.message, /differs from stage/);
    assert.equal(c.db.isTransaction, false);
    assert.deepEqual(c.db.prepare('SELECT * FROM repository_state').all(), before);
    if (failure) assert.throws(() => c.stage.readSealedNativeState(), /not been sealed/);
    else assert.equal(c.stage.readSealedNativeState().files.length, 2);
  });

test('D5 active support gauge preserves aliases and nested owner isolation through consumption', async () => {
  const {
    observeNativeApplySql,
    withNativeApplySqlSupports,
    nativeApplySqlSupportsObserver,
    withNativeApplySqlFields,
  } = await api();
  assert.equal(typeof withNativeApplySqlSupports, 'function', 'Support scope missing');
  const records = [];
  let escaped;
  const result = observeNativeApplySql(
    (r) => records.push(r),
    () =>
      withNativeApplySqlSupports(() => {
        escaped = nativeApplySqlSupportsObserver();
        escaped('ACTIVE_SUPPORT_ROW', 10);
        escaped('ACTIVE_SUPPORT_ACCEPTED', 10);
        const nested = observeNativeApplySql(
          () => {},
          () =>
            withNativeApplySqlSupports(() => {
              escaped('ACTIVE_SUPPORT_ROW', 999);
              nativeApplySqlSupportsObserver()('ACTIVE_SUPPORT_ROW', 7);
            }),
        );
        assert.equal(nested.captureFailed, false);
        escaped('ACTIVE_SUPPORT_RETURN', 5);
        withNativeApplySqlFields('consumer', ['猫'], () => {});
        return 42;
      }),
  );
  escaped('ACTIVE_SUPPORT_ROW', 999);
  assert.equal(result.value, 42);
  assert.equal(result.captureFailed, false);
  assert.deepEqual(
    records.map((r) => r.retainedSqlBytes),
    [10, 10, 5, 8, 5, 0],
  );
  for (const error of [0, null, undefined, '']) {
    const failed = observeNativeApplySql(
      () => {},
      () =>
        withNativeApplySqlSupports(() => {
          nativeApplySqlSupportsObserver()('ACTIVE_SUPPORT_ROW', Number.MAX_SAFE_INTEGER);
          throw error;
        }),
    );
    assert.equal(failed.captureFailed, true);
    assert.equal(failed.threw, true);
    assert.strictEqual(failed.error, error);
  }
});

// Independent table-field oracle: retained fields are SQL-origin scalar aliases,
// not candidate JSON, validated runtime_version, canonical keys or parsed Canonical strings.
function activeSupportRows(db) {
  const bytes = (values) =>
    values.reduce((n, v) => n + (typeof v === 'string' ? Buffer.byteLength(v) : 0), 0);
  return db
    .prepare(
      "SELECT * FROM evidence WHERE status='ACTIVE' ORDER BY provider_id,fact_type,provider_fact_id,id",
    )
    .all()
    .map((e) => {
      const binding = db
        .prepare(
          'SELECT provider_snapshot_id,fact_type,provider_id,provider_fact_id,canonical_fact_id FROM provider_fact_bindings WHERE evidence_id=?',
        )
        .get(e.id);
      const link = db
        .prepare('SELECT fact_type,canonical_fact_id FROM fact_evidence WHERE evidence_id=?')
        .get(e.id);
      const snapshot = db
        .prepare(
          'SELECT id,repository_id,provider_id,provider_version,requested_revision_id,requested_revision_fingerprint,outcome FROM provider_snapshots WHERE id=?',
        )
        .get(e.provider_snapshot_id);
      const runtime = db
        .prepare('SELECT runtime_version FROM provider_snapshots WHERE id=?')
        .get(e.provider_snapshot_id);
      const candidate = db
        .prepare(
          'SELECT fact_type,canonical_fact_id,candidate_json FROM active_support_candidates WHERE evidence_id=?',
        )
        .get(e.id);
      const key = db
        .prepare(
          `SELECT fact_key FROM ${e.fact_type === 'NODE' ? 'canonical_nodes' : 'canonical_edges'} WHERE id=?`,
        )
        .get(binding.canonical_fact_id);
      const kept = bytes([
        ...Object.values(e),
        ...Object.values(binding),
        ...Object.values(link),
        ...Object.values(snapshot),
      ]);
      return {
        id: e.id,
        kept,
        raw:
          kept +
          bytes([...Object.values(candidate), ...Object.values(runtime), ...Object.values(key)]),
      };
    });
}

test('D5 actual seal keeps accepted ACTIVE scalars through validation and Store checks settle separately', async (t) => {
  const { observeNativeApplySql, withNativeApplySqlFields } = await api();
  const c = await emptyNativePatch(t, true, false, [], ':memory:', 'source-less');
  const kept = activeSupportRows(c.db).reduce((n, r) => n + r.kept, 0);
  c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
  const records = [];
  const sealed = observeNativeApplySql(
    (r) => records.push(r),
    () =>
      c.stage.sealNativePatchState(c.expected, c.token, (input) => {
        withNativeApplySqlFields('seal-consumer', ['猫'], () =>
          assert.ok(input.activeSupports.length >= 2),
        );
        return validateNativeRefreshOverlay(input);
      }),
  );
  assert.equal(sealed.threw, false, String(sealed.error?.stack ?? sealed.error));
  assert.equal(sealed.captureFailed, false);
  assert.equal(
    records.find((r) => r.phase === 'STORE_ACTIVE_SUPPORT_RETURN')?.retainedSqlBytes,
    kept,
  );
  assert.equal(
    records.find((r) => r.phase === 'seal-consumer' && r.boundary === 'ENTER')?.retainedSqlBytes,
    kept + 3,
  );
  assert.equal(records.at(-1).phase, 'STORE_ACTIVE_SUPPORT_SCOPE');
  assert.equal(records.at(-1).retainedSqlBytes, 0);
  const applied = [];
  const result = observeNativeApplySql(
    (r) => applied.push(r),
    () =>
      new RepositoryCanonicalFactStore(c.db).applyNativeAnalysisPatch(
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
  assert.equal(applied.filter((r) => r.phase === 'STORE_ACTIVE_SUPPORT_RETURN').length, 2);
  assert.deepEqual(
    applied.filter((r) => r.phase === 'STORE_ACTIVE_SUPPORT_SCOPE').map((r) => r.retainedSqlBytes),
    [0, 0],
  );
  assert.equal(c.db.isTransaction, false);
});

test('D5 active support seal failure settles aliases without masking a falsy validation error', async (t) => {
  const { observeNativeApplySql } = await api();
  const c = await emptyNativePatch(t, true, false, [], ':memory:', 'source-less');
  c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
  const before = c.db.prepare('SELECT * FROM repository_state').all();
  const records = [];
  const result = observeNativeApplySql(
    (r) => records.push(r),
    () =>
      c.stage.sealNativePatchState(c.expected, c.token, (input) => {
        validateNativeRefreshOverlay(input);
        throw 0;
      }),
  );
  assert.equal(result.threw, true);
  assert.strictEqual(result.error, 0);
  assert.equal(result.captureFailed, false);
  assert.equal(records.at(-1).phase, 'STORE_ACTIVE_SUPPORT_SCOPE');
  assert.equal(records.at(-1).retainedSqlBytes, 0);
  assert.equal(c.db.isTransaction, false);
  assert.deepEqual(c.db.prepare('SELECT * FROM repository_state').all(), before);
  assert.throws(() => c.stage.readSealedNativeState(), /not been sealed/);
});

for (const mode of ['SUCCESS', 'MALFORMED', 'PRETEXT', 'CAPTURE_FAILURE'])
  test(`D5 actual active supports ${mode} retain accepted scalars without retaining prior raw rows`, async (t) => {
    const { observeNativeApplySql, withNativeApplySqlSupports, withNativeApplySqlFields } =
      await api();
    assert.equal(typeof withNativeApplySqlSupports, 'function', 'Support scope missing');
    const c = await emptyNativePatch(t, true, false, [], ':memory:', 'source-less');
    let rows = activeSupportRows(c.db);
    assert.ok(rows.length >= 2);
    if (mode === 'MALFORMED')
      c.db
        .prepare("UPDATE active_support_candidates SET candidate_json='{}' WHERE evidence_id=?")
        .run(rows.at(-1).id);
    if (mode === 'PRETEXT')
      c.db
        .prepare('UPDATE active_support_candidates SET candidate_json=? WHERE evidence_id=?')
        .run(JSON.stringify({ padding: 'x'.repeat(1_000_001) }), rows[0].id);
    rows = activeSupportRows(c.db);
    const records = [];
    const result = observeNativeApplySql(
      (r) => {
        records.push(r);
        if (mode === 'CAPTURE_FAILURE') throw 0;
      },
      () =>
        withNativeApplySqlSupports(() => {
          const supports = readNativePatchActiveSupports(
            c.db,
            { repositoryId: 'r', revisionId: 'rev' },
            { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 16 * 1024 * 1024 },
          );
          withNativeApplySqlFields('support-consumer', ['é'], () =>
            assert.equal(supports.supports.length, rows.length),
          );
          return supports;
        }),
    );
    assert.equal(result.threw, ['MALFORMED', 'PRETEXT'].includes(mode));
    assert.equal(result.captureFailed, mode === 'CAPTURE_FAILURE');
    assert.equal(c.db.isTransaction, false);
    if (mode === 'PRETEXT') {
      assert.match(result.error.message, /resource/i);
      assert.deepEqual(records, []);
      return;
    }
    if (mode === 'CAPTURE_FAILURE') {
      assert.strictEqual(result.captureFailure, 0);
      assert.equal(result.value.supports.length, rows.length);
      assert.equal(records.length, 1);
      assert.equal(records[0].retainedSqlBytes, rows[0].raw);
      return;
    }
    const expected = [];
    let kept = 0;
    for (const [i, row] of rows.entries()) {
      expected.push(['STORE_ACTIVE_SUPPORT_ROW', kept + row.raw]);
      if (mode === 'MALFORMED' && i === rows.length - 1) break;
      expected.push(['STORE_ACTIVE_SUPPORT_ACCEPTED', kept + row.raw]);
      kept += row.kept;
    }
    if (mode === 'MALFORMED')
      assert.match(result.error.message, /Invalid native active support chain/);
    else
      expected.push(
        ['STORE_ACTIVE_SUPPORT_RETURN', kept],
        ['support-consumer', kept + 2],
        ['support-consumer', kept],
      );
    expected.push(['STORE_ACTIVE_SUPPORT_SCOPE', 0]);
    assert.deepEqual(
      records.map((r) => [r.phase, r.retainedSqlBytes]),
      expected,
    );
    assert.ok(records.every((r) => r.retainedSqlStringChargeBytes === 2 * r.retainedSqlBytes));
  });

for (const mode of ['SUCCESS', 'MALFORMED', 'PRETEXT', 'CAPTURE_FAILURE'])
  test(`D5 actual token capture ${mode} observes raw fields without changing return or refusal`, async (t) => {
    const { observeNativeApplySql, withNativeApplySqlToken, withNativeApplySqlFields } =
      await api();
    const c = await emptyNativePatch(t);
    if (mode === 'MALFORMED') c.db.exec("UPDATE native_analysis_state SET header_json='{}'");
    if (mode === 'PRETEXT') {
      const row = c.db.prepare('SELECT header_json FROM native_analysis_state').get();
      const header = JSON.parse(row.header_json);
      header.padding = 'x'.repeat(1_000_001);
      c.db.prepare('UPDATE native_analysis_state SET header_json=?').run(JSON.stringify(header));
    }
    const pointer = c.db
      .prepare('SELECT indexed_revision_id,indexed_content_fingerprint FROM repository_state')
      .get();
    const pointerBytes = Object.values(pointer).reduce((sum, f) => sum + Buffer.byteLength(f), 0);
    const raw = c.db.prepare('SELECT * FROM native_analysis_state').get();
    const rowBytes = Object.values(raw).reduce((sum, f) => sum + Buffer.byteLength(f), 0);
    const expectedToken =
      mode === 'SUCCESS' || mode === 'CAPTURE_FAILURE'
        ? captureNativeActivationToken(c.db, 'r')
        : null;
    const records = [];
    const result = observeNativeApplySql(
      (r) => {
        records.push(r);
        if (mode === 'CAPTURE_FAILURE') throw 0;
      },
      () =>
        withNativeApplySqlToken(() => {
          const value = captureNativeActivationToken(c.db, 'r');
          withNativeApplySqlFields('comparison', ['é'], () =>
            assert.deepEqual(value, expectedToken),
          );
          return value;
        }),
    );
    assert.equal(result.threw, mode === 'MALFORMED' || mode === 'PRETEXT');
    assert.equal(result.captureFailed, mode === 'CAPTURE_FAILURE');
    if (mode === 'PRETEXT') {
      assert.match(result.error.message, /resource limit/);
      assert.deepEqual(records, []);
    } else if (mode === 'CAPTURE_FAILURE') {
      assert.equal(result.captureFailure, 0);
      assert.deepEqual(result.value, expectedToken);
      assert.equal(records.length, 1);
      assert.equal(records[0].phase, 'STORE_TOKEN_POINTER');
    } else {
      const wanted = [
        ['STORE_TOKEN_POINTER', 'ENTER', pointerBytes],
        ['STORE_TOKEN_ROW', 'ENTER', pointerBytes + rowBytes],
      ];
      if (mode === 'MALFORMED') assert.match(result.error.message, /token header/);
      else {
        const accepted =
          pointerBytes +
          Buffer.byteLength(raw.provider_id) +
          Buffer.byteLength(raw.provider_snapshot_id) +
          64;
        wanted.push(
          ['STORE_TOKEN_ACCEPTED', 'ENTER', pointerBytes + rowBytes + 64],
          ['STORE_TOKEN_RETURN', 'ENTER', accepted],
          ['comparison', 'ENTER', accepted + 2],
          ['comparison', 'EXIT', accepted],
        );
      }
      wanted.push(['STORE_TOKEN_SCOPE', 'EXIT', 0]);
      assert.deepEqual(
        records.map((r) => [r.phase, r.boundary, r.retainedSqlBytes]),
        wanted,
      );
    }
    assert.equal(c.db.isTransaction, false);
  });

test('D5 actual Native Apply keeps precheck and locked token lifetimes separate', async (t) => {
  const { observeNativeApplySql } = await api();
  const c = await emptyNativePatch(t);
  c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
  c.stage.sealNativePatchState(c.expected, c.token, validateNativeRefreshOverlay);
  const records = [];
  const result = observeNativeApplySql(
    (r) => records.push(r),
    () =>
      new RepositoryCanonicalFactStore(c.db).applyNativeAnalysisPatch(
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
  assert.equal(result.threw, false);
  assert.equal(result.captureFailed, false);
  const phases = records.filter((r) => r.phase.startsWith('STORE_TOKEN_'));
  assert.equal(phases.filter((r) => r.phase === 'STORE_TOKEN_RETURN').length, 2);
  assert.deepEqual(
    phases.filter((r) => r.phase === 'STORE_TOKEN_SCOPE').map((r) => r.retainedSqlBytes),
    [0, 0],
  );
  assert.equal(records.at(-1).retainedSqlBytes, 0);
});

test('D5 actual multirow token retains prior tuples, not prior raw headers, on a later malformed row', async (t) => {
  const { observeNativeApplySql, withNativeApplySqlToken } = await api();
  const c = await emptyNativePatch(t);
  // Reader-only metadata fixture; never used to publish a Canonical graph.
  c.db.exec(
    "INSERT INTO native_analysis_state SELECT repository_id,'z-第二',provider_snapshot_id,revision_id,content_fingerprint,json_set(header_json,'$.providerId','z-第二') FROM native_analysis_state WHERE provider_id='native'",
  );
  const rows = c.db.prepare('SELECT * FROM native_analysis_state ORDER BY provider_id').all();
  const rawBytes = rows.map((row) =>
    Object.values(row).reduce((sum, f) => sum + Buffer.byteLength(f), 0),
  );
  const tupleBytes = rows.map(
    (row) => Buffer.byteLength(row.provider_id) + Buffer.byteLength(row.provider_snapshot_id) + 64,
  );
  for (const malformed of [false, true]) {
    if (malformed)
      c.db.exec("UPDATE native_analysis_state SET header_json='{}' WHERE provider_id='z-第二'");
    const secondRawBytes = malformed
      ? rawBytes[1] - Buffer.byteLength(rows[1].header_json) + 2
      : rawBytes[1];
    const records = [];
    const result = observeNativeApplySql(
      (r) => records.push(r),
      () => withNativeApplySqlToken(() => captureNativeActivationToken(c.db, 'r')),
    );
    assert.equal(result.threw, malformed);
    assert.equal(result.captureFailed, false);
    const expected = [7, 7 + rawBytes[0], 7 + rawBytes[0] + 64, 7 + tupleBytes[0] + secondRawBytes];
    if (malformed) assert.match(result.error.message, /token header/);
    else expected.push(7 + tupleBytes[0] + rawBytes[1] + 64, 7 + tupleBytes[0] + tupleBytes[1]);
    expected.push(0);
    assert.deepEqual(
      records.map((r) => r.retainedSqlBytes),
      expected,
    );
    assert.equal(c.db.isTransaction, false);
  }
});

test('D5 token SQL gauge replaces raw rows and stays owned through comparison', async () => {
  const {
    observeNativeApplySql,
    withNativeApplySqlFields,
    withNativeApplySqlToken,
    nativeApplySqlTokenObserver,
  } = await api();
  assert.equal(typeof withNativeApplySqlToken, 'function', 'Token scope missing');
  const records = [];
  const result = observeNativeApplySql(
    (r) => records.push(r),
    () =>
      withNativeApplySqlFields('parent', ['é'], () => {
        withNativeApplySqlToken(() => {
          const report = nativeApplySqlTokenObserver();
          report('TOKEN_POINTER', 7);
          report('TOKEN_ROW', 20);
          report('TOKEN_ACCEPTED', 84);
          report('TOKEN_ROW', 100);
          report('TOKEN_RETURN', 75);
          withNativeApplySqlFields('comparison', ['猫'], () => {});
        });
        return 42;
      }),
  );
  assert.equal(result.value, 42);
  assert.equal(result.captureFailed, false);
  assert.deepEqual(
    records.map((r) => [r.phase, r.boundary, r.retainedSqlBytes]),
    [
      ['parent', 'ENTER', 2],
      ['STORE_TOKEN_POINTER', 'ENTER', 9],
      ['STORE_TOKEN_ROW', 'ENTER', 22],
      ['STORE_TOKEN_ACCEPTED', 'ENTER', 86],
      ['STORE_TOKEN_ROW', 'ENTER', 102],
      ['STORE_TOKEN_RETURN', 'ENTER', 77],
      ['comparison', 'ENTER', 80],
      ['comparison', 'EXIT', 77],
      ['STORE_TOKEN_SCOPE', 'EXIT', 2],
      ['parent', 'EXIT', 0],
    ],
  );
});

test('D5 token scope isolates nested owners and invalidates unsafe capture without changing falsy errors', async () => {
  const { observeNativeApplySql, withNativeApplySqlToken, nativeApplySqlTokenObserver } =
    await api();
  assert.equal(typeof withNativeApplySqlToken, 'function', 'Token scope missing');
  for (const failure of [undefined, 0, null, '']) {
    const outer = [],
      inner = [];
    let report;
    const result = observeNativeApplySql(
      (r) => outer.push(r),
      () =>
        withNativeApplySqlToken(() => {
          report = nativeApplySqlTokenObserver();
          report('TOKEN_ROW', 3);
          const child = observeNativeApplySql(
            (r) => inner.push(r),
            () =>
              withNativeApplySqlToken(() => {
                report('TOKEN_ROW', 99);
                nativeApplySqlTokenObserver()('TOKEN_RETURN', 5);
              }),
          );
          assert.equal(child.captureFailed, false);
          report('TOKEN_RETURN', 2);
          throw failure;
        }),
    );
    assert.equal(result.threw, true);
    assert.equal(result.error, failure);
    assert.equal(result.captureFailed, false);
    assert.deepEqual(
      outer.map((r) => r.retainedSqlBytes),
      [3, 2, 0],
    );
    assert.deepEqual(
      inner.map((r) => r.retainedSqlBytes),
      [5, 0],
    );
    report('TOKEN_ROW', 10);
    assert.equal(outer.length, 3);
  }
  const invalid = observeNativeApplySql(
    () => {},
    () =>
      withNativeApplySqlToken(() => {
        nativeApplySqlTokenObserver()('TOKEN_ROW', Number.MAX_SAFE_INTEGER);
        return 42;
      }),
  );
  assert.equal(invalid.value, 42);
  assert.equal(invalid.captureFailed, true);
});

test('D5 retirement SQL ID handoff counts aliases once and independent equal reads twice', async () => {
  const { observeNativeApplySql, withNativeApplySqlFields, withNativeApplySqlRetirementRows } =
    await api();
  assert.equal(typeof withNativeApplySqlRetirementRows, 'function', 'Retirement handoff missing');
  const records = [];
  const result = observeNativeApplySql(
    (r) => records.push(r),
    () => {
      let settle;
      withNativeApplySqlRetirementRows(['ev', '猫'], (keep) => {
        settle = keep('猫');
      });
      withNativeApplySqlFields('consumer', ['é'], () => {});
      withNativeApplySqlRetirementRows(['ev', '猫'], (keep) => {
        settle();
        settle = keep('猫');
      });
      settle();
      return 42;
    },
  );
  assert.equal(result.value, 42);
  assert.equal(result.captureFailed, false);
  assert.deepEqual(
    records.map((r) => [r.phase, r.boundary, r.retainedSqlBytes]),
    [
      ['STORE_RETIRE_ROW', 'ENTER', 5],
      ['STORE_AFFECTED_ID', 'ENTER', 5],
      ['STORE_RETIRE_ROW', 'EXIT', 3],
      ['consumer', 'ENTER', 5],
      ['consumer', 'EXIT', 3],
      ['STORE_RETIRE_ROW', 'ENTER', 8],
      ['STORE_AFFECTED_ID', 'EXIT', 5],
      ['STORE_AFFECTED_ID', 'ENTER', 5],
      ['STORE_RETIRE_ROW', 'EXIT', 3],
      ['STORE_AFFECTED_ID', 'EXIT', 0],
    ],
  );
});

test('D5 retirement handoff settles early and on falsy failure without masking product errors', async () => {
  const { observeNativeApplySql, withNativeApplySqlRetirementRows } = await api();
  assert.equal(typeof withNativeApplySqlRetirementRows, 'function', 'Retirement handoff missing');
  for (const captureFailure of [false, true]) {
    const records = [];
    const result = observeNativeApplySql(
      (r) => {
        records.push(r);
        if (captureFailure) throw 0;
      },
      () => {
        let settle;
        try {
          withNativeApplySqlRetirementRows(['ev', '猫'], (keep) => {
            const early = keep('猫');
            early();
            early();
          });
          withNativeApplySqlRetirementRows(['ev', '猫'], (keep) => {
            settle = keep('猫');
            throw undefined;
          });
        } finally {
          settle?.();
        }
      },
    );
    assert.equal(result.threw, true);
    assert.equal(result.error, undefined);
    assert.equal(result.captureFailed, captureFailure);
    if (captureFailure) {
      assert.equal(result.captureFailure, 0);
      assert.equal(records.length, 1);
    } else
      assert.deepEqual(
        records.map((r) => r.retainedSqlBytes),
        [5, 0, 5, 5, 3, 0],
      );
  }
});

test('D5 escaped retirement ID invalidates its capture and cannot emit into a later owner', async () => {
  const { observeNativeApplySql, withNativeApplySqlRetirementRows, withNativeApplySqlFields } =
    await api();
  const first = [],
    second = [];
  let settle;
  const result = observeNativeApplySql(
    (r) => first.push(r),
    () => {
      withNativeApplySqlRetirementRows(['ev', '猫'], (keep) => {
        settle = keep('猫');
      });
      return 42;
    },
  );
  assert.equal(result.value, 42);
  assert.equal(result.threw, false);
  assert.equal(result.captureFailed, true);
  const count = first.length;
  const next = observeNativeApplySql(
    (r) => second.push(r),
    () => {
      withNativeApplySqlFields('later', ['é'], () => {
        settle();
        settle();
      });
    },
  );
  assert.equal(next.captureFailed, false);
  assert.equal(first.length, count);
  assert.deepEqual(
    second.map((r) => r.retainedSqlBytes),
    [2, 0],
  );
});

test('D5 Stage summary owns all four SQL fields through a failing consumer and IteratorClose', async (t) => {
  const { observeNativeApplySql, withNativeApplySqlFields } = await api();
  const c = await emptyNativePatch(t, true, true);
  const row = c.db
    .prepare('SELECT * FROM temp.patch_native_summary ORDER BY source_path LIMIT 1')
    .get();
  const bytes = Object.values(row).reduce((sum, field) => sum + Buffer.byteLength(field), 0);
  for (const failure of [false, true]) {
    const records = [];
    const result = observeNativeApplySql(
      (r) => records.push(r),
      () => {
        const iterator = c.stage.readNativeSummaries();
        const first = iterator.next();
        assert.equal(first.done, false);
        withNativeApplySqlFields('consumer', ['é'], () => {});
        if (failure) iterator.throw(undefined);
        else iterator.return();
      },
    );
    assert.equal(result.captureFailed, false);
    assert.equal(result.threw, failure);
    if (failure) assert.equal(result.error, undefined);
    assert.deepEqual(
      records.map((r) => [r.phase, r.boundary, r.retainedSqlBytes]),
      [
        ['STAGE_SUMMARY_ROW', 'ENTER', bytes],
        ['consumer', 'ENTER', bytes + 2],
        ['consumer', 'EXIT', bytes],
        ['STAGE_SUMMARY_ROW', 'EXIT', 0],
      ],
    );
    assert.equal(c.db.isTransaction, false);
  }
});

for (const mode of ['SOURCE_ID', 'SOURCE_PATH', 'PROVIDER', 'NORMALIZED', 'RETAINED'])
  test(`D5 Stage point ${mode} records actual materialization and preserves failures`, async (t) => {
    const { observeNativeApplySql } = await api();
    const c = await emptyNativePatch(t, false, false, [], ':memory:', 'source-less');
    const file = c.context.targetSourceFiles[0];
    const provider = baseCase('shared').nodes[0];
    const canonical = c.otherSupport.canonical;
    if (mode === 'RETAINED') c.stage.confirmNativeSucceeded(c.terminal, c.snapshot);
    else {
      await c.stage.acceptNativeEvent({ type: 'SOURCE_FILE', payload: file });
      await c.stage.acceptNativeEvent({ type: 'UPSERT_NODE', payload: provider });
      c.stage.putNormalizedNode({ provider: c.otherSupport.binding.providerFact, canonical });
    }
    const table =
      mode === 'RETAINED'
        ? 'active_support_candidates'
        : mode === 'NORMALIZED'
          ? 'temp.patch_normalized'
          : 'temp.patch_event';
    const field = mode === 'RETAINED' ? 'candidate_json' : 'payload';
    const where =
      mode === 'RETAINED'
        ? 'evidence_id=?'
        : mode === 'NORMALIZED'
          ? 'provider_fact_id=?'
          : 'kind=?';
    const key =
      mode === 'RETAINED'
        ? c.otherSupport.evidence.id
        : mode === 'NORMALIZED'
          ? c.otherSupport.binding.providerFact.providerFactId
          : mode === 'PROVIDER'
            ? 'UPSERT_NODE'
            : 'SOURCE_FILE';
    const raw = c.db.prepare(`SELECT ${field} AS raw FROM ${table} WHERE ${where}`).get(key).raw;
    const bytes = Buffer.byteLength(raw);
    const lookup = (missing = false) => {
      if (mode === 'SOURCE_ID') return c.stage.getChangedSourceFile(missing ? 'missing' : file.id);
      if (mode === 'SOURCE_PATH')
        return c.stage.getSourceFileByPath(missing ? 'missing' : file.path);
      if (mode === 'PROVIDER')
        return c.stage.getProviderNode(missing ? 'missing' : provider.providerFactId);
      if (mode === 'NORMALIZED')
        return c.stage.getNormalizedNode(
          missing ? 'missing' : c.otherSupport.binding.providerFact.providerFactId,
        );
      return c.stage.getRetainedCanonicalNode(
        'z-other',
        missing ? 'missing' : c.otherSupport.binding.providerFact.providerFactId,
      );
    };
    const phase = `STAGE_POINT_${mode}`;
    if (mode === 'RETAINED') {
      const { observeNativeStageAccounting } = await api();
      const points = [];
      const capture = await observeNativeStageAccounting(
        () =>
          observeNativeApplySql(
            () => {},
            () => lookup(),
          ),
        (record) => points.push(record),
      );
      assert.equal(capture.threw, false);
      assert.equal(capture.captureFailed, false);
      assert.equal(capture.value.threw, false);
      const admission = points.find(
        (record) => record.budgetComponents.source === 'RETAINED_CANDIDATE_ADMISSION',
      );
      assert.equal(admission.budgetComponents.additionalSqlAllowanceBytes, bytes);
      assert.equal(admission.budgetComponents.resultCopyChargeBytes, 0);
      assert.equal(
        admission.rawSql.retainedSqlBytes,
        0,
        'Candidate allowance precedes TEXT ownership',
      );
    }
    const records = [];
    let result = observeNativeApplySql(
      (r) => records.push(r),
      () => lookup(),
    );
    assert.equal(result.threw, false);
    assert.equal(result.captureFailed, false);
    assert.deepEqual(
      records.map((r) => [r.phase, r.boundary, r.retainedSqlBytes]),
      [
        [phase, 'ENTER', bytes],
        [phase, 'EXIT', 0],
      ],
    );
    const value = result.value;
    records.length = 0;
    result = observeNativeApplySql(
      (r) => records.push(r),
      () => lookup(true),
    );
    assert.equal(result.value, null);
    assert.equal(result.threw, false);
    assert.deepEqual(
      records.map((r) => r.retainedSqlBytes),
      [0, 0],
    );
    result = observeNativeApplySql(
      () => {
        throw 0;
      },
      () => lookup(),
    );
    assert.deepEqual(result.value, value);
    assert.equal(result.threw, false);
    assert.equal(result.captureFailed, true);
    assert.equal(result.captureFailure, 0);
    c.db.prepare(`UPDATE ${table} SET ${field}='{}' WHERE ${where}`).run(key);
    records.length = 0;
    result = observeNativeApplySql(
      (r) => records.push(r),
      () => lookup(),
    );
    assert.equal(result.threw, true);
    assert.equal(result.error.name, 'ZodError');
    assert.equal(result.captureFailed, false);
    assert.deepEqual(
      records.map((r) => [r.phase, r.boundary, r.retainedSqlBytes]),
      [
        [phase, 'ENTER', 2],
        [phase, 'EXIT', 0],
      ],
    );
    assert.equal(c.db.isTransaction, false);
  });

for (const [phase, table, read] of [
  ['STAGE_EVENT_ROW', 'patch_event', 'readRemoveNodes'],
  ['STAGE_NORMALIZED_ROW', 'patch_normalized', 'readNormalizedNodes'],
  ['STAGE_SUPPORT_ROW', 'patch_support', 'readSupports'],
])
  test(`D5 actual ${phase} remains owned across consumer work and IteratorClose`, async (t) => {
    const { observeNativeApplySql, withNativeApplySqlFields } = await api();
    const c = await emptyNativePatch(t, false, false, ['f-0', 'f-1'], ':memory:', 'source-less');
    c.stage.putNormalizedNode({
      provider: c.otherSupport.binding.providerFact,
      canonical: c.otherSupport.canonical,
    });
    c.stage.appendSupport(c.otherSupport);
    const raw = c.db
      .prepare(
        `SELECT payload FROM temp.${table}${
          table === 'patch_event'
            ? " WHERE kind='REMOVE_NODE' ORDER BY source_path,provider_id,provider_fact_id,sequence"
            : ''
        }`,
      )
      .all();
    assert.ok(raw.length > 0);
    const bytes = Buffer.byteLength(raw[0].payload);
    for (const consumerFailure of [false, true]) {
      const records = [];
      const result = observeNativeApplySql(
        (r) => records.push(r),
        () => {
          const iterator = c.stage[read]();
          assert.equal(iterator.next().done, false);
          withNativeApplySqlFields('consumer', ['é'], () => {});
          if (consumerFailure) iterator.throw(0);
          else iterator.return();
        },
      );
      assert.equal(result.captureFailed, false);
      assert.equal(result.threw, consumerFailure);
      if (consumerFailure) assert.equal(result.error, 0);
      assert.deepEqual(
        records.map((r) => [r.phase, r.boundary, r.retainedSqlBytes]),
        [
          [phase, 'ENTER', bytes],
          ['consumer', 'ENTER', bytes + 2],
          ['consumer', 'EXIT', bytes],
          [phase, 'EXIT', 0],
        ],
      );
      assert.equal(c.db.isTransaction, false);
    }
  });

test('D5 Apply suspended SQL rows retain overlapping consumer frames and settle independently', async () => {
  const { observeNativeApplySql, withNativeApplySqlFields, yieldNativeApplySqlFields } =
    await api();
  assert.equal(typeof yieldNativeApplySqlFields, 'function', 'Suspended row owner missing');
  const records = [];
  const a = {},
    b = {};
  const result = observeNativeApplySql(
    (r) => records.push(r),
    () => {
      const first = yieldNativeApplySqlFields('first', ['é'], () => a);
      const second = yieldNativeApplySqlFields('second', ['猫'], () => b);
      assert.equal(first.next().value, a);
      assert.equal(second.next().value, b);
      withNativeApplySqlFields('consumer', ['text'], () => {});
      first.return();
      second.return();
      return 42;
    },
  );
  assert.equal(result.value, 42);
  assert.equal(result.captureFailed, false);
  assert.deepEqual(
    records.map((r) => [r.phase, r.boundary, r.retainedSqlBytes]),
    [
      ['first', 'ENTER', 2],
      ['second', 'ENTER', 5],
      ['consumer', 'ENTER', 9],
      ['consumer', 'EXIT', 5],
      ['first', 'EXIT', 3],
      ['second', 'EXIT', 0],
    ],
  );
});

test('D5 Apply suspended SQL rows preserve falsy parse and consumer throws despite capture failure', async () => {
  const { observeNativeApplySql, yieldNativeApplySqlFields } = await api();
  assert.equal(typeof yieldNativeApplySqlFields, 'function', 'Suspended row owner missing');
  for (const thrown of [undefined, 0, null, ''])
    for (const parse of [false, true]) {
      let calls = 0;
      const result = observeNativeApplySql(
        () => {
          calls++;
          throw 0;
        },
        () => {
          const row = yieldNativeApplySqlFields('row', ['a'], () => {
            if (parse) throw thrown;
            return 7;
          });
          row.next();
          row.throw(thrown);
        },
      );
      assert.equal(result.threw, true);
      assert.equal(result.error, thrown);
      assert.equal(result.captureFailed, true);
      assert.equal(result.captureFailure, 0);
      assert.equal(calls, 1);
    }
});

test('D5 Apply escaped suspended rows invalidate the capture and finalize silently after scope exit', async () => {
  const { observeNativeApplySql, withNativeApplySqlFields, yieldNativeApplySqlFields } =
    await api();
  assert.equal(typeof yieldNativeApplySqlFields, 'function', 'Suspended row owner missing');
  const records = [];
  let row;
  const result = observeNativeApplySql(
    (r) => records.push(r),
    () => {
      row = yieldNativeApplySqlFields('row', ['ab'], () => 7);
      assert.equal(row.next().value, 7);
      return 42;
    },
  );
  assert.equal(result.value, 42);
  assert.equal(result.threw, false);
  assert.equal(result.captureFailed, true);
  const next = [];
  observeNativeApplySql(
    (r) => next.push(r),
    () => {
      row.return();
      withNativeApplySqlFields('new', ['x'], () => {});
    },
  );
  assert.deepEqual(
    records.map((r) => [r.boundary, r.retainedSqlBytes]),
    [['ENTER', 2]],
  );
  assert.deepEqual(
    next.map((r) => r.retainedSqlBytes),
    [1, 0],
  );
});

test('D5 Apply SQL owner counts concurrent UTF-8 fields and drops only the settled frame', async () => {
  const { observeNativeApplySql, withNativeApplySqlFields } = await api();
  const records = [];
  const marker = {};
  const result = observeNativeApplySql(
    (record) => records.push(record),
    () =>
      withNativeApplySqlFields('outer', ['é', null, undefined], () =>
        withNativeApplySqlFields('inner', ['猫', 'a'], () => marker),
      ),
  );
  assert.equal(result.threw, false);
  assert.equal(result.value, marker);
  assert.equal(result.captureFailed, false);
  assert.deepEqual(
    records.map((r) => [r.phase, r.boundary, r.retainedSqlBytes, r.retainedSqlStringChargeBytes]),
    [
      ['outer', 'ENTER', 2, 4],
      ['inner', 'ENTER', 6, 12],
      ['inner', 'EXIT', 2, 4],
      ['outer', 'EXIT', 0, 0],
    ],
  );
  assert.ok(records.every((r) => Object.isFrozen(r) && r.scope === 'APPLY_RAW_SQL_OWNERSHIP_ONLY'));
});

test('D5 Apply SQL nested scopes restore their parent and calls outside scope stay silent', async () => {
  const { observeNativeApplySql, withNativeApplySqlFields } = await api();
  const outer = [],
    inner = [];
  observeNativeApplySql(
    (r) => outer.push(r),
    () =>
      withNativeApplySqlFields('outer', ['ab'], () => {
        const nested = observeNativeApplySql(
          (r) => inner.push(r),
          () => withNativeApplySqlFields('nested', ['猫'], () => 7),
        );
        assert.equal(nested.value, 7);
        withNativeApplySqlFields('restored', ['x'], () => {});
      }),
  );
  withNativeApplySqlFields('outside', ['unobserved'], () => {});
  assert.deepEqual(
    outer.map((r) => r.retainedSqlBytes),
    [2, 3, 2, 0],
  );
  assert.deepEqual(
    inner.map((r) => r.retainedSqlBytes),
    [3, 0],
  );
});

test('D5 Apply SQL capture failure preserves product return and every falsy thrown value', async () => {
  const { observeNativeApplySql, withNativeApplySqlFields } = await api();
  for (const failure of [0, null, undefined, '', new Error('product')]) {
    let calls = 0;
    const result = observeNativeApplySql(
      () => {
        calls++;
        throw undefined;
      },
      () =>
        withNativeApplySqlFields('row', ['a'], () => {
          throw failure;
        }),
    );
    assert.equal(result.threw, true);
    assert.equal(result.error, failure);
    assert.equal(result.captureFailed, true);
    assert.equal(result.captureFailure, undefined);
    assert.equal(calls, 1, 'Invalid capture must stop emitting');
    assert.ok(Object.isFrozen(result));
  }
  const result = observeNativeApplySql(
    () => {
      throw 0;
    },
    () => withNativeApplySqlFields('row', ['a'], () => 42),
  );
  assert.equal(result.value, 42);
  assert.equal(result.threw, false);
  assert.equal(result.captureFailure, 0);
});
