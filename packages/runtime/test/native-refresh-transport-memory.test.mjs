import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { RepositoryCanonicalFactStore, RepositoryPatchStage } from '../../storage/dist/index.js';
import {
  preparedSourceRefresh,
  sourceTransitions,
} from './helpers/native-refresh-source-fixture.mjs';

const workerPath = fileURLToPath(
  new URL('./helpers/native-refresh-transport-worker.mjs', import.meta.url),
);

test('D5 lifetime family actual token-race actor records COMPETITOR sources', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  const families = ['BASELINE_READ', 'PREPARATION', 'COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY'];
  const capture = await module.captureRefreshSourceLifetime(
    () => module.runRefreshTransportWorker('offline', 'd-token-race', 0),
    families.map((family) => ({
      family,
      role: 'COMPETITOR',
      disposition: ['COMPLETION', 'NORMALIZE'].includes(family) ? 'PROVEN_NO_TEXT' : 'OBSERVED',
    })),
  );
  assert.equal(capture.threw, false);
  assert.deepEqual(
    capture.evidence.coverage.map((row) => row.disposition),
    ['OBSERVED', 'OBSERVED', 'PROVEN_NO_TEXT', 'PROVEN_NO_TEXT', 'OBSERVED', 'OBSERVED'],
  );
  const { row } = capture.value;
  assert.equal(row.race.competitorCommits, 1);
  assert.equal(row.race.competitorSnapshotId, 'snapshot-d5-competitor');
  assert.equal(row.race.competitorStatePreserved, true);
  assert.equal(row.observedOutcome, 'WORKER_EXCEPTION');
  assert.equal(row.persistentStateVerified, true);
  assert.equal(row.calibrationEligible, false);
  // This old worker includes external fixture setup and has no full-lifetime contract.
  assert.equal(capture.evidence.coverageComplete, false);
  assert.equal(capture.evidence.retainedSqlBytes, null);
});

test('D5 lifetime family actual reopen actor records RETRY without inventing Apply', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  const capture = await module.captureRefreshSourceLifetime(
    () => module.runRefreshTransportWorker('offline', 'd-reopen', 0),
    ['BASELINE_READ', 'PREPARATION', 'APPLY'].map((family) => ({
      family,
      role: 'RETRY',
      disposition: family === 'APPLY' ? 'PROVEN_NOT_REACHED' : 'OBSERVED',
    })),
  );
  assert.equal(capture.threw, false);
  assert.deepEqual(
    capture.evidence.coverage.map((row) => row.disposition),
    ['OBSERVED', 'OBSERVED', 'PROVEN_NOT_REACHED'],
  );
  assert.equal(capture.value.failure, null);
  assert.deepEqual(capture.value.row.retry.deltaCounts, { added: 0, modified: 0, deleted: 0 });
  assert.equal(capture.value.row.persistentStateVerified, true);
  assert.equal(capture.value.row.calibrationEligible, false);
  assert.equal(capture.evidence.coverageComplete, false);
  assert.equal(capture.evidence.retainedSqlBytes, null);
});
test('D5 lifetime family actual PARTIAL worker proves downstream no-call only', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  const capture = await module.captureRefreshSourceLifetime(
    () => module.runRefreshTransportWorker('offline', 'd-partial', 0),
    [
      { family: 'COMPLETION', role: 'MAIN', disposition: 'PROVEN_NO_TEXT' },
      ...['NORMALIZE', 'SEAL', 'APPLY'].map((family) => ({
        family,
        role: 'MAIN',
        disposition: 'PROVEN_NOT_REACHED',
      })),
    ],
  );
  assert.equal(capture.threw, false);
  assert.deepEqual(
    capture.evidence.coverage.map((item) => item.disposition),
    ['PROVEN_NO_TEXT', 'PROVEN_NOT_REACHED', 'PROVEN_NOT_REACHED', 'PROVEN_NOT_REACHED'],
  );
  assert.equal(capture.value.failure, null);
  assert.equal(capture.value.row.observedOutcome, 'WORKER_EXCEPTION');
  assert.equal(capture.value.row.persistedSnapshotCount, 1);
  assert.equal(capture.value.row.transactionClosed, true);
  assert.equal(capture.value.row.tempClosed, true);
  assert.equal(capture.value.row.persistentStateVerified, true);
  assert.equal(capture.value.row.calibrationEligible, false);
  assert.equal(capture.evidence.coverageComplete, false);
  assert.equal(capture.evidence.retainedSqlBytes, null);
});

for (const [name, outcome] of [
  ['d-slow-stdin', 'CANCELLED'],
  ['d-cancel', 'CANCELLED'],
  ['d-corrupt', 'CHECKSUM_MISMATCH'],
  ['d-late-exit', 'PROCESS_FAILED'],
])
  test(`D5 lifetime family transport refusal ${name === 'd-slow-stdin' ? 'rejects setup-inclusive lifetime' : 'skips downstream sources'}: ${name}`, async () => {
    const module = await import('./helpers/native-refresh-transport-worker.mjs');
    const families = ['COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY'];
    const capture = await module.captureRefreshSourceLifetime(
      () => module.runRefreshTransportWorker('offline', name, 0),
      [
        ...['BASELINE_READ', 'PREPARATION'].map((family) => ({
          family,
          role: 'MAIN',
          disposition: 'OBSERVED',
        })),
        ...families.map((family) => ({ family, role: 'MAIN', disposition: 'PROVEN_NOT_REACHED' })),
      ],
    );
    assert.equal(capture.threw, false);
    // The slow-input boundary returns next.baseline aliases from its generation
    // seed. Whole-worker capture cannot treat those unowned aliases as settled.
    if (name === 'd-slow-stdin') {
      assert.equal(capture.captureFailed, true);
      assert.match(String(capture.captureFailure), /Unsettled SQL source domains/);
      assert.ok(capture.evidence.reasons.includes('UNSETTLED_SOURCE_DOMAINS'));
      assert.equal(capture.evidence.coverageComplete, false);
      assert.equal(capture.evidence.retainedSqlBytes, null);
      assert.equal(capture.evidence.retainedSqlStringChargeBytes, null);
    } else assert.equal(capture.captureFailed, false);
    const { row, failure } = capture.value;
    assert.equal(failure, null);
    assert.equal(row.observedOutcome, outcome);
    assert.equal(row.persistedSnapshotCount, 1);
    assert.equal(row.transactionClosed, true);
    assert.equal(row.tempClosed, true);
    assert.equal(row.persistentStateVerified, true);
    assert.equal(row.calibrationEligible, false);
    if (name === 'd-slow-stdin') {
      assert.equal(row.inputGate.blockedVerified, true);
      assert.equal(row.inputGate.childClosed, true);
      assert.equal(row.inputGate.applyCalls, 0);
      assert.ok(row.inputGate.backpressureWrites > 0);
      assert.equal(row.inputGate.endCalls, 0);
    }
    for (const prefix of ['sqlCompletion', 'sqlNormalize', 'sqlSeal', 'sqlApply']) {
      assert.equal(row[`${prefix}Calls`], 0);
      assert.equal(row[prefix], null);
    }
    assert.deepEqual(
      capture.evidence.coverage.slice(0, 2).map((item) => item.disposition),
      ['OBSERVED', 'OBSERVED'],
    );
    assert.deepEqual(
      capture.evidence.coverage.slice(2).map((item) => item.disposition),
      ['PROVEN_NOT_REACHED', 'PROVEN_NOT_REACHED', 'PROVEN_NOT_REACHED', 'PROVEN_NOT_REACHED'],
    );
  });

test('D5 lifetime family source-race proves numeric Seal refusal and guarded Apply no-call', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  const families = ['BASELINE_READ', 'PREPARATION', 'COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY'];
  const original = RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch;
  const counted = await module.observeRetryApplyCalls(() =>
    module.captureRefreshSourceLifetime(
      () => module.runRefreshTransportWorker('offline', 'd-source-race', 0),
      families.map((family) => ({
        family,
        role: 'MAIN',
        disposition:
          family === 'SEAL'
            ? 'PROVEN_NO_TEXT'
            : family === 'APPLY'
              ? 'PROVEN_NOT_REACHED'
              : 'OBSERVED',
      })),
    ),
  );
  assert.equal(counted.threw, false);
  assert.equal(counted.guarded, true);
  assert.equal(counted.applyCalls, 0);
  assert.equal(RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch, original);
  const capture = counted.value;
  assert.equal(capture.threw, false);
  assert.equal(capture.captureFailed, false);
  assert.equal(capture.value.failure, null);
  const { row } = capture.value;
  assert.equal(row.observedOutcome, 'WORKER_EXCEPTION');
  assert.equal(row.race.competitorRole, 'TEST');
  assert.equal(row.race.competitorCommits, 1);
  assert.equal(row.race.competitorStatePreserved, true);
  assert.match(row.race.refusalMessage, /Native target revision changed/);
  assert.deepEqual(
    ['sqlCompletion', 'sqlNormalize', 'sqlSeal', 'sqlApply'].map((prefix) => row[`${prefix}Calls`]),
    [1, 1, 1, 0],
  );
  assert.equal(row.sqlSeal, null);
  assert.equal(row.sqlAdditionalReads.competitor, null);
  assert.equal(row.transactionClosed, true);
  assert.equal(row.tempClosed, true);
  assert.equal(row.persistentStateVerified, true);
  assert.equal(row.calibrationEligible, false);
  assert.deepEqual(
    capture.evidence.coverage.map((item) => item.disposition),
    ['OBSERVED', 'OBSERVED', 'OBSERVED', 'OBSERVED', 'PROVEN_NO_TEXT', 'PROVEN_NOT_REACHED'],
  );
  // This declares six diagnostic families, not a qualified setup-free replay.
  assert.equal(capture.evidence.coverageComplete, true);
  assert.ok(capture.evidence.retainedSqlBytes > 0);
  assert.equal(row.lifecycle.sql.completeRetainedSqlBytes, null);
});

for (const fault of ['guard-loss', 'actual-entry'])
  test(`D5 source-race Apply no-call refuses ${fault}`, async (t) => {
    const module = await import('./helpers/native-refresh-transport-worker.mjs');
    const originalApply = RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch;
    const originalSeal = RepositoryPatchStage.prototype.sealNativePatchState;
    t.mock.method(RepositoryPatchStage.prototype, 'sealNativePatchState', function (...args) {
      if (fault === 'guard-loss') {
        RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch = originalApply;
      } else {
        // Enter the real Store with invalid input: validation must throw before
        // mutation, then the original numeric Seal refusal still executes.
        assert.throws(() =>
          new RepositoryCanonicalFactStore(this.db).applyNativeAnalysisPatch(null, null, null),
        );
      }
      return originalSeal.apply(this, args);
    });
    const families = ['BASELINE_READ', 'PREPARATION', 'COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY'];
    const capture = await module.captureRefreshSourceLifetime(
      () => module.runRefreshTransportWorker('offline', 'd-source-race', 0),
      families.map((family) => ({
        family,
        role: 'MAIN',
        disposition:
          family === 'SEAL'
            ? 'PROVEN_NO_TEXT'
            : family === 'APPLY'
              ? 'PROVEN_NOT_REACHED'
              : 'OBSERVED',
      })),
    );
    assert.equal(capture.threw, false);
    assert.equal(capture.captureFailed, false);
    assert.equal(capture.value.failure, null);
    const { row } = capture.value;
    assert.match(row.race.refusalMessage, /Native target revision changed/);
    assert.equal(row.race.competitorStatePreserved, true);
    assert.equal(row.transactionClosed, true);
    assert.equal(row.tempClosed, true);
    assert.equal(row.persistentStateVerified, true);
    assert.equal(row.calibrationEligible, false);
    assert.equal(
      capture.evidence.coverage.find((item) => item.family === 'APPLY').disposition,
      'UNKNOWN',
    );
    assert.equal(capture.evidence.coverageComplete, false);
    assert.equal(capture.evidence.retainedSqlBytes, null);
    assert.equal(RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch, originalApply);
  });

const scopedSqlPrefixes = [
  'sqlCompletion',
  'sqlNormalize',
  'sqlSeal',
  'sqlApply',
  'sqlCompetitorCompletion',
  'sqlCompetitorNormalize',
  'sqlCompetitorSeal',
  'sqlCompetitorApply',
];
function lifecycleRow() {
  return {
    ...Object.fromEntries(
      scopedSqlPrefixes.flatMap((prefix) => [
        [prefix, null],
        [`${prefix}Overlap`, null],
        [`${prefix}Calls`, 0],
        [`${prefix}CaptureFailure`, null],
      ]),
    ),
    sqlReadFixtureRole: 'SELECTED_FIXTURE',
    stageAccounting: null,
    stageAccountingCaptureFailure: null,
    competitorStageAccounting: null,
    competitorStageAccountingCaptureFailure: null,
    sqlReadDiagnostic: {
      scope: 'REFRESH_READ_DIAGNOSTIC_ONLY',
      reason: null,
      status: 'AVAILABLE',
      sqlReadOwnership: {
        scope: 'REFRESH_READ_SQL_OWNERSHIP_ONLY',
        retainedSqlBytes: 40,
        retainedSqlStringChargeBytes: 80,
        returnedSqlBytes: 10,
      },
    },
    sqlPreparation: {
      scope: 'PREPARATION_RETENTION_ONLY',
      retainedSqlBytes: 10,
      retainedSqlStringChargeBytes: 20,
    },
    sqlStage: {
      scope: 'STAGE_SQL_ACCOUNTING_ONLY',
      retainedSqlBytes: 20,
      retainedSqlStringChargeBytes: 40,
      retainedStringChargePeakBytes: 50,
    },
    sqlPreparedStage: {
      scope: 'PREPARATION_STAGE_ACCOUNTING_ONLY',
      preparedSqlBytes: 10,
      stageSqlBytes: 20,
      retainedSqlBytes: 30,
      retainedSqlStringChargeBytes: 60,
      retainedStringChargePeakBytes: 70,
    },
    samples: [
      { phase: 'startup', peakKiB: 100 },
      { phase: 'finished', peakKiB: 110 },
    ],
    peakMethod: 'resourceUsage.maxRSS',
    peakUnits: 'bytes',
    peakScope: 'NODE_PROCESS_LIFETIME_EXCLUDING_CHILD',
    peakResidentBytes: 112640,
    persistentStateVerified: true,
    transactionClosed: true,
    tempClosed: true,
  };
}
const cleanLifecycle = { registered: 1, attempted: 1, succeeded: 1, failed: 0 };

test('D5 enclosing raw owners worker forwards only last same-point scalars without adding them', async () => {
  const { observeRefreshStageAccounting: observe, refreshTransportLifecycleDiagnostic: lifecycle } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  const {
    nativeStageAccountingCheckpoint: emit,
    observeNativeApplySql,
    withNativeApplySqlFields,
  } = await import('../../storage/dist/analysis/native-apply-sql-observation.js');
  const row = lifecycleRow();
  const capture = await observe(
    () =>
      observeNativeApplySql(
        () => {},
        () =>
          withNativeApplySqlFields('outer', ['é'], () =>
            observeNativeApplySql(
              () => {},
              () => withNativeApplySqlFields('inner', ['猫'], () => emit({}, 5, 16)),
            ),
          ),
      ),
    undefined,
    [row.sqlPreparation],
  );
  const summary = capture.diagnostic.stages[0];
  assert.deepEqual(summary.lastEnclosingRawSql, [
    {
      scope: 'ENCLOSING_RAW_SQL_OWNER_CHECKPOINT_ONLY',
      ownerId: 2,
      retainedSqlBytes: 2,
      retainedSqlStringChargeBytes: 4,
    },
  ]);
  assert.equal(summary.lastRawSql.retainedSqlBytes, 3);
  assert.ok(Object.isFrozen(summary.lastEnclosingRawSql));
  assert.ok(Object.isFrozen(summary.lastEnclosingRawSql[0]));
  assert.equal(summary.preparationOverlap.lastSqlBytes, 15);
  assert.equal(summary.preparationOverlap.lastStringChargeBytes, 36);
  row.stageAccounting = capture.diagnostic;
  const result = lifecycle(row, cleanLifecycle, false);
  assert.equal(result.calibrationEligible, false);
  assert.deepEqual(result.sql.stageCheckpoints.main, capture.diagnostic);
});

test('D5 enclosing raw owners lifecycle rejects missing, aliased and unsafe ancestor evidence', async () => {
  const { observeRefreshStageAccounting: observe, refreshTransportLifecycleDiagnostic: lifecycle } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  const { nativeStageAccountingCheckpoint: emit, observeNativeApplySql } =
    await import('../../storage/dist/analysis/native-apply-sql-observation.js');
  const row = lifecycleRow();
  const capture = await observe(
    () =>
      observeNativeApplySql(
        () => {},
        () => emit({}, 5, 16),
      ),
    undefined,
    [row.sqlPreparation],
  );
  const summary = capture.diagnostic.stages[0];
  const ancestor = {
    scope: 'ENCLOSING_RAW_SQL_OWNER_CHECKPOINT_ONLY',
    ownerId: 2,
    retainedSqlBytes: 2,
    retainedSqlStringChargeBytes: 4,
  };
  for (const ancestors of [
    undefined,
    null,
    [ancestor, ancestor],
    [{ ...ancestor, ownerId: summary.lastRawSql.ownerId }],
    [{ ...ancestor, retainedSqlBytes: -1 }],
    [{ ...ancestor, retainedSqlStringChargeBytes: 1 }],
    [{ ...ancestor, scope: 'UNKNOWN' }],
  ]) {
    row.stageAccounting = {
      ...capture.diagnostic,
      stages: [{ ...summary, lastEnclosingRawSql: ancestors }],
    };
    assert.throws(() => lifecycle(row, cleanLifecycle, false));
  }
});

test('D5 enclosing raw owners lifecycle keeps only scalar ancestor fields', async () => {
  const { observeRefreshStageAccounting: observe, refreshTransportLifecycleDiagnostic: lifecycle } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  const { nativeStageAccountingCheckpoint: emit, observeNativeApplySql } =
    await import('../../storage/dist/analysis/native-apply-sql-observation.js');
  const row = lifecycleRow();
  const capture = await observe(
    () =>
      observeNativeApplySql(
        () => {},
        () => emit({}, 5, 16),
      ),
    undefined,
    [row.sqlPreparation],
  );
  const extra = { mutable: true };
  row.stageAccounting = {
    ...capture.diagnostic,
    stages: [
      {
        ...capture.diagnostic.stages[0],
        lastEnclosingRawSql: [
          {
            scope: 'ENCLOSING_RAW_SQL_OWNER_CHECKPOINT_ONLY',
            ownerId: 2,
            retainedSqlBytes: 2,
            retainedSqlStringChargeBytes: 4,
            extra,
          },
        ],
      },
    ],
  };
  const normalized = lifecycle(row, cleanLifecycle, false).sql.stageCheckpoints.main.stages[0]
    .lastEnclosingRawSql[0];
  assert.deepEqual(normalized, {
    scope: 'ENCLOSING_RAW_SQL_OWNER_CHECKPOINT_ONLY',
    ownerId: 2,
    retainedSqlBytes: 2,
    retainedSqlStringChargeBytes: 4,
  });
  assert.ok(Object.isFrozen(normalized));
  assert.equal(normalized.extra, undefined);
});

test('D5 budget components worker preserves attribution and lifecycle rejects missing evidence', async () => {
  const { observeRefreshStageAccounting: observe, refreshTransportLifecycleDiagnostic: lifecycle } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  const { nativeStageAccountingCheckpoint: emit } =
    await import('../../storage/dist/analysis/native-apply-sql-observation.js');
  const row = lifecycleRow();
  const parts = {
    scope: 'STAGE_BUDGET_COMPONENTS_ONLY',
    source: 'TOKEN_ADMISSION',
    stageSqlBytes: 3,
    additionalSqlAllowanceBytes: 2,
    otherBudgetChargeBytes: 6,
    resultCopyChargeBytes: 0,
  };
  const stage = {};
  const capture = await observe(
    () => {
      emit(stage, 5, 16);
      emit(stage, 5, 16, parts);
    },
    undefined,
    [row.sqlPreparation],
  );
  const summary = capture.diagnostic.stages[0];
  assert.equal(summary.budgetComponentCheckpoints, 1);
  assert.equal(summary.budgetComponentsAbsentCheckpoints, 1);
  assert.deepEqual(summary.lastBudgetComponents, parts);
  assert.ok(Object.isFrozen(summary.lastBudgetComponents));
  assert.equal(summary.preparationOverlap.lastSqlBytes, 15);
  assert.equal(summary.preparationOverlap.lastStringChargeBytes, 36);
  row.stageAccounting = capture.diagnostic;
  assert.equal(lifecycle(row, cleanLifecycle, false).calibrationEligible, false);
  for (const broken of [
    { ...summary, lastBudgetComponents: undefined },
    { ...summary, budgetComponentCheckpoints: 0 },
    { ...summary, budgetComponentsAbsentCheckpoints: -1 },
    { ...summary, lastBudgetComponents: { ...parts, otherBudgetChargeBytes: 0 } },
  ]) {
    row.stageAccounting = { ...capture.diagnostic, stages: [broken] };
    assert.throws(() => lifecycle(row, cleanLifecycle, false));
  }
});

test('D5 budget components lifecycle refuses missing attribution independently of capture', async () => {
  const { observeRefreshStageAccounting: observe, refreshTransportLifecycleDiagnostic: lifecycle } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  const { nativeStageAccountingCheckpoint: emit } =
    await import('../../storage/dist/analysis/native-apply-sql-observation.js');
  const row = lifecycleRow();
  const capture = await observe(() => emit({}, 5, 16), undefined, [row.sqlPreparation]);
  row.stageAccounting = {
    ...capture.diagnostic,
    stages: [
      {
        ...capture.diagnostic.stages[0],
        budgetComponentCheckpoints: 1,
        budgetComponentsAbsentCheckpoints: 0,
        lastBudgetComponents: undefined,
      },
    ],
  };
  assert.throws(() => lifecycle(row, cleanLifecycle, false));
});

test('D5 same-point raw worker retains bounded side-by-side evidence without adding it', async () => {
  const { observeRefreshStageAccounting: observe } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  const {
    nativeStageAccountingCheckpoint: emit,
    observeNativeApplySql,
    withNativeApplySqlFields,
  } = await import('../../storage/dist/analysis/native-apply-sql-observation.js');
  const stage = {};
  const capture = await observe(
    () => {
      emit(stage, 20, 50);
      observeNativeApplySql(
        () => {},
        () => {
          emit(stage, 20, 50);
          withNativeApplySqlFields('point', ['猫'], () => emit(stage, 20, 50));
        },
      );
    },
    undefined,
    [
      {
        scope: 'PREPARATION_RETENTION_ONLY',
        retainedSqlBytes: 10,
        retainedSqlStringChargeBytes: 20,
      },
    ],
  );
  const summary = capture.diagnostic.stages[0];
  assert.equal(summary.rawSqlCheckpoints, 2);
  assert.equal(summary.rawSqlAbsentCheckpoints, 1);
  assert.deepEqual(summary.lastRawSql, {
    scope: 'CURRENT_RAW_SQL_OWNER_CHECKPOINT_ONLY',
    ownerId: 1,
    retainedSqlBytes: 3,
    retainedSqlStringChargeBytes: 6,
  });
  assert.ok(Object.isFrozen(summary.lastRawSql));
  assert.equal(summary.preparationOverlap.lastSqlBytes, 30);
  assert.equal(summary.preparationOverlap.lastStringChargeBytes, 70);
});

test('D5 same-point raw lifecycle refuses missing or incoherent evidence and stays uncalibrated', async () => {
  const { observeRefreshStageAccounting: observe, refreshTransportLifecycleDiagnostic: lifecycle } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  const { nativeStageAccountingCheckpoint: emit, observeNativeApplySql } =
    await import('../../storage/dist/analysis/native-apply-sql-observation.js');
  const row = lifecycleRow();
  const capture = await observe(
    () => {
      observeNativeApplySql(
        () => {},
        () => emit({}, 20, 50),
      );
    },
    undefined,
    [row.sqlPreparation],
  );
  const summary = capture.diagnostic.stages[0];
  for (const broken of [
    { ...summary, rawSqlCheckpoints: undefined },
    { ...summary, rawSqlAbsentCheckpoints: -1 },
    { ...summary, rawSqlCheckpoints: 0 },
    { ...summary, lastRawSql: undefined },
    { ...summary, lastRawSql: { ...summary.lastRawSql, ownerId: 0 } },
    { ...summary, lastRawSql: { ...summary.lastRawSql, retainedSqlStringChargeBytes: 1 } },
  ]) {
    row.stageAccounting = { ...capture.diagnostic, stages: [broken] };
    assert.throws(() => lifecycle(row, cleanLifecycle, false));
  }
  row.stageAccounting = capture.diagnostic;
  const result = lifecycle(row, cleanLifecycle, false);
  assert.equal(result.calibrationEligible, false);
  assert.deepEqual(result.sql.stageCheckpoints.main, capture.diagnostic);
});

test('D5 Stage overlap joins the same checkpoint, not independent maxima', async () => {
  const { refreshPreparedStageCheckpoint: checkpoint } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof checkpoint, 'function', 'Same-point Stage overlap missing');
  const preparation = {
    scope: 'PREPARATION_RETENTION_ONLY',
    retainedSqlBytes: 10,
    retainedSqlStringChargeBytes: 20,
  };
  const second = { ...preparation, retainedSqlBytes: 7, retainedSqlStringChargeBytes: 14 };
  const point = (sql, mixed) => ({
    scope: 'STAGE_ACCOUNTING_CHECKPOINT_ONLY',
    stageId: 1,
    retainedSqlBytes: sql,
    retainedStringChargeBytes: mixed,
  });
  assert.deepEqual(checkpoint([preparation], point(5, 16)), {
    scope: 'PREPARATIONS_STAGE_CHECKPOINT_ACCOUNTING_ONLY',
    stageId: 1,
    preparationCount: 1,
    preparedSqlBytes: 10,
    stageSqlBytes: 5,
    retainedSqlBytes: 15,
    retainedSqlStringChargeBytes: 30,
    retainedStringChargeBytes: 36,
  });
  const next = checkpoint([preparation], point(3, 22));
  assert.equal(next.retainedSqlBytes, 13);
  assert.equal(next.retainedStringChargeBytes, 42);
  const competitor = checkpoint([preparation, second], point(5, 16));
  assert.equal(competitor.retainedSqlBytes, 22);
  assert.equal(competitor.retainedStringChargeBytes, 50);
  assert.equal(competitor.preparationCount, 2);
  assert.ok(Object.isFrozen(competitor));
});

test('D5 Stage overlap refuses missing, aliased, historical and unsafe evidence', async () => {
  const { refreshPreparedStageCheckpoint: checkpoint } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof checkpoint, 'function', 'Same-point Stage overlap missing');
  const preparation = {
    scope: 'PREPARATION_RETENTION_ONLY',
    retainedSqlBytes: 10,
    retainedSqlStringChargeBytes: 20,
  };
  const record = {
    scope: 'STAGE_ACCOUNTING_CHECKPOINT_ONLY',
    stageId: 1,
    retainedSqlBytes: 5,
    retainedStringChargeBytes: 16,
  };
  for (const preparations of [
    undefined,
    [],
    [preparation, preparation],
    [preparation, {}, {}],
    [{}],
    [{ ...preparation, retainedSqlStringChargeBytes: 0 }],
    [{ ...preparation, retainedSqlBytes: Number.MAX_SAFE_INTEGER }],
  ])
    assert.throws(() => checkpoint(preparations, record));
  for (const broken of [
    null,
    { ...record, scope: 'STAGE_SQL_ACCOUNTING_ONLY' },
    { ...record, stageId: 0 },
    { ...record, retainedSqlBytes: NaN },
    { ...record, retainedStringChargeBytes: 9 },
    { ...record, retainedStringChargeBytes: Number.MAX_SAFE_INTEGER },
  ])
    assert.throws(() => checkpoint([preparation], broken));
});

test('D5 Stage overlap capture preserves failures and independent instance aggregates', async () => {
  const { observeRefreshStageAccounting: observe } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  const { nativeStageAccountingCheckpoint: emit } =
    await import('../../storage/dist/analysis/native-apply-sql-observation.js');
  const preparation = {
    scope: 'PREPARATION_RETENTION_ONLY',
    retainedSqlBytes: 10,
    retainedSqlStringChargeBytes: 20,
  };
  const a = {},
    b = {};
  const capture = await observe(
    () => {
      emit(a, 5, 16);
      emit(b, 9, 18);
      emit(a, 3, 22);
      return 0;
    },
    undefined,
    [preparation],
  );
  assert.equal(capture.value, 0);
  assert.equal(capture.threw, false);
  assert.equal(capture.captureFailed, false);
  assert.deepEqual(
    capture.diagnostic.stages.map((s) => s.preparationOverlap),
    [
      {
        scope: 'PREPARATIONS_STAGE_CHECKPOINT_AGGREGATE_ONLY',
        preparationCount: 1,
        preparedSqlBytes: 10,
        checkpoints: 2,
        maximumSqlBytes: 15,
        maximumStringChargeBytes: 42,
        lastSqlBytes: 13,
        lastStringChargeBytes: 42,
      },
      {
        scope: 'PREPARATIONS_STAGE_CHECKPOINT_AGGREGATE_ONLY',
        preparationCount: 1,
        preparedSqlBytes: 10,
        checkpoints: 1,
        maximumSqlBytes: 19,
        maximumStringChargeBytes: 38,
        lastSqlBytes: 19,
        lastStringChargeBytes: 38,
      },
    ],
  );
  assert.ok(Object.isFrozen(capture.diagnostic.stages[0].preparationOverlap));
  const unobserved = await observe(() => emit(a, 5, 16));
  assert.equal(unobserved.diagnostic.stages[0].preparationOverlap, null);
  for (const failure of [undefined, null, false, 0, '', new Error('original')]) {
    const failed = await observe(
      () => {
        emit(a, 5, 16);
        throw failure;
      },
      () => {
        throw 0;
      },
      [preparation],
    );
    assert.equal(failed.threw, true);
    assert.strictEqual(failed.error, failure);
    assert.equal(failed.captureFailed, true);
    assert.strictEqual(failed.captureFailure, 0);
  }
  const invalid = await observe(
    () => {
      emit(a, 5, 16);
      return false;
    },
    undefined,
    [],
  );
  assert.equal(invalid.value, false);
  assert.equal(invalid.threw, false);
  assert.equal(invalid.captureFailed, true);
  assert.equal(invalid.diagnostic.stages.length, 0);
});

test('D5 Stage overlap refuses a changing pinned owner without changing the result', async () => {
  const { observeRefreshStageAccounting: observe } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  const { nativeStageAccountingCheckpoint: emit } =
    await import('../../storage/dist/analysis/native-apply-sql-observation.js');
  const preparation = {
    scope: 'PREPARATION_RETENTION_ONLY',
    retainedSqlBytes: 10,
    retainedSqlStringChargeBytes: 20,
  };
  const stage = {};
  const capture = await observe(
    () => {
      emit(stage, 5, 16);
      preparation.retainedSqlBytes = 7;
      preparation.retainedSqlStringChargeBytes = 14;
      emit(stage, 3, 22);
      return '';
    },
    undefined,
    [preparation],
  );
  assert.equal(capture.captureFailed, true);
  assert.equal(capture.threw, false);
  assert.equal(capture.value, '');
  assert.equal(capture.diagnostic.stages[0].checkpoints, 1);
});

test('D5 Stage overlap lifecycle rejects missing capture and incoherent partial aggregates', async () => {
  const { refreshTransportLifecycleDiagnostic: lifecycle } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  for (const prefix of ['stageAccounting', 'competitorStageAccounting']) {
    for (const suffix of ['', 'CaptureFailure']) {
      const row = lifecycleRow();
      delete row[prefix + suffix];
      assert.throws(() => lifecycle(row, cleanLifecycle, false), /Stage accounting/);
    }
    const row = lifecycleRow();
    row[prefix + 'CaptureFailure'] = { value: 0 };
    assert.throws(() => lifecycle(row, cleanLifecycle, false), /Stage accounting/);
  }
  const row = lifecycleRow();
  row.stageAccounting = {
    scope: 'STAGE_ACCOUNTING_CHECKPOINT_AGGREGATE_ONLY',
    stages: [
      {
        stageId: 1,
        checkpoints: 2,
        maximumSqlBytes: 20,
        maximumStringChargeBytes: 50,
        lastSqlBytes: 3,
        lastStringChargeBytes: 10,
        rawSqlCheckpoints: 0,
        rawSqlAbsentCheckpoints: 2,
        lastRawSql: null,
        lastEnclosingRawSql: null,
        budgetComponentCheckpoints: 0,
        budgetComponentsAbsentCheckpoints: 2,
        lastBudgetComponents: null,
        preparationOverlap: {
          scope: 'PREPARATIONS_STAGE_CHECKPOINT_AGGREGATE_ONLY',
          preparationCount: 1,
          preparedSqlBytes: 10,
          checkpoints: 2,
          maximumSqlBytes: 30,
          maximumStringChargeBytes: 70,
          lastSqlBytes: 13,
          lastStringChargeBytes: 30,
        },
      },
    ],
  };
  const diagnostic = lifecycle(row, cleanLifecycle, false);
  assert.deepEqual(diagnostic.sql.stageCheckpoints.main, row.stageAccounting);
  assert.equal(diagnostic.sql.completeRetainedSqlBytes, null);
  assert.equal(diagnostic.calibrationEligible, false);
  for (const mutate of [
    (s) => {
      s.preparationOverlap = null;
    },
    (s) => {
      s.preparationOverlap.lastSqlBytes = 30;
    },
    (s) => {
      s.preparationOverlap.preparationCount = 2;
    },
    (s) => {
      s.preparationOverlap.maximumStringChargeBytes = 90;
    },
    (s) => {
      s.checkpoints = 0;
    },
  ]) {
    const broken = structuredClone(row);
    mutate(broken.stageAccounting.stages[0]);
    assert.throws(() => lifecycle(broken, cleanLifecycle, false));
  }
});

for (const broken of [false, true])
  test(`D5 Stage accounting worker forwards actual checkpoints and original publication: captureFailure=${broken}`, async (t) => {
    const module = await import('./helpers/native-refresh-transport-worker.mjs');
    assert.equal(
      typeof module.observeRefreshStageAccounting,
      'function',
      'Stage worker bridge missing',
    );
    const runtime = await import('../dist/native-refresh-workspace.js');
    const components = [];
    const f = await preparedSourceRefresh(
      t,
      sourceTransitions.find((r) => r.id === 'modify-call-target'),
    );
    const capture = await module.observeRefreshStageAccounting(
      () => runtime.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
      broken
        ? () => {
            throw 0;
          }
        : (record) => components.push(record),
      [module.refreshPreparationSqlDiagnostic(f.prepared)],
    );
    assert.equal(capture.threw, false);
    assert.equal(capture.captureFailed, broken);
    if (broken) assert.strictEqual(capture.captureFailure, 0);
    assert.equal(capture.diagnostic.scope, 'STAGE_ACCOUNTING_CHECKPOINT_AGGREGATE_ONLY');
    assert.equal(capture.diagnostic.stages.length, 1);
    const stage = capture.diagnostic.stages[0];
    assert.equal(stage.stageId, 1);
    assert.ok(stage.checkpoints > 0);
    assert.ok(stage.maximumSqlBytes >= stage.lastSqlBytes);
    assert.ok(stage.maximumStringChargeBytes >= stage.lastStringChargeBytes);
    assert.ok(stage.lastStringChargeBytes >= 2 * stage.lastSqlBytes);
    assert.equal(stage.preparationOverlap.preparationCount, 1);
    assert.equal(stage.preparationOverlap.preparedSqlBytes, f.prepared.retainedSqlBytes);
    assert.equal(
      stage.preparationOverlap.lastSqlBytes,
      f.prepared.retainedSqlBytes + stage.lastSqlBytes,
    );
    assert.equal(
      stage.preparationOverlap.lastStringChargeBytes,
      2 * f.prepared.retainedSqlBytes + stage.lastStringChargeBytes,
    );
    assert.ok(Object.isFrozen(stage));
    assert.equal(stage.budgetComponentCheckpoints, stage.checkpoints);
    assert.equal(stage.budgetComponentsAbsentCheckpoints, 0);
    assert.ok(Object.isFrozen(stage.lastBudgetComponents));
    if (!broken) {
      for (const record of components) {
        const parts = record.budgetComponents;
        assert.equal(
          record.retainedSqlBytes,
          parts.stageSqlBytes + parts.additionalSqlAllowanceBytes,
        );
        assert.equal(
          record.retainedStringChargeBytes,
          2 * record.retainedSqlBytes + parts.otherBudgetChargeBytes + parts.resultCopyChargeBytes,
        );
      }
      for (const source of [
        'ROW_PREFLIGHT',
        'ROW_INSERT_ADMISSION',
        'COMPLETION_ADMISSION',
        'TOKEN_ADMISSION',
        'SEAL_ACTIVE_ADMISSION',
        'APPLY_ACTIVE_ADMISSION',
        'SEAL_RESULT_ADMISSION',
      ])
        assert.ok(
          components.some((record) => record.budgetComponents.source === source),
          source,
        );
    }
    assert.ok(Object.isFrozen(capture.diagnostic.stages));
    assert.equal(f.db.isTransaction, false);
    assert.equal(
      f.db.prepare('SELECT indexed_content_fingerprint AS fp FROM repository_state').get().fp,
      f.prepared.request.payload.targetRevision.contentFingerprint,
    );
  });

for (const prefix of scopedSqlPrefixes) {
  test(`D5 lifecycle refuses absent or undefined scoped fields: ${prefix}`, async () => {
    const { refreshTransportLifecycleDiagnostic: lifecycle } =
      await import('./helpers/native-refresh-transport-worker.mjs');
    for (const suffix of ['', 'Overlap', 'Calls', 'CaptureFailure']) {
      const key = `${prefix}${suffix}`;
      for (const missing of [true, false]) {
        const row = lifecycleRow();
        if (missing) delete row[key];
        else row[key] = undefined;
        assert.throws(() => lifecycle(row, cleanLifecycle, false), /Missing scoped SQL field/);
      }
    }
  });

  test(`D5 lifecycle refuses unsettled synchronous SQL ownership: ${prefix}`, async () => {
    const { refreshTransportLifecycleDiagnostic: lifecycle } =
      await import('./helpers/native-refresh-transport-worker.mjs');
    const row = lifecycleRow();
    row[`${prefix}Calls`] = 1;
    row[prefix] = {
      scope: 'APPLY_RAW_SQL_OWNERSHIP_ONLY',
      retainedSqlBytes: 7,
      retainedSqlStringChargeBytes: 14,
      lastRetainedSqlBytes: 1,
      checkpoints: 2,
      phaseCounts: { ENTER: 1, EXIT: 1 },
    };
    assert.throws(() => lifecycle(row, cleanLifecycle, false), /Unsettled scoped SQL ownership/);
  });

  test(`D5 lifecycle overlap settles to pinned preparation only: ${prefix}`, async () => {
    const module = await import('./helpers/native-refresh-transport-worker.mjs');
    const row = lifecycleRow();
    const competitor = prefix.startsWith('sqlCompetitor');
    if (competitor) {
      row.sqlAdditionalReads = {
        competitor: module.refreshAdditionalReadDiagnostic(
          row.sqlPreparation,
          {
            ...row.sqlReadDiagnostic,
            sqlReadOwnership: { ...row.sqlReadDiagnostic.sqlReadOwnership, returnedSqlBytes: 20 },
          },
          { ...row.sqlPreparation, retainedSqlBytes: 20, retainedSqlStringChargeBytes: 40 },
        ),
        retry: null,
      };
    }
    const pinned = competitor ? 30 : 10;
    row[`${prefix}Calls`] = 1;
    row[prefix] = {
      scope: 'APPLY_RAW_SQL_OWNERSHIP_ONLY',
      retainedSqlBytes: 7,
      retainedSqlStringChargeBytes: 14,
      lastRetainedSqlBytes: 0,
      checkpoints: 2,
      phaseCounts: { ENTER: 1, EXIT: 1 },
    };
    row[`${prefix}Overlap`] = {
      scope: 'PREPARATIONS_RAW_SQL_ACCOUNTING_ONLY',
      preparationCount: competitor ? 2 : 1,
      preparedSqlBytes: pinned,
      scopedSqlHighWaterBytes: 7,
      retainedSqlBytes: pinned + 7,
      retainedSqlStringChargeBytes: 2 * (pinned + 7),
      lastRetainedSqlBytes: pinned,
      checkpoints: 2,
    };
    assert.doesNotThrow(() =>
      module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, false),
    );
    for (const last of [pinned - 1, pinned + 1]) {
      row[`${prefix}Overlap`].lastRetainedSqlBytes = last;
      assert.throws(() => module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, false));
    }
  });
}

test('D5 lifecycle preserves explicit no-call and called-without-TEXT null scopes', async () => {
  const { refreshTransportLifecycleDiagnostic: lifecycle } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  const row = lifecycleRow();
  for (const calls of [0, 1]) {
    for (const prefix of scopedSqlPrefixes) row[`${prefix}Calls`] = calls;
    const report = lifecycle(row, cleanLifecycle, false);
    assert.ok(Object.values(report.sql.preparedOverlaps).every((record) => record === null));
    assert.equal(report.sql.completeRetainedSqlBytes, null);
    assert.equal(report.sql.completeRetainedSqlStringChargeBytes, null);
    assert.equal(report.calibrationEligible, false);
  }
});

test('D5 completion worker bridge forwards actual rows and prepared overlap', async (t) => {
  const worker = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(
    typeof worker.observeRefreshCompletionSql,
    'function',
    'Worker completion bridge missing',
  );
  const module = await import('../dist/native-refresh-workspace.js');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((r) => r.id === 'modify-call-target'),
  );
  const prepared = worker.refreshPreparationSqlDiagnostic(f.prepared);
  const capture = await worker.observeRefreshCompletionSql(
    () => module.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
    undefined,
    [prepared],
  );
  assert.equal(capture.threw, false);
  assert.equal(capture.completionCalls, 1);
  assert.equal(capture.captureFailure, null);
  assert.ok(capture.sql.phaseCounts.STAGE_COMPLETION_EVENT_ROW_ENTER > 0);
  assert.equal(capture.sql.lastRetainedSqlBytes, 0);
  assert.equal(
    capture.preparedSql.retainedSqlBytes,
    prepared.retainedSqlBytes + capture.sql.retainedSqlBytes,
  );
  assert.equal(capture.preparedSql.lastRetainedSqlBytes, prepared.retainedSqlBytes);
});

for (const role of ['Completion', 'CompetitorCompletion'])
  test(`D5 completion lifecycle validates ${role} capture failures and counts`, async () => {
    const { refreshTransportLifecycleDiagnostic: lifecycle } =
      await import('./helpers/native-refresh-transport-worker.mjs');
    const row = lifecycleRow();
    row[`sql${role}CaptureFailure`] = { name: 'Error', message: 'capture failed' };
    assert.throws(() => lifecycle(row, cleanLifecycle, false), /capture failed/i);
    row[`sql${role}CaptureFailure`] = null;
    row[`sql${role}Calls`] = -1;
    assert.throws(() => lifecycle(row, cleanLifecycle, false));
    row[`sql${role}Calls`] = 0;
    const result = lifecycle(row, cleanLifecycle, false);
    const key = role[0].toLowerCase() + role.slice(1);
    assert.strictEqual(result.sql[key], null);
    assert.strictEqual(result.sql.preparedOverlaps[key], null);
    assert.strictEqual(result.sql.completeRetainedSqlBytes, null);
    assert.equal(result.calibrationEligible, false);
  });

test('D5 completion bridge records actual checks without changing normalization ownership', async (t) => {
  const module = await import('../dist/native-refresh-workspace.js');
  assert.equal(
    typeof module.observeNativeRefreshCompletionSql,
    'function',
    'Completion bridge missing',
  );
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((r) => r.id === 'modify-call-target'),
  );
  const completed = [],
    normalized = [];
  const result = await module.observeNativeRefreshCompletionSql(
    () =>
      module.observeNativeRefreshNormalizationSql(
        () => module.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
        (r) => normalized.push(r),
      ),
    (r) => completed.push(r),
  );
  assert.equal(result.threw, false);
  assert.equal(result.value.threw, false);
  assert.equal(result.completionCalls, 1);
  assert.equal(result.value.normalizationCalls, 1);
  assert.equal(result.captureFailed, false);
  assert.ok(completed.some((r) => r.phase === 'STAGE_COMPLETION_EVENT_ROW'));
  assert.ok(normalized.length > 0);
  assert.ok(normalized.every((r) => !r.phase.startsWith('STAGE_COMPLETION_')));
  assert.equal(completed.at(-1).retainedSqlBytes, 0);
  assert.equal(f.db.isTransaction, false);
});

test('D5 completion bridge isolates nested concurrent and settled owners', async (t) => {
  const module = await import('../dist/native-refresh-workspace.js');
  const observe = module.observeNativeRefreshCompletionSql;
  const create = () =>
    preparedSourceRefresh(
      t,
      sourceTransitions.find((r) => r.id === 'modify-call-target'),
    );
  const a = await create(),
    b = await create(),
    c = await create();
  const run = (f) => module.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options);
  let inner,
    innerRecords = 0,
    outerRecords = 0,
    concurrentRecords = 0;
  const [outer, concurrent] = await Promise.all([
    observe(
      async () => {
        inner = await observe(
          () => run(a),
          () => innerRecords++,
        );
        throw null;
      },
      () => outerRecords++,
    ),
    observe(
      () => run(b),
      () => concurrentRecords++,
    ),
  ]);
  assert.equal(inner.threw, false);
  assert.equal(inner.completionCalls, 1);
  assert.ok(innerRecords > 0);
  assert.equal(outer.completionCalls, 0);
  assert.equal(outerRecords, 0);
  assert.equal(outer.threw, true);
  assert.strictEqual(outer.error, null);
  assert.equal(concurrent.threw, false);
  assert.equal(concurrent.completionCalls, 1);
  assert.ok(concurrentRecords > 0);
  let release,
    delayed,
    lateRecords = 0;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const settled = await observe(
    () => {
      delayed = gate.then(() => run(c));
      return undefined;
    },
    () => lateRecords++,
  );
  release();
  await delayed;
  assert.equal(settled.completionCalls, 0);
  assert.equal(lateRecords, 0);
  assert.equal((await import('../dist/index.js')).observeNativeRefreshCompletionSql, undefined);
  for (const value of [0, null, undefined, '']) {
    const absent = await observe(
      () => value,
      () => assert.fail(),
    );
    assert.equal(absent.threw, false);
    assert.strictEqual(absent.value, value);
    assert.equal(absent.completionCalls, 0);
    const failed = await observe(
      () => {
        throw value;
      },
      () => assert.fail(),
    );
    assert.equal(failed.threw, true);
    assert.strictEqual(failed.error, value);
    assert.equal(failed.completionCalls, 0);
  }
});

test('D5 completion bridge records corrupt diagnostic SQL without publishing', async (t) => {
  const module = await import('../dist/native-refresh-workspace.js');
  const { RepositoryPatchStage } = await import('../../storage/dist/index.js');
  const { activationImage } = await import('./helpers/native-refresh-source-fixture.mjs');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((r) => r.id === 'modify-call-target'),
  );
  const before = activationImage(f.db);
  const read = RepositoryPatchStage.prototype.readDiagnostics;
  const records = [];
  RepositoryPatchStage.prototype.readDiagnostics = function* () {
    // Corrupt TEMP input only, before its real SQL read and JSON parser.
    f.db.prepare("INSERT INTO temp.patch_event(kind,payload) VALUES ('DIAGNOSTIC','{')").run();
    yield* read.call(this);
  };
  let capture;
  try {
    capture = await module.observeNativeRefreshCompletionSql(
      () => module.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
      (r) => records.push(r),
    );
  } finally {
    RepositoryPatchStage.prototype.readDiagnostics = read;
  }
  assert.equal(capture.threw, true);
  assert.ok(capture.error instanceof SyntaxError);
  assert.equal(capture.captureFailed, false);
  assert.equal(capture.completionCalls, 1);
  assert.deepEqual(
    records.map((r) => [r.phase, r.boundary, r.retainedSqlBytes]),
    [
      ['STAGE_EVENT_ROW', 'ENTER', 1],
      ['STAGE_EVENT_ROW', 'EXIT', 0],
    ],
  );
  assert.deepEqual(activationImage(f.db), before);
  assert.equal(f.db.isTransaction, false);
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM sqlite_temp_master WHERE name LIKE 'patch_%'").get().n,
    0,
  );
});

for (const captureFails of [false, true])
  test(`D5 completion bridge preserves actual falsy failure and recovery; capture=${captureFails}`, async (t) => {
    const module = await import('../dist/native-refresh-workspace.js');
    assert.equal(
      typeof module.observeNativeRefreshCompletionSql,
      'function',
      'Completion bridge missing',
    );
    const f = await preparedSourceRefresh(
      t,
      sourceTransitions.find((r) => r.id === 'modify-call-target'),
    );
    const { activationImage } = await import('./helpers/native-refresh-source-fixture.mjs');
    const { RepositoryPatchStage } = await import('../../storage/dist/index.js');
    const before = activationImage(f.db);
    const original = RepositoryPatchStage.prototype.confirmNativeSucceeded;
    RepositoryPatchStage.prototype.confirmNativeSucceeded = function (...args) {
      original.apply(this, args);
      throw undefined;
    };
    let result;
    try {
      result = await module.observeNativeRefreshCompletionSql(
        () => module.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
        () => {
          if (captureFails) throw 0;
        },
      );
    } finally {
      RepositoryPatchStage.prototype.confirmNativeSucceeded = original;
    }
    assert.equal(result.threw, true);
    assert.strictEqual(result.error, undefined);
    assert.equal(result.captureFailed, captureFails);
    if (captureFails) assert.strictEqual(result.captureFailure, 0);
    assert.equal(result.completionCalls, 1);
    assert.deepEqual(activationImage(f.db), before);
    assert.equal(f.db.isTransaction, false);
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM sqlite_temp_master WHERE name LIKE 'patch_%'").get()
        .n,
      0,
    );
  });

test('D5 prepared SQL checkpoint joins only simultaneous owners', async () => {
  const { refreshPreparedSqlCheckpoint: join } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof join, 'function');
  const preparation = {
    scope: 'PREPARATION_RETENTION_ONLY',
    retainedSqlBytes: 10,
    retainedSqlStringChargeBytes: 20,
  };
  const record = {
    scope: 'APPLY_RAW_SQL_OWNERSHIP_ONLY',
    phase: 'STAGE_EVENT_ROW',
    boundary: 'ENTER',
    retainedSqlBytes: 7,
    retainedSqlStringChargeBytes: 14,
  };
  assert.deepEqual(join([preparation], record), {
    scope: 'PREPARATIONS_RAW_SQL_ACCOUNTING_ONLY',
    preparationCount: 1,
    preparedSqlBytes: 10,
    scopedSqlBytes: 7,
    retainedSqlBytes: 17,
    retainedSqlStringChargeBytes: 34,
  });
  // Equal values from an independent read are distinct owners; aliases are not.
  assert.equal(join([preparation, { ...preparation }], record).retainedSqlBytes, 27);
  assert.throws(() => join([preparation, preparation], record));
  assert.equal(
    join([preparation], {
      ...record,
      boundary: 'EXIT',
      retainedSqlBytes: 0,
      retainedSqlStringChargeBytes: 0,
    }).retainedSqlBytes,
    10,
  );
});

test('D5 prepared SQL checkpoint refuses missing, wrong or unsafe ownership', async () => {
  const { refreshPreparedSqlCheckpoint: join } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof join, 'function');
  const p = {
    scope: 'PREPARATION_RETENTION_ONLY',
    retainedSqlBytes: 10,
    retainedSqlStringChargeBytes: 20,
  };
  const r = {
    scope: 'APPLY_RAW_SQL_OWNERSHIP_ONLY',
    phase: 'STORE_POINTER',
    boundary: 'ENTER',
    retainedSqlBytes: 7,
    retainedSqlStringChargeBytes: 14,
  };
  for (const owners of [
    [],
    [null],
    [p, { ...p }, { ...p }],
    [{ ...p, scope: 'STAGE_SQL_ACCOUNTING_ONLY' }],
    [{ ...p, retainedSqlStringChargeBytes: 19 }],
  ])
    assert.throws(() => join(owners, r));
  for (const change of [
    { scope: 'STAGE_SQL_ACCOUNTING_ONLY' },
    { boundary: 'UNKNOWN' },
    { phase: '' },
    { retainedSqlBytes: -1 },
    { retainedSqlStringChargeBytes: 13 },
    {
      retainedSqlBytes: Number.MAX_SAFE_INTEGER,
      retainedSqlStringChargeBytes: Number.MAX_SAFE_INTEGER,
    },
  ])
    assert.throws(() => join([p], { ...r, ...change }));
  const large = {
    ...p,
    retainedSqlBytes: 2251799813685247,
    retainedSqlStringChargeBytes: 4503599627370494,
  };
  assert.throws(() =>
    join([large, { ...large }], { ...r, retainedSqlBytes: 2, retainedSqlStringChargeBytes: 4 }),
  );
});

for (const role of ['Normalize', 'Seal', 'Apply'])
  test(`D5 prepared SQL forwarding observes actual ${role} checkpoints`, async (t) => {
    const worker = await import('./helpers/native-refresh-transport-worker.mjs');
    const runtime = await import('../dist/native-refresh-workspace.js');
    const f = await preparedSourceRefresh(
      t,
      sourceTransitions.find((r) => r.id === 'modify-call-target'),
    );
    const preparation = worker.refreshPreparationSqlDiagnostic(f.prepared);
    let checkpoints = 0,
      joinedPeak = 0,
      last = null;
    const capture = await worker[`observeRefresh${role}Sql`](
      () => runtime.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
      (record) => {
        checkpoints++;
        const bytes = preparation.retainedSqlBytes + record.retainedSqlBytes;
        joinedPeak = Math.max(joinedPeak, bytes);
        last = bytes;
      },
      [preparation],
    );
    assert.equal(capture.threw, false);
    assert.equal(capture.captureFailure, null);
    assert.ok(checkpoints > 0);
    assert.ok(capture.preparedSql, 'Missing simultaneous preparation/SQL forwarding');
    assert.deepEqual(capture.preparedSql, {
      scope: 'PREPARATIONS_RAW_SQL_ACCOUNTING_ONLY',
      preparationCount: 1,
      preparedSqlBytes: preparation.retainedSqlBytes,
      checkpoints,
      scopedSqlHighWaterBytes: capture.sql.retainedSqlBytes,
      retainedSqlBytes: joinedPeak,
      retainedSqlStringChargeBytes: 2 * joinedPeak,
      lastRetainedSqlBytes: last,
    });
    assert.equal(last, preparation.retainedSqlBytes);
    assert.equal(f.db.isTransaction, false);
  });

test('D5 prepared SQL forwarding leaves absent checkpoints unavailable', async () => {
  const worker = await import('./helpers/native-refresh-transport-worker.mjs');
  for (const role of ['Completion', 'Normalize', 'Seal', 'Apply']) {
    const capture = await worker[`observeRefresh${role}Sql`](() => undefined, undefined, []);
    assert.equal(capture.threw, false);
    assert.equal(capture.value, undefined);
    assert.equal(capture.captureFailure, null);
    assert.equal(capture.sql, null);
    assert.equal(capture.preparedSql, null);
  }
});

for (const captureFails of [false, true])
  test(`D5 prepared SQL forwarding preserves real normalization failure; capture=${captureFails}`, async (t) => {
    const worker = await import('./helpers/native-refresh-transport-worker.mjs');
    const runtime = await import('../dist/native-refresh-workspace.js');
    const { RepositoryPatchStage } = await import('../../storage/dist/index.js');
    const { activationImage } = await import('./helpers/native-refresh-source-fixture.mjs');
    const f = await preparedSourceRefresh(
      t,
      sourceTransitions.find((r) => r.id === 'modify-call-target'),
    );
    const before = activationImage(f.db);
    const put = RepositoryPatchStage.prototype.putNormalizedEdge;
    let inserted = false,
      capture;
    RepositoryPatchStage.prototype.putNormalizedEdge = function (...args) {
      put.apply(this, args);
      inserted = true;
      throw 0;
    };
    try {
      capture = await worker.observeRefreshNormalizeSql(
        () => runtime.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
        captureFails
          ? () => {
              throw '';
            }
          : undefined,
        [worker.refreshPreparationSqlDiagnostic(f.prepared)],
      );
    } finally {
      RepositoryPatchStage.prototype.putNormalizedEdge = put;
    }
    assert.equal(inserted, true);
    assert.equal(capture.threw, true);
    assert.strictEqual(capture.error, 0);
    assert.notEqual(capture.preparedSql, null);
    if (captureFails) assert.equal(typeof capture.captureFailure, 'string');
    else {
      assert.equal(capture.captureFailure, null);
      assert.equal(capture.preparedSql.lastRetainedSqlBytes, f.prepared.retainedSqlBytes);
    }
    assert.deepEqual(activationImage(f.db), before);
    assert.equal(f.db.isTransaction, false);
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM sqlite_temp_master WHERE name LIKE 'patch_%'").get()
        .n,
      0,
    );
  });

test('D5 prepared SQL lifecycle validates pinned handoffs without summing disjoint peaks', async () => {
  const { refreshTransportLifecycleDiagnostic: lifecycle } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  const row = lifecycleRow();
  row.sqlNormalizeCalls = 1;
  row.sqlNormalize = {
    scope: 'APPLY_RAW_SQL_OWNERSHIP_ONLY',
    retainedSqlBytes: 7,
    retainedSqlStringChargeBytes: 14,
    lastRetainedSqlBytes: 0,
    checkpoints: 2,
    phaseCounts: { STAGE_EVENT_ROW_ENTER: 1, STAGE_EVENT_ROW_EXIT: 1 },
  };
  row.sqlNormalizeOverlap = {
    scope: 'PREPARATIONS_RAW_SQL_ACCOUNTING_ONLY',
    preparationCount: 1,
    preparedSqlBytes: 10,
    scopedSqlHighWaterBytes: 7,
    retainedSqlBytes: 17,
    retainedSqlStringChargeBytes: 34,
    lastRetainedSqlBytes: 10,
    checkpoints: 2,
  };
  const result = lifecycle(row, cleanLifecycle, false);
  assert.ok(result.sql.preparedOverlaps, 'Missing overlap lifecycle validation');
  assert.deepEqual(result.sql.preparedOverlaps.normalize, row.sqlNormalizeOverlap);
  assert.equal(result.sql.preparedOverlaps.seal, null);
  assert.equal(result.sql.knownScopedHighWaterBytes, 40);
  assert.equal(result.sql.completeRetainedSqlBytes, null);
  assert.equal(result.calibrationEligible, false);
  assert.ok(Object.isFrozen(result.sql.preparedOverlaps.normalize));
  const valid = row.sqlNormalizeOverlap;
  for (const change of [
    { preparationCount: 2 },
    { preparedSqlBytes: 11 },
    { scopedSqlHighWaterBytes: 8 },
    { retainedSqlBytes: 18 },
    { retainedSqlStringChargeBytes: 33 },
    { lastRetainedSqlBytes: 9 },
    { checkpoints: 3 },
    { scope: 'STAGE_SQL_ACCOUNTING_ONLY' },
  ]) {
    row.sqlNormalizeOverlap = { ...valid, ...change };
    assert.throws(() => lifecycle(row, cleanLifecycle, false));
  }
  row.sqlNormalizeOverlap = valid;
  row.sqlNormalize = null;
  assert.throws(() => lifecycle(row, cleanLifecycle, false));
});

test('D5 prepared SQL lifecycle refuses missing preparation rather than inventing zero', async () => {
  const { refreshTransportLifecycleDiagnostic: lifecycle } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  const row = lifecycleRow();
  row.sqlReadDiagnostic = null;
  row.sqlPreparation = null;
  row.sqlStage = null;
  row.sqlPreparedStage = null;
  row.sqlNormalizeCalls = 1;
  row.sqlNormalize = {
    scope: 'APPLY_RAW_SQL_OWNERSHIP_ONLY',
    retainedSqlBytes: 7,
    retainedSqlStringChargeBytes: 14,
    lastRetainedSqlBytes: 0,
    checkpoints: 2,
    phaseCounts: { STAGE_EVENT_ROW_ENTER: 1, STAGE_EVENT_ROW_EXIT: 1 },
  };
  row.sqlNormalizeOverlap = {
    scope: 'PREPARATIONS_RAW_SQL_ACCOUNTING_ONLY',
    preparationCount: 1,
    preparedSqlBytes: 0,
    scopedSqlHighWaterBytes: 7,
    retainedSqlBytes: 7,
    retainedSqlStringChargeBytes: 14,
    lastRetainedSqlBytes: 0,
    checkpoints: 2,
  };
  assert.throws(() => lifecycle(row, cleanLifecycle, false));
});

test('D5 normalization bridge observes real rows before seal and preserves publication', async (t) => {
  const module = await import('../dist/native-refresh-workspace.js');
  assert.equal(typeof module.observeNativeRefreshNormalizationSql, 'function');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((r) => r.id === 'modify-call-target'),
  );
  const records = [];
  const result = await module.observeNativeRefreshNormalizationSql(
    () => module.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
    (record) => records.push(record),
  );
  assert.equal(result.threw, false);
  assert.equal(result.captureFailed, false);
  assert.equal(result.normalizationCalls, 1);
  assert.ok(records.some((r) => r.phase === 'STAGE_EVENT_ROW' && r.boundary === 'ENTER'));
  assert.ok(records.some((r) => r.phase === 'STAGE_POINT_SOURCE_ID' && r.boundary === 'ENTER'));
  assert.ok(records.every((r) => !r.phase.startsWith('STORE_')));
  assert.equal(records.at(-1).retainedSqlBytes, 0);
  assert.equal(f.db.isTransaction, false);
});

for (const captureFails of [false, true])
  test(`D5 normalization bridge keeps real loop failure; capture failure=${captureFails}`, async (t) => {
    const module = await import('../dist/native-refresh-workspace.js');
    assert.equal(typeof module.observeNativeRefreshNormalizationSql, 'function');
    const f = await preparedSourceRefresh(
      t,
      sourceTransitions.find((r) => r.id === 'modify-call-target'),
    );
    const { RepositoryPatchStage } = await import('../../storage/dist/index.js');
    const { activationImage } = await import('./helpers/native-refresh-source-fixture.mjs');
    const before = activationImage(f.db);
    const put = RepositoryPatchStage.prototype.putNormalizedEdge;
    const records = [];
    let inserted = false;
    RepositoryPatchStage.prototype.putNormalizedEdge = function (...args) {
      put.apply(this, args);
      inserted = true;
      throw 0;
    };
    let result;
    try {
      result = await module.observeNativeRefreshNormalizationSql(
        () => module.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
        captureFails
          ? () => {
              throw '';
            }
          : (record) => records.push(record),
      );
    } finally {
      RepositoryPatchStage.prototype.putNormalizedEdge = put;
    }
    assert.equal(inserted, true);
    assert.equal(result.threw, true);
    assert.strictEqual(result.error, 0);
    assert.equal(result.captureFailed, captureFails);
    if (captureFails) assert.strictEqual(result.captureFailure, '');
    else {
      assert.equal(result.captureFailure, undefined);
      assert.ok(records.some((r) => r.phase === 'STAGE_EVENT_ROW' && r.boundary === 'ENTER'));
      assert.equal(records.at(-1).retainedSqlBytes, 0);
    }
    assert.equal(result.normalizationCalls, 1);
    assert.deepEqual(activationImage(f.db), before);
    assert.equal(f.db.isTransaction, false);
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM sqlite_temp_master WHERE name LIKE 'patch_%'").get()
        .n,
      0,
    );
  });

test('D5 normalization bridge isolates async owners and preserves absent nullish outcomes', async (t) => {
  const module = await import('../dist/native-refresh-workspace.js');
  assert.equal(typeof module.observeNativeRefreshNormalizationSql, 'function');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((r) => r.id === 'modify-call-target'),
  );
  let outerRecords = 0,
    innerRecords = 0,
    inner;
  const outer = await module.observeNativeRefreshNormalizationSql(
    async () => {
      inner = await module.observeNativeRefreshNormalizationSql(
        () => module.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
        () => innerRecords++,
      );
      throw null;
    },
    () => outerRecords++,
  );
  assert.equal(inner.threw, false);
  assert.equal(inner.normalizationCalls, 1);
  assert.ok(innerRecords > 0);
  assert.equal(outerRecords, 0);
  assert.equal(outer.normalizationCalls, 0);
  assert.equal(outer.threw, true);
  assert.strictEqual(outer.error, null);
  for (const value of [0, null, undefined, '']) {
    const ok = await module.observeNativeRefreshNormalizationSql(
      () => value,
      () => assert.fail(),
    );
    assert.equal(ok.threw, false);
    assert.strictEqual(ok.value, value);
    const failed = await module.observeNativeRefreshNormalizationSql(
      () => {
        throw value;
      },
      () => assert.fail(),
    );
    assert.equal(failed.threw, true);
    assert.strictEqual(failed.error, value);
    assert.equal(failed.normalizationCalls, 0);
  }
});

test('D5 normalization bridge closes inherited async contexts before delayed work', async (t) => {
  const module = await import('../dist/native-refresh-workspace.js');
  const runtime = await import('../dist/index.js');
  assert.equal(runtime.observeNativeRefreshNormalizationSql, undefined);
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((r) => r.id === 'modify-call-target'),
  );
  let release,
    delayed,
    records = 0;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const observed = await module.observeNativeRefreshNormalizationSql(
    () => {
      delayed = gate.then(() =>
        module.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
      );
      return null;
    },
    () => records++,
  );
  assert.equal(observed.normalizationCalls, 0);
  release();
  await delayed;
  assert.equal(records, 0);
  assert.equal(observed.captureFailed, false);
  assert.equal(f.db.isTransaction, false);
});

test('D5 seal worker captures actual validation and restores the serial hook', async (t) => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.observeRefreshSealSql, 'function');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((r) => r.id === 'empty-file-noop'),
  );
  const { RepositoryPatchStage } = await import('../../storage/dist/index.js');
  const { applyPreparedNativeRefreshAnalysisV3 } =
    await import('../dist/native-refresh-workspace.js');
  const seal = RepositoryPatchStage.prototype.sealNativePatchState;
  const result = await module.observeRefreshSealSql(() =>
    applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
  );
  assert.equal(result.threw, false);
  assert.equal(result.captureFailure, null);
  assert.equal(result.sealCalls, 1);
  assert.equal(result.sql.phaseCounts.STORE_TOKEN_SCOPE_EXIT, 1);
  assert.equal(result.sql.phaseCounts.STORE_ACTIVE_SUPPORT_SCOPE_EXIT, 1);
  assert.equal(result.sql.phaseCounts.STORE_REVISION_ENTER, undefined);
  assert.equal(result.sql.lastRetainedSqlBytes, 0);
  assert.ok(result.sql.retainedSqlBytes > 0);
  assert.equal(result.sql.retainedSqlStringChargeBytes, 2 * result.sql.retainedSqlBytes);
  assert.ok(Object.isFrozen(result.sql.phaseCounts));
  assert.strictEqual(RepositoryPatchStage.prototype.sealNativePatchState, seal);
  assert.equal(f.db.isTransaction, false);
});

for (const captureFails of [false, true])
  test(`D5 seal worker retains original validation throw; capture failure=${captureFails}`, async (t) => {
    const module = await import('./helpers/native-refresh-transport-worker.mjs');
    assert.equal(typeof module.observeRefreshSealSql, 'function');
    const f = await preparedSourceRefresh(
      t,
      sourceTransitions.find((r) => r.id === 'empty-file-noop'),
    );
    const { activationImage } = await import('./helpers/native-refresh-source-fixture.mjs');
    const { RepositoryPatchStage } = await import('../../storage/dist/index.js');
    const { applyPreparedNativeRefreshAnalysisV3 } =
      await import('../dist/native-refresh-workspace.js');
    const before = activationImage(f.db);
    const seal = RepositoryPatchStage.prototype.sealNativePatchState;
    let validated = false;
    RepositoryPatchStage.prototype.sealNativePatchState = function (expected, token, validate) {
      return seal.call(this, expected, token, (input) => {
        validate(input);
        validated = true;
        throw 0;
      });
    };
    const injected = RepositoryPatchStage.prototype.sealNativePatchState;
    let result;
    try {
      result = await module.observeRefreshSealSql(
        () => applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
        captureFails
          ? () => {
              throw '';
            }
          : undefined,
      );
      assert.strictEqual(RepositoryPatchStage.prototype.sealNativePatchState, injected);
    } finally {
      RepositoryPatchStage.prototype.sealNativePatchState = seal;
    }
    assert.equal(validated, true);
    assert.equal(result.threw, true);
    assert.strictEqual(result.error, 0);
    assert.equal(result.sealCalls, 1);
    if (captureFails) {
      assert.notEqual(result.captureFailure, null);
      assert.equal(result.sql.checkpoints, 1);
    } else {
      assert.equal(result.captureFailure, null);
      assert.equal(result.sql.phaseCounts.STORE_ACTIVE_SUPPORT_SCOPE_EXIT, 1);
      assert.equal(result.sql.lastRetainedSqlBytes, 0);
    }
    assert.deepEqual(activationImage(f.db), before);
    assert.equal(f.db.isTransaction, false);
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM sqlite_temp_master WHERE name LIKE 'patch_%'").get()
        .n,
      0,
    );
  });

test('D5 seal worker isolates nested roles and preserves absent falsy failures', async (t) => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.observeRefreshSealSql, 'function');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((r) => r.id === 'empty-file-noop'),
  );
  const { applyPreparedNativeRefreshAnalysisV3 } =
    await import('../dist/native-refresh-workspace.js');
  let inner;
  const outer = await module.observeRefreshSealSql(async () => {
    inner = await module.observeRefreshSealSql(() =>
      applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
    );
    throw 0;
  });
  assert.equal(inner.sealCalls, 1);
  assert.equal(inner.sql.phaseCounts.STORE_ACTIVE_SUPPORT_SCOPE_EXIT, 1);
  assert.equal(outer.sealCalls, 0);
  assert.equal(outer.sql, null);
  assert.equal(outer.threw, true);
  assert.strictEqual(outer.error, 0);
  for (const error of [null, undefined, '']) {
    const absent = await module.observeRefreshSealSql(() => {
      throw error;
    });
    assert.equal(absent.threw, true);
    assert.strictEqual(absent.error, error);
    assert.equal(absent.sql, null);
    assert.equal(absent.captureFailure, null);
  }
});

test('D5 seal lifecycle validates separate roles without summing peaks', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  const row = lifecycleRow();
  const record = {
    scope: 'APPLY_RAW_SQL_OWNERSHIP_ONLY',
    checkpoints: 2,
    phaseCounts: { STORE_ACTIVE_SUPPORT_RETURN_ENTER: 1, STORE_ACTIVE_SUPPORT_SCOPE_EXIT: 1 },
    retainedSqlBytes: 120,
    retainedSqlStringChargeBytes: 240,
    lastRetainedSqlBytes: 0,
  };
  row.sqlSeal = record;
  row.sqlSealCalls = 1;
  row.sqlCompetitorSeal = { ...record, retainedSqlBytes: 90, retainedSqlStringChargeBytes: 180 };
  row.sqlCompetitorSealCalls = 1;
  const result = module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, false);
  assert.deepEqual(result.sql.seal, record);
  assert.deepEqual(result.sql.competitorSeal, row.sqlCompetitorSeal);
  assert.equal(result.sql.knownScopedHighWaterBytes, 120);
  assert.equal(result.sql.completeRetainedSqlBytes, null);
  assert.equal(result.calibrationEligible, false);
  for (const key of ['sqlSealCaptureFailure', 'sqlCompetitorSealCaptureFailure']) {
    row[key] = 'capture failed';
    assert.throws(() => module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, false));
    row[key] = null;
  }
  for (const bad of [
    { checkpoints: 3 },
    { retainedSqlStringChargeBytes: 239 },
    { lastRetainedSqlBytes: -1 },
  ]) {
    row.sqlSeal = { ...record, ...bad };
    assert.throws(() => module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, false));
  }
});

test('D5 Apply worker observes actual synchronous publication without retaining rows', async (t) => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.observeRefreshApplySql, 'function');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((r) => r.id === 'empty-file-noop'),
  );
  const { RepositoryCanonicalFactStore } = await import('../../storage/dist/index.js');
  const { applyPreparedNativeRefreshAnalysisV3 } =
    await import('../dist/native-refresh-workspace.js');
  const apply = RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch;
  const result = await module.observeRefreshApplySql(() =>
    applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
  );
  assert.equal(result.threw, false);
  assert.equal(result.captureFailure, null);
  assert.equal(result.applyCalls, 1);
  assert.equal(result.sql.scope, 'APPLY_RAW_SQL_OWNERSHIP_ONLY');
  assert.equal(result.sql.phaseCounts.STORE_TOKEN_SCOPE_EXIT, 2);
  assert.equal(result.sql.phaseCounts.STORE_TOKEN_RETURN_ENTER, 2);
  assert.equal(result.sql.phaseCounts.STORE_REVISION_ENTER, 1);
  assert.equal(result.sql.lastRetainedSqlBytes, 0);
  assert.ok(result.sql.retainedSqlBytes > 0);
  assert.equal(result.sql.retainedSqlStringChargeBytes, 2 * result.sql.retainedSqlBytes);
  assert.ok(Object.isFrozen(result.sql));
  assert.ok(Object.isFrozen(result.sql.phaseCounts));
  assert.strictEqual(RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch, apply);
  assert.equal(f.db.isTransaction, false);
});

test('D5 Apply lifecycle keeps scoped peaks separate and refuses invalid capture', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  const row = lifecycleRow();
  row.sqlApplyCalls = 1;
  row.sqlCompetitorApplyCalls = 1;
  const record = (bytes) =>
    Object.freeze({
      scope: 'APPLY_RAW_SQL_OWNERSHIP_ONLY',
      checkpoints: 2,
      phaseCounts: Object.freeze({ STORE_REVISION_ENTER: 1, STORE_REVISION_EXIT: 1 }),
      retainedSqlBytes: bytes,
      retainedSqlStringChargeBytes: 2 * bytes,
      lastRetainedSqlBytes: 0,
    });
  row.sqlApply = record(120);
  row.sqlCompetitorApply = record(90);
  const result = module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, false);
  assert.deepEqual(result.sql.apply, row.sqlApply);
  assert.deepEqual(result.sql.competitorApply, row.sqlCompetitorApply);
  assert.equal(result.sql.knownScopedHighWaterBytes, 120);
  assert.equal(result.sql.completeRetainedSqlBytes, null);
  assert.equal(result.calibrationEligible, false);
  for (const key of ['sqlApplyCaptureFailure', 'sqlCompetitorApplyCaptureFailure']) {
    row[key] = { kind: 'primitive', value: '0' };
    assert.throws(() => module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, false));
    row[key] = null;
  }
  for (const bad of [
    { checkpoints: 3 },
    { retainedSqlStringChargeBytes: 239 },
    { lastRetainedSqlBytes: -1 },
  ]) {
    row.sqlApply = { ...record(120), ...bad };
    assert.throws(() => module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, false));
  }
});

test('D5 Apply worker preserves actual rollback despite diagnostic failure', async (t) => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.observeRefreshApplySql, 'function');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((r) => r.id === 'empty-file-noop'),
  );
  const { activationImage } = await import('./helpers/native-refresh-source-fixture.mjs');
  const { applyPreparedNativeRefreshAnalysisV3 } =
    await import('../dist/native-refresh-workspace.js');
  f.db.exec(
    "CREATE TRIGGER worker_apply_failure AFTER INSERT ON native_analysis_file BEGIN SELECT RAISE(ABORT,'WORKER_SQL_APPLY_FAILED'); END",
  );
  const before = activationImage(f.db);
  let original;
  const result = await module.observeRefreshApplySql(
    async () => {
      try {
        return await applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options);
      } catch (error) {
        original = error;
        throw error;
      }
    },
    () => {
      throw 0;
    },
  );
  assert.equal(result.threw, true);
  assert.strictEqual(result.error, original);
  assert.match(original.message, /WORKER_SQL_APPLY_FAILED/);
  assert.notEqual(result.captureFailure, null);
  assert.equal(result.applyCalls, 1);
  assert.equal(result.sql.checkpoints, 1);
  assert.deepEqual(activationImage(f.db), before);
  assert.equal(f.db.isTransaction, false);
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM sqlite_temp_master WHERE name LIKE 'patch_%'").get().n,
    0,
  );
});

test('D5 Apply worker nested competitor is isolated and absent Apply stays null', async (t) => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.observeRefreshApplySql, 'function');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((r) => r.id === 'empty-file-noop'),
  );
  const { applyPreparedNativeRefreshAnalysisV3 } =
    await import('../dist/native-refresh-workspace.js');
  let inner;
  const outer = await module.observeRefreshApplySql(async () => {
    inner = await module.observeRefreshApplySql(() =>
      applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
    );
    throw 0;
  });
  assert.equal(inner.applyCalls, 1);
  assert.equal(inner.sql.phaseCounts.STORE_TOKEN_SCOPE_EXIT, 2);
  assert.equal(outer.applyCalls, 0);
  assert.equal(outer.sql, null);
  assert.equal(outer.threw, true);
  assert.strictEqual(outer.error, 0);
  for (const error of [null, undefined, '']) {
    const absent = await module.observeRefreshApplySql(async () => {
      throw error;
    });
    assert.equal(absent.threw, true);
    assert.strictEqual(absent.error, error);
    assert.equal(absent.sql, null);
    assert.equal(absent.captureFailure, null);
  }
});

test('D5 competitor Stage adds both pinned preparations without adding read peaks', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.refreshCompetitorStageDiagnostic, 'function');
  const prepared = (bytes) => ({
    retainedSqlBytes: bytes,
    baselineState: { headerJson: 'x', files: [] },
  });
  const stage = {
    scope: 'STAGE_SQL_ACCOUNTING_ONLY',
    retainedSqlBytes: 30,
    retainedSqlStringChargeBytes: 60,
    retainedStringChargePeakBytes: 70,
  };
  const report = module.refreshCompetitorStageDiagnostic(prepared(10), prepared(20), stage);
  assert.deepEqual(report, {
    scope: 'PREPARATIONS_STAGE_ACCOUNTING_ONLY',
    originalPreparedSqlBytes: 10,
    competitorPreparedSqlBytes: 20,
    stageSqlBytes: 30,
    retainedSqlBytes: 60,
    retainedSqlStringChargeBytes: 120,
    retainedStringChargePeakBytes: 130,
  });
  assert.ok(Object.isFrozen(report));
  assert.throws(() =>
    module.refreshCompetitorStageDiagnostic(prepared(10), prepared(20), {
      ...stage,
      retainedSqlStringChargeBytes: 59,
    }),
  );
});
test('D5 competitor Stage observer records actual success and restores close hook', async (t) => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.observeCompetitorRefreshStage, 'function');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((r) => r.id === 'empty-file-noop'),
  );
  const { RepositoryPatchStage } = await import('../../storage/dist/index.js');
  const { applyPreparedNativeRefreshAnalysisV3 } =
    await import('../dist/native-refresh-workspace.js');
  const close = RepositoryPatchStage.prototype.close;
  const observed = await module.observeCompetitorRefreshStage(() =>
    applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
  );
  assert.equal(observed.threw, false);
  assert.equal(observed.captureFailure, null);
  assert.deepEqual(observed.stage, observed.value.stageRetention);
  assert.ok(observed.stage.retainedSqlBytes > 0);
  assert.strictEqual(RepositoryPatchStage.prototype.close, close);
  assert.equal(f.db.isTransaction, false);
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM sqlite_temp_master WHERE name LIKE 'patch_%'").get().n,
    0,
  );
});
test('D5 competitor Stage observer preserves rollback error despite capture failure', async (t) => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.observeCompetitorRefreshStage, 'function');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((r) => r.id === 'empty-file-noop'),
  );
  const { activationImage } = await import('./helpers/native-refresh-source-fixture.mjs');
  const { RepositoryPatchStage } = await import('../../storage/dist/index.js');
  const { applyPreparedNativeRefreshAnalysisV3 } =
    await import('../dist/native-refresh-workspace.js');
  f.db.exec(
    "CREATE TRIGGER competitor_failure AFTER INSERT ON native_analysis_file BEGIN SELECT RAISE(ABORT,'COMPETITOR_APPLY_FAILED'); END",
  );
  const before = activationImage(f.db),
    close = RepositoryPatchStage.prototype.close,
    measure = RepositoryPatchStage.prototype.readNativeRetentionMeasurement;
  let original;
  try {
    RepositoryPatchStage.prototype.readNativeRetentionMeasurement = () => {
      throw 0;
    };
    const observed = await module.observeCompetitorRefreshStage(async () => {
      try {
        await applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options);
      } catch (error) {
        original = error;
        throw error;
      }
    });
    assert.equal(observed.threw, true);
    assert.strictEqual(observed.error, original);
    assert.match(original.message, /COMPETITOR_APPLY_FAILED/);
    assert.ok(observed.captureFailure);
    assert.equal(observed.stage, null);
    assert.strictEqual(RepositoryPatchStage.prototype.close, close);
    assert.deepEqual(activationImage(f.db), before);
    assert.equal(f.db.isTransaction, false);
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM sqlite_temp_master WHERE name LIKE 'patch_%'").get()
        .n,
      0,
    );
  } finally {
    RepositoryPatchStage.prototype.readNativeRetentionMeasurement = measure;
  }
});
test('D5 competitor Stage observer keeps missing Stage null and falsy original throws', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.observeCompetitorRefreshStage, 'function');
  const { RepositoryPatchStage } = await import('../../storage/dist/index.js');
  const close = RepositoryPatchStage.prototype.close;
  for (const error of [0, null, undefined, '']) {
    const observed = await module.observeCompetitorRefreshStage(async () => {
      throw error;
    });
    assert.equal(observed.threw, true);
    assert.strictEqual(observed.error, error);
    assert.equal(observed.stage, null);
    assert.equal(observed.captureFailure, null);
    assert.strictEqual(RepositoryPatchStage.prototype.close, close);
  }
});
test('D5 competitor Stage close failure retains identity and restores the inherited hook', async (t) => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((r) => r.id === 'empty-file-noop'),
  );
  const { RepositoryPatchStage } = await import('../../storage/dist/index.js');
  const { applyPreparedNativeRefreshAnalysisV3 } =
    await import('../dist/native-refresh-workspace.js');
  const close = RepositoryPatchStage.prototype.close;
  const inherited = function (...args) {
    close.apply(this, args);
    throw 0;
  };
  try {
    RepositoryPatchStage.prototype.close = inherited;
    const observed = await module.observeCompetitorRefreshStage(() =>
      applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
    );
    assert.equal(observed.threw, true);
    assert.strictEqual(observed.error, 0);
    assert.equal(observed.captureFailure, null);
    assert.ok(observed.stage.retainedSqlBytes > 0);
    assert.strictEqual(RepositoryPatchStage.prototype.close, inherited);
    assert.equal(f.db.isTransaction, false);
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM sqlite_temp_master WHERE name LIKE 'patch_%'").get()
        .n,
      0,
    );
  } finally {
    RepositoryPatchStage.prototype.close = close;
  }
});
test('D5 competitor Stage lifecycle checks both owners and takes a maximum of scoped peaks', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  const row = lifecycleRow();
  row.sqlAdditionalReads = {
    competitor: module.refreshAdditionalReadDiagnostic(
      row.sqlPreparation,
      {
        ...row.sqlReadDiagnostic,
        sqlReadOwnership: { ...row.sqlReadDiagnostic.sqlReadOwnership, returnedSqlBytes: 20 },
      },
      { ...row.sqlPreparation, retainedSqlBytes: 20, retainedSqlStringChargeBytes: 40 },
    ),
    retry: null,
  };
  row.sqlCompetitorStage = {
    scope: 'PREPARATIONS_STAGE_ACCOUNTING_ONLY',
    originalPreparedSqlBytes: 10,
    competitorPreparedSqlBytes: 20,
    stageSqlBytes: 30,
    retainedSqlBytes: 60,
    retainedSqlStringChargeBytes: 120,
    retainedStringChargePeakBytes: 130,
  };
  const report = module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, false);
  assert.equal(report.sql.knownScopedHighWaterBytes, 60, 'Not read50 + competitorStage60');
  assert.equal(report.sql.completeRetainedSqlBytes, null);
  assert.equal(report.calibrationEligible, false);
  for (const [key, value] of [
    ['originalPreparedSqlBytes', 11],
    ['competitorPreparedSqlBytes', 21],
    ['stageSqlBytes', 31],
    ['retainedSqlStringChargeBytes', 119],
    ['retainedStringChargePeakBytes', 119],
  ]) {
    const record = row.sqlCompetitorStage;
    row.sqlCompetitorStage = { ...record, [key]: value };
    assert.throws(() => module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, false));
    row.sqlCompetitorStage = record;
  }
  row.sqlCompetitorStageCaptureFailure = { kind: 'capture' };
  assert.throws(() => module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, false));
});

test('D5 additional read ownership joins only the pinned preparation and its actual read', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.refreshAdditionalReadDiagnostic, 'function');
  const row = lifecycleRow();
  const next = { ...row.sqlPreparation };
  const report = module.refreshAdditionalReadDiagnostic(
    row.sqlPreparation,
    row.sqlReadDiagnostic,
    next,
  );
  assert.equal(report.scope, 'PREPARATION_READ_ACCOUNTING_ONLY');
  assert.equal(report.preparedSqlBytes, 10);
  assert.equal(report.readScopedHighWaterBytes, 40);
  assert.equal(report.additionalPreparationBytes, 10);
  assert.equal(
    report.retainedSqlBytes,
    50,
    'Pinned original plus actual read; not two disjoint maxima',
  );
  assert.equal(report.retainedSqlStringChargeBytes, 100);
  assert.equal(report.readToPreparationVerified, true);
  assert.ok(Object.isFrozen(report));
});
test('D5 additional read ownership retains failures and missing observations without inventing handoffs', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.refreshAdditionalReadDiagnostic, 'function');
  const row = lifecycleRow();
  row.sqlReadDiagnostic.status = 'THREW';
  row.sqlReadDiagnostic.sqlReadOwnership.returnedSqlBytes = null;
  const failed = module.refreshAdditionalReadDiagnostic(row.sqlPreparation, row.sqlReadDiagnostic);
  assert.equal(failed.readStatus, 'THREW');
  assert.equal(failed.retainedSqlBytes, 50);
  assert.equal(failed.additionalPreparationBytes, null);
  assert.equal(failed.readToPreparationVerified, null);
  row.sqlReadDiagnostic.sqlReadOwnership = null;
  const absent = module.refreshAdditionalReadDiagnostic(row.sqlPreparation, row.sqlReadDiagnostic);
  assert.equal(absent.retainedSqlBytes, null);
  assert.equal(absent.retainedSqlStringChargeBytes, null);
});
test('D5 additional read ownership refuses wrong handoffs and unsafe pinned overlap', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.refreshAdditionalReadDiagnostic, 'function');
  const row = lifecycleRow();
  assert.throws(() =>
    module.refreshAdditionalReadDiagnostic(row.sqlPreparation, row.sqlReadDiagnostic, {
      ...row.sqlPreparation,
      retainedSqlBytes: 11,
      retainedSqlStringChargeBytes: 22,
    }),
  );
  assert.throws(() =>
    module.refreshAdditionalReadDiagnostic(
      {
        ...row.sqlPreparation,
        retainedSqlBytes: Number.MAX_SAFE_INTEGER,
        retainedSqlStringChargeBytes: 0,
      },
      row.sqlReadDiagnostic,
    ),
  );
});
test('D5 additional read lifecycle keeps competitor and retry scopes separate', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.refreshAdditionalReadDiagnostic, 'function');
  const row = lifecycleRow();
  const competitor = module.refreshAdditionalReadDiagnostic(
    row.sqlPreparation,
    row.sqlReadDiagnostic,
    row.sqlPreparation,
  );
  const retry = module.refreshAdditionalReadDiagnostic(
    row.sqlPreparation,
    {
      ...row.sqlReadDiagnostic,
      sqlReadOwnership: {
        ...row.sqlReadDiagnostic.sqlReadOwnership,
        retainedSqlBytes: 60,
        retainedSqlStringChargeBytes: 120,
      },
    },
    row.sqlPreparation,
  );
  row.sqlAdditionalReads = { competitor, retry };
  const report = module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, false);
  assert.deepEqual(report.sql.additionalReads, { competitor, retry });
  assert.equal(report.sql.knownScopedHighWaterBytes, 70, 'Not initial + competitor + retry maxima');
  assert.equal(report.sql.completeRetainedSqlBytes, null);
  assert.equal(report.calibrationEligible, false);
  assert.ok(Object.isFrozen(report.sql.additionalReads));
});
test('D5 additional read lifecycle refuses incoherent read handoff and missing charges', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.refreshAdditionalReadDiagnostic, 'function');
  for (const mutate of [
    (record) => {
      record.readReturnedBytes = 11;
    },
    (record) => {
      record.readToPreparationVerified = null;
    },
    (record) => {
      record.retainedSqlBytes = record.readScopedHighWaterBytes = null;
      record.retainedSqlStringChargeBytes = 0;
    },
  ]) {
    const row = lifecycleRow();
    const record = {
      ...module.refreshAdditionalReadDiagnostic(
        row.sqlPreparation,
        row.sqlReadDiagnostic,
        row.sqlPreparation,
      ),
    };
    mutate(record);
    row.sqlAdditionalReads = { competitor: record, retry: null };
    assert.throws(() => module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, false));
  }
});

test('D5 lifecycle joins scope identities without adding read and Stage peaks', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.refreshTransportLifecycleDiagnostic, 'function');
  const row = lifecycleRow();
  const report = module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, false);
  assert.equal(report.scope, 'WORKER_LIFECYCLE_EVIDENCE_ONLY');
  assert.equal(report.sql.knownScopedHighWaterBytes, 40, 'Not 40 + 30');
  assert.equal(report.sql.readReturnedBytes, 10);
  assert.equal(report.sql.readToPreparationVerified, true);
  assert.equal(report.sql.preparationToStageVerified, true);
  assert.equal(report.sql.completeRetainedSqlBytes, null);
  assert.equal(report.sql.completeRetainedSqlStringChargeBytes, null);
  assert.equal(report.calibrationEligible, false);
  assert.equal(report.memory.peakResidentBytes, 112640);
  assert.equal(report.memory.startupIncluded, true);
  assert.equal(report.memory.finishedIncluded, true);
  assert.equal(report.workerFailed, false);
  assert.ok(Object.isFrozen(report));
  for (const key of ['sql', 'memory', 'cleanup', 'verification', 'unavailableReasons'])
    assert.ok(Object.isFrozen(report[key]), key);
  row.sqlReadDiagnostic.sqlReadOwnership.retainedSqlBytes = 999;
  row.samples[1].peakKiB = 999;
  assert.equal(report.sql.knownScopedHighWaterBytes, 40);
  assert.equal(report.memory.peakResidentBytes, 112640);
});

test('D5 lifecycle retains failed selected prefixes but excludes generator seeds and absent reads', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.refreshTransportLifecycleDiagnostic, 'function');
  const row = lifecycleRow();
  row.sqlPreparation = row.sqlStage = row.sqlPreparedStage = null;
  row.sqlReadDiagnostic.status = 'THREW';
  row.sqlReadDiagnostic.sqlReadOwnership.returnedSqlBytes = null;
  row.persistentStateVerified = row.transactionClosed = row.tempClosed = false;
  const failed = module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, true);
  assert.equal(failed.sql.knownScopedHighWaterBytes, 40);
  assert.equal(failed.sql.readReturnedBytes, null);
  assert.equal(failed.sql.readToPreparationVerified, null);
  assert.equal(failed.sql.preparationToStageVerified, null);
  assert.equal(failed.workerFailed, true);
  assert.equal(failed.verification.persistentStateVerified, false);
  row.sqlReadFixtureRole = 'GENERATOR_SEED';
  const seed = module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, true);
  assert.equal(seed.sql.readRole, 'GENERATOR_SEED');
  assert.equal(seed.sql.knownScopedHighWaterBytes, null);
  row.sqlReadFixtureRole = row.sqlReadDiagnostic = null;
  const absent = module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, true);
  assert.equal(absent.sql.knownScopedHighWaterBytes, null, 'Absence is not measured zero');
});

test('D5 lifecycle refuses incoherent handoffs, unsafe accounting and incomplete RSS', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.refreshTransportLifecycleDiagnostic, 'function');
  for (const mutate of [
    (r) => {
      r.sqlReadDiagnostic.sqlReadOwnership.returnedSqlBytes = 11;
    },
    (r) => {
      r.sqlPreparedStage.preparedSqlBytes = 11;
    },
    (r) => {
      r.sqlPreparedStage.stageSqlBytes = 21;
    },
    (r) => {
      r.sqlStage.retainedSqlStringChargeBytes = 39;
    },
    (r) => {
      r.sqlStage.retainedSqlBytes = Number.MAX_SAFE_INTEGER;
    },
    (r) => {
      r.sqlPreparedStage.retainedSqlBytes = 29;
    },
    (r) => {
      r.sqlPreparedStage.retainedStringChargePeakBytes = 69;
    },
    (r) => {
      r.samples[0].phase = 'not-startup';
    },
    (r) => {
      r.samples.pop();
    },
    (r) => {
      r.peakResidentBytes = 1;
    },
    (r) => {
      r.samples[1].peakKiB = Number.MAX_SAFE_INTEGER;
    },
  ]) {
    const row = lifecycleRow();
    mutate(row);
    assert.throws(() => module.refreshTransportLifecycleDiagnostic(row, cleanLifecycle, false));
  }
});

test('D5 lifecycle cleanup attempts every callback in reverse order and preserves first failure', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.closeRefreshTransportWorkerResources, 'function');
  for (const prior of [null, 'original worker failure']) {
    const order = [];
    const result = await module.closeRefreshTransportWorkerResources(
      [
        async () => {
          order.push('first');
          throw undefined;
        },
        async () => {
          order.push('middle');
        },
        async () => {
          order.push('last');
          throw 0;
        },
      ],
      prior,
    );
    assert.deepEqual(order, ['last', 'middle', 'first']);
    assert.equal(result.failure, prior ?? '0');
    assert.deepEqual(result.cleanup, { registered: 3, attempted: 3, succeeded: 1, failed: 2 });
    assert.ok(Object.isFrozen(result.cleanup));
  }
});
test('D5 worker read ownership preserves the source fixture peak without accumulating checkpoints', async (t) => {
  for (const id of ['empty-file-noop', 'zero-files-noop']) {
    const f = await preparedSourceRefresh(
      t,
      sourceTransitions.find((row) => row.id === id),
    );
    const bytes = (table, fields, where = '') =>
      f.db
        .prepare(
          `SELECT coalesce(sum(${fields.map((field) => `coalesce(length(CAST(${field} AS BLOB)),0)`).join('+')}),0) AS n FROM ${table} ${where}`,
        )
        .get().n;
    const pointer = bytes('repository_state', [
      'indexed_revision_id',
      'indexed_content_fingerprint',
    ]);
    const header = bytes('native_analysis_state', ['header_json']);
    const identity = bytes('native_analysis_state', [
      'repository_id',
      'provider_id',
      'provider_snapshot_id',
      'revision_id',
      'content_fingerprint',
    ]);
    const state =
      header +
      64 +
      bytes('native_analysis_file', [
        'source_file_id',
        'source_path',
        'content_fingerprint',
        'summary_json',
      ]);
    const snapshot = bytes('provider_snapshots', [
      'id',
      'repository_id',
      'provider_id',
      'provider_version',
      'requested_revision_id',
      'requested_revision_fingerprint',
      'outcome',
    ]);
    const inventory = bytes('source_files', [
      'id',
      'repository_id',
      'revision_id',
      'path',
      'content_fingerprint',
      'role',
      'provenance',
      'content_kind',
      'language_hint',
      'sensitivity',
    ]);
    const outer = pointer + bytes('revisions', ['kind', 'content_fingerprint']) + inventory;
    const peak = outer + state + identity + 8 + snapshot + pointer + identity + header + 64;
    const returned =
      state +
      pointer +
      bytes('native_analysis_state', ['provider_id', 'provider_snapshot_id']) +
      64 +
      inventory;
    assert.deepEqual(f.sqlReadOwnership, {
      scope: 'REFRESH_READ_SQL_OWNERSHIP_ONLY',
      checkpoints: 14 + f.targetFiles.length + f.prepared.baselineState.files.length,
      phaseCounts: {
        INVENTORY_PREFIX: 2 + f.targetFiles.length,
        BASELINE_PREFIX: 4 + f.prepared.baselineState.files.length,
        VALIDATED_BASELINE: 1,
        TOKEN_ROW: 1,
        TOKEN_ACCEPTED: 1,
        TOKEN_RETURN: 1,
        STATE_CLONE_BEGIN: 1,
        STATE_CLONE_END: 1,
        BASELINE_RETURN: 1,
        RETURN: 1,
      },
      retainedSqlBytes: peak,
      retainedSqlStringChargeBytes: 2 * peak,
      returnedSqlBytes: returned,
    });
    assert.ok(Object.isFrozen(f.sqlReadOwnership));
    assert.ok(Object.isFrozen(f.sqlReadOwnership.phaseCounts));
    assert.equal(f.db.isTransaction, false);
  }
});
test('D5 dense-upsert preparation discovers the real producer boundary without changing persistent state', async (t) => {
  const module = await import('./helpers/native-refresh-dense-upsert-boundary.mjs').catch(
    (error) => {
      if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
      return {};
    },
  );
  assert.equal(
    typeof module.prepareDenseUpsertBoundary,
    'function',
    'Dense-upsert boundary owner missing',
  );
  const result = await module.prepareDenseUpsertBoundary(t);
  assert.equal(result.calibrationEligible, false);
  assert.equal(result.status, 'REAL_PRODUCER_BOUNDARY_PREPARATION_ONLY');
  assert.equal(result.next.memberCount, result.accepted.memberCount + 1);
  assert.equal(result.accepted.outcome, 'SUCCEEDED');
  assert.equal(result.accepted.upserts, result.accepted.memberCount);
  assert.equal(result.accepted.symbolSites, result.accepted.memberCount + 1);
  assert.equal(result.next.outcome, 'RESOURCE_LIMIT_EXCEEDED');
  assert.equal(result.next.summaryBytes, null, 'Refused summary was never emitted');
  assert.equal(result.next.upserts, 0, 'Producer refuses before buffered upserts');
  assert.equal(result.persistentStateVerified, true);
  for (const entry of [result.accepted, result.next]) {
    assert.equal(entry.wire.length, 1);
    assert.ok(entry.wire[0].inputBytes < 1_000_000);
    assert.ok(entry.wire[0].outputBytes > 0);
    assert.equal(entry.wire[0].outputLfTerminated, true);
    assert.match(entry.sourceSha256, /^[a-f0-9]{64}$/);
  }
  t.diagnostic(JSON.stringify(result));
});
test('D5 retained-sites preparation pins generated source bytes, not an admission threshold', async () => {
  const pair = JSON.parse(
    await readFile(
      new URL('./helpers/native-refresh-retained-sites-preparation.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(pair.status, 'GENERATED_SOURCE_PREPARATION_ONLY');
  assert.equal(pair.calibrationEligible, false);
  assert.equal(pair.next.memberCount, pair.accepted.memberCount + 1);
  for (const item of [pair.accepted, pair.next]) {
    const source =
      'class Sites {\n' +
      Array.from(
        { length: item.memberCount },
        (_, index) => `  int f${String(index).padStart(6, '0')};\n`,
      ).join('') +
      '}\n';
    assert.equal(Buffer.byteLength(source), item.sourceBytes);
    assert.equal(createHash('sha256').update(source).digest('hex'), item.sourceSha256);
  }
  assert.equal(Object.hasOwn(pair, 'memoryBudgetBytes'), false);
});
test('D5 input boundary grows legal records to the inherited cap and refuses the next record', async (t) => {
  const module = await import('./helpers/native-refresh-input-boundary.mjs').catch((error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  });
  assert.equal(typeof module.buildRefreshInputBoundary, 'function', 'Input-boundary owner missing');
  const result = module.buildRefreshInputBoundary();
  assert.equal(result.status, 'CONTRACT_PREPARATION_ONLY');
  assert.equal(result.calibrationEligible, false);
  const { accepted, next } = result;
  assert.ok(accepted.metrics.inputBytes <= 1_000_000);
  assert.ok(next.metrics.inputBytes > 1_000_000);
  assert.equal(next.metrics.fileCount, accepted.metrics.fileCount + 1);
  for (const value of [accepted, next]) {
    assert.equal(value.metrics.inputBytes, value.bytes.byteLength);
    const lines = value.bytes.toString('utf8').trimEnd().split('\n');
    assert.equal(value.metrics.inputRecords, lines.length);
    assert.equal(lines.length, value.metrics.fileCount + 2);
    assert.equal(
      value.metrics.largestLineBytes,
      Math.max(...lines.map((line) => Buffer.byteLength(line))),
    );
    assert.equal(value.bytes.at(-1), 10);
    assert.equal(value.bytes.includes(13), false);
    assert.equal(
      value.metrics.payloadDigest,
      createHash('sha256').update(value.bytes).digest('hex'),
    );
  }
  const { encodeNativeRefreshRequestV3, NATIVE_CLIENT_HARD_LIMITS } =
    await import('../../providers/dist/index.js');
  const encode = (value) =>
    encodeNativeRefreshRequestV3(
      value.request,
      value.baseline,
      NATIVE_CLIENT_HARD_LIMITS,
      value.request.payload.resourceBudget.maxMemoryBytes,
    );
  assert.deepEqual(Buffer.from(encode(accepted)), accepted.bytes);
  assert.throws(
    () => encode(next),
    (error) => error.code === 'OUTPUT_LIMIT_EXCEEDED',
  );
  const withCap = (maxStdinBytes) =>
    encodeNativeRefreshRequestV3(
      accepted.request,
      accepted.baseline,
      { ...NATIVE_CLIENT_HARD_LIMITS, maxStdinBytes },
      accepted.request.payload.resourceBudget.maxMemoryBytes,
    );
  assert.deepEqual(Buffer.from(withCap(accepted.metrics.inputBytes)), accepted.bytes);
  assert.throws(
    () => withCap(accepted.metrics.inputBytes - 1),
    (error) => error.code === 'OUTPUT_LIMIT_EXCEEDED',
  );
  assert.deepEqual(
    next.request.payload.targetSourceFiles.slice(0, -1),
    accepted.request.payload.targetSourceFiles,
  );
  const repeated = module.buildRefreshInputBoundary();
  assert.deepEqual(repeated.accepted.metrics, accepted.metrics);
  assert.deepEqual(repeated.next.metrics, next.metrics);
  t.diagnostic(
    JSON.stringify({ scope: result.status, accepted: accepted.metrics, next: next.metrics }),
  );
});
async function worker() {
  const module = await import('./helpers/native-refresh-transport-worker.mjs').catch((error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  });
  assert.equal(typeof module.runRefreshTransportWorker, 'function', 'D5 real worker owner missing');
  return module.runRefreshTransportWorker;
}

test('D5 prepared Stage accounting adds only the pinned preparation owner', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.refreshPreparedStageDiagnostic, 'function');
  const prepared = { retainedSqlBytes: 10, baselineState: { headerJson: '{}', files: [] } };
  const stage = {
    scope: 'STAGE_SQL_ACCOUNTING_ONLY',
    retainedSqlBytes: 30,
    retainedSqlStringChargeBytes: 60,
    retainedStringChargePeakBytes: 90,
  };
  const result = module.refreshPreparedStageDiagnostic(prepared, stage);
  assert.deepEqual(result, {
    scope: 'PREPARATION_STAGE_ACCOUNTING_ONLY',
    preparedSqlBytes: 10,
    stageSqlBytes: 30,
    retainedSqlBytes: 40,
    retainedSqlStringChargeBytes: 80,
    retainedStringChargePeakBytes: 110,
  });
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(stage, {
    scope: 'STAGE_SQL_ACCOUNTING_ONLY',
    retainedSqlBytes: 30,
    retainedSqlStringChargeBytes: 60,
    retainedStringChargePeakBytes: 90,
  });
});

test('D5 prepared Stage accounting refuses absent, incoherent or unsafe partial gauges', async () => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(typeof module.refreshPreparedStageDiagnostic, 'function');
  const prepared = { retainedSqlBytes: 10, baselineState: { headerJson: '{}', files: [] } };
  const stage = {
    scope: 'STAGE_SQL_ACCOUNTING_ONLY',
    retainedSqlBytes: 30,
    retainedSqlStringChargeBytes: 60,
    retainedStringChargePeakBytes: 90,
  };
  for (const value of [
    null,
    { ...stage, scope: 'OTHER' },
    { ...stage, retainedSqlStringChargeBytes: 59 },
    { ...stage, retainedStringChargePeakBytes: 59 },
  ])
    assert.throws(() => module.refreshPreparedStageDiagnostic(prepared, value));
  for (const field of [
    'retainedSqlBytes',
    'retainedSqlStringChargeBytes',
    'retainedStringChargePeakBytes',
  ])
    for (const value of [undefined, NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER])
      assert.throws(() =>
        module.refreshPreparedStageDiagnostic(prepared, { ...stage, [field]: value }),
      );
  assert.throws(() =>
    module.refreshPreparedStageDiagnostic(prepared, {
      ...stage,
      retainedSqlBytes: (Number.MAX_SAFE_INTEGER - 1) / 2,
      retainedSqlStringChargeBytes: Number.MAX_SAFE_INTEGER - 1,
      retainedStringChargePeakBytes: Number.MAX_SAFE_INTEGER - 1,
    }),
  );
});

test('D5 prepared Stage owner characterization keeps preparation pinned and seal inputs detached', async (t) => {
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((row) => row.id === 'empty-file-noop'),
  );
  const { RepositoryPatchStage } = await import('../../storage/dist/index.js');
  const { applyPreparedNativeRefreshAnalysisV3 } =
    await import('../dist/native-refresh-workspace.js');
  const seal = RepositoryPatchStage.prototype.sealNativePatchState;
  const close = RepositoryPatchStage.prototype.close;
  let validations = 0,
    closes = 0;
  const bytes = f.prepared.retainedSqlBytes;
  try {
    RepositoryPatchStage.prototype.sealNativePatchState = function (expected, token, validate) {
      assert.strictEqual(token, f.prepared.token);
      return seal.call(this, expected, token, (input) => {
        assert.notStrictEqual(input.baselineToken, token);
        assert.deepEqual(input.baselineToken, token);
        assert.notStrictEqual(input.baseline, f.prepared.baselineState);
        assert.deepEqual(input.baseline, f.prepared.baselineState);
        assert.notStrictEqual(input.targetSourceFiles, f.prepared.targetSourceFiles);
        assert.deepEqual(input.targetSourceFiles, f.prepared.targetSourceFiles);
        validations++;
        return validate(input);
      });
    };
    RepositoryPatchStage.prototype.close = function () {
      assert.equal(f.prepared.retainedSqlBytes, bytes);
      assert.ok(Object.isFrozen(f.prepared));
      closes++;
      return close.call(this);
    };
    await applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options);
    assert.equal(validations, 1);
    assert.equal(closes, 1);
    assert.equal(f.db.isTransaction, false);
  } finally {
    RepositoryPatchStage.prototype.sealNativePatchState = seal;
    RepositoryPatchStage.prototype.close = close;
  }
});

test('D5 failed read diagnostic fixture delivers scalars before preparation returns', async (t) => {
  let diagnostic = null;
  const failure = new Error('Read diagnostic consumer failure');
  await assert.rejects(
    preparedSourceRefresh(
      t,
      sourceTransitions.find((row) => row.id === 'empty-file-noop'),
      1,
      (record) => {
        diagnostic = record;
        throw failure;
      },
    ),
    (error) => error === failure,
  );
  assert.equal(diagnostic.status, 'AVAILABLE');
  assert.equal(diagnostic.sqlReadOwnership.phaseCounts.RETURN, 1);
  assert.ok(diagnostic.sqlReadFields.readSqlBytes > 0);
  assert.ok(Object.isFrozen(diagnostic));
});
test('D5 failed read diagnostic fixture preserves falsy clone failures before returning', async (t) => {
  const clone = globalThis.structuredClone;
  try {
    for (const failure of [0, undefined, null, '']) {
      let diagnostic = null,
        caught = false,
        actual,
        stateCopies = 0;
      globalThis.structuredClone = (value, ...args) => {
        // Forward full bootstrap's actual seal copy; fail the subsequent read copy.
        if (
          typeof value?.headerJson === 'string' &&
          Array.isArray(value.files) &&
          ++stateCopies === 2
        )
          throw failure;
        return clone(value, ...args);
      };
      try {
        await preparedSourceRefresh(
          t,
          sourceTransitions.find((row) => row.id === 'empty-file-noop'),
          1,
          (record) => {
            diagnostic = record;
          },
        );
      } catch (error) {
        caught = true;
        actual = error;
      }
      assert.equal(caught, true);
      assert.equal(stateCopies, 2);
      assert.equal(diagnostic?.status, 'THREW');
      assert.equal(diagnostic.sqlReadOwnership.phaseCounts.STATE_CLONE_BEGIN, 1);
      assert.equal(diagnostic.sqlReadOwnership.phaseCounts.STATE_CLONE_END, undefined);
      assert.equal(diagnostic.sqlReadOwnership.returnedSqlBytes, null);
      assert.equal(actual, failure, 'Original clone failure must not be replaced by preparation');
    }
  } finally {
    globalThis.structuredClone = clone;
  }
});
test('D5 preparation SQL telemetry agrees with independent SQLite UTF-8 lengths', async (t) => {
  const module = await import('./helpers/native-refresh-transport-worker.mjs');
  assert.equal(
    typeof module.refreshPreparationSqlDiagnostic,
    'function',
    'Preparation SQL telemetry owner missing',
  );
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((row) => row.id === 'empty-file-noop'),
  );
  const repo = f.prepared.trustedContext.repositoryId;
  const sum = (table, columns, where = 'repository_id=?', ...parameters) =>
    f.db
      .prepare(
        `SELECT coalesce(sum(${columns.map((c) => `coalesce(length(CAST(${c} AS BLOB)),0)`).join('+')}),0) AS bytes FROM ${table} WHERE ${where}`,
      )
      .get(repo, ...parameters).bytes;
  const header = sum('native_analysis_state', ['header_json']);
  const summaries = sum('native_analysis_file', ['summary_json']);
  const bytes =
    header +
    sum('native_analysis_state', ["json_extract(header_json,'$.summaryDigest')"]) +
    sum('native_analysis_file', [
      'source_file_id',
      'source_path',
      'content_fingerprint',
      'summary_json',
    ]) +
    sum('source_files', [
      'id',
      'repository_id',
      'revision_id',
      'path',
      'content_fingerprint',
      'role',
      'provenance',
      'content_kind',
      'language_hint',
      'sensitivity',
    ]) +
    sum('repository_state', ['indexed_revision_id', 'indexed_content_fingerprint']) +
    sum('native_analysis_state', [
      'provider_id',
      'provider_snapshot_id',
      "json_extract(header_json,'$.summaryDigest')",
    ]);
  assert.deepEqual(module.refreshPreparationSqlDiagnostic(f.prepared), {
    scope: 'PREPARATION_RETENTION_ONLY',
    retainedSqlBytes: bytes,
    retainedSqlStringChargeBytes: 2 * bytes,
    baselineHeaderSqlBytes: header,
    baselineSummarySqlBytes: summaries,
  });
  assert.ok(
    bytes > header + summaries,
    'Original pointer/inventory/summary-row fields are retained too',
  );
  assert.throws(
    () =>
      module.refreshPreparationSqlDiagnostic({
        ...f.prepared,
        retainedSqlBytes: header + summaries - 1,
      }),
    /incomplete preparation SQL retention/i,
  );
});

test('D5 preparation telemetry refuses absent or unsafe counters before inspecting retained metadata', async () => {
  const { refreshPreparationSqlDiagnostic } =
    await import('./helpers/native-refresh-transport-worker.mjs');
  let reads = 0;
  for (const retainedSqlBytes of [undefined, NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER])
    assert.throws(() =>
      refreshPreparationSqlDiagnostic({
        retainedSqlBytes,
        get baselineState() {
          reads++;
          throw Error('Retained metadata must not be inspected');
        },
      }),
    );
  assert.equal(reads, 0);
});
for (const [name, sourceTransition, outcome] of [
  ['d-preparation-input', 'source-empty-input-boundary', 'SUCCEEDED'],
  ['d-retained-sites', 'source-field-sites-boundary', 'SUCCEEDED'],
  ['d-shared-owners', 'source-shared-owners-boundary', 'SUCCEEDED'],
  ['d-dense-upsert', 'source-dense-upsert-boundary', 'SUCCEEDED'],
  ['d-dense-remove', 'source-dense-remove-boundary', 'SUCCEEDED'],
  ['d-complete-coverage', 'source-complete-coverage-boundary', 'SUCCEEDED'],
  ['d-overlay-retention', 'source-complete-coverage-boundary', 'SUCCEEDED'],
  ['d-delete', 'shared-last-owner-deletion-zero-target', 'SUCCEEDED'],
  ['d-empty', 'empty-file-noop', 'SUCCEEDED'],
  ['d-zero-fact', 'zero-files-noop', 'SUCCEEDED'],
  ['d-rollback', 'modify-call-target', 'ERR_SQLITE_ERROR'],
  ['d-reopen', 'modify-call-target', 'SUCCEEDED'],
  ['d-dependent-edge', 'add-method-unknown-to-resolved', 'SUCCEEDED'],
  ['d-slow-sink', 'modify-call-target', 'SUCCEEDED'],
  ['d-cancel', 'modify-call-target', 'CANCELLED'],
  ['d-source-race', 'modify-call-target', 'WORKER_EXCEPTION'],
  ['d-token-race', 'empty-file-noop', 'WORKER_EXCEPTION'],
  ['d-partial', 'empty-file-noop', 'WORKER_EXCEPTION'],
  ['d-corrupt', 'empty-file-noop', 'CHECKSUM_MISMATCH'],
  ['d-late-exit', 'empty-file-noop', 'PROCESS_FAILED'],
])
  test(`D5 preparation worker proves real source/Apply/reopen: ${name}`, async (t) => {
    await worker();
    const child = spawnSync(process.execPath, [workerPath, 'offline', name, '0'], {
      encoding: 'utf8',
      // Offline source-pair/full-bootstrap replay, not a Native request deadline.
      timeout: [
        'd-retained-sites',
        'd-preparation-input',
        'd-shared-owners',
        'd-dense-upsert',
        'd-dense-remove',
        'd-complete-coverage',
        'd-overlay-retention',
      ].includes(name)
        ? 300_000
        : 60_000,
      windowsHide: true,
    });
    assert.equal(child.error, undefined, String(child.error));
    assert.equal(child.status, 0, child.stdout + child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.failure, null);
    const row = result.row;
    assert.equal(row.status, 'WORKER_PREPARATION_ONLY');
    assert.equal(row.workspace, 'REFRESH_TRANSPORT');
    assert.equal(row.name, name);
    assert.equal(row.snapshotMetadataCaptureFailed, false);
    const snapshotActors =
      outcome === 'SUCCEEDED'
        ? [['MAIN', 'snapshot-source-refresh']]
        : name === 'd-token-race'
          ? [['COMPETITOR', 'snapshot-d5-competitor']]
          : [];
    assert.deepEqual(
      row.snapshotMetadata.entries.map(({ role, snapshotId }) => [role, snapshotId]),
      snapshotActors,
    );
    for (const entry of row.snapshotMetadata.entries) {
      assert.ok(row.snapshotMetadata.invocationStartedAt <= entry.startedAt);
      assert.ok(entry.startedAt <= entry.completedAt);
      assert.ok(entry.completedAt <= row.snapshotMetadata.invocationFinishedAt);
    }
    assert.equal(row.stageAccountingCaptureFailure, null);
    assert.equal(row.competitorStageAccountingCaptureFailure, null);
    for (const diagnostic of [row.stageAccounting, row.competitorStageAccounting]) {
      if (diagnostic === null) continue;
      assert.equal(diagnostic.scope, 'STAGE_ACCOUNTING_CHECKPOINT_AGGREGATE_ONLY');
      const ids = new Set();
      for (const stage of diagnostic.stages) {
        assert.ok(Number.isSafeInteger(stage.stageId) && stage.stageId > 0);
        assert.equal(ids.has(stage.stageId), false);
        ids.add(stage.stageId);
        assert.ok(Number.isSafeInteger(stage.checkpoints) && stage.checkpoints > 0);
        assert.ok(stage.maximumSqlBytes >= stage.lastSqlBytes);
        assert.ok(stage.maximumStringChargeBytes >= stage.lastStringChargeBytes);
        assert.ok(stage.lastStringChargeBytes >= 2 * stage.lastSqlBytes);
        assert.equal(stage.rawSqlCheckpoints + stage.rawSqlAbsentCheckpoints, stage.checkpoints);
        assert.equal(stage.budgetComponentCheckpoints, stage.checkpoints);
        assert.equal(stage.budgetComponentsAbsentCheckpoints, 0);
        assert.equal(
          stage.lastBudgetComponents.stageSqlBytes +
            stage.lastBudgetComponents.additionalSqlAllowanceBytes,
          stage.lastSqlBytes,
        );
        assert.equal(
          2 * stage.lastSqlBytes +
            stage.lastBudgetComponents.otherBudgetChargeBytes +
            stage.lastBudgetComponents.resultCopyChargeBytes,
          stage.lastStringChargeBytes,
        );
        if (stage.lastRawSql !== null) {
          assert.equal(stage.lastRawSql.scope, 'CURRENT_RAW_SQL_OWNER_CHECKPOINT_ONLY');
          assert.ok(stage.lastRawSql.ownerId > 0);
          assert.equal(
            stage.lastRawSql.retainedSqlStringChargeBytes,
            2 * stage.lastRawSql.retainedSqlBytes,
          );
        }
      }
    }
    if (['d-slow-sink', 'd-token-race', 'd-rollback', 'd-reopen'].includes(name))
      assert.equal(row.stageAccounting.stages.length, 1);
    if (name === 'd-token-race') assert.equal(row.competitorStageAccounting.stages.length, 1);
    else assert.equal(row.competitorStageAccounting, null);
    if (['d-slow-sink', 'd-token-race', 'd-rollback', 'd-reopen'].includes(name))
      assert.ok(
        row.stageAccounting.stages[0].rawSqlCheckpoints > 0,
        'Actual nested SQL owners must reach Stage checkpoints',
      );
    assert.equal(row.repetition, 0);
    assert.deepEqual(row.lifecycle.sql.apply, row.sqlApply);
    assert.deepEqual(row.lifecycle.sql.competitorApply, row.sqlCompetitorApply);
    assert.deepEqual(row.lifecycle.sql.seal, row.sqlSeal);
    assert.deepEqual(row.lifecycle.sql.competitorSeal, row.sqlCompetitorSeal);
    assert.deepEqual(row.lifecycle.sql.normalize, row.sqlNormalize);
    assert.deepEqual(row.lifecycle.sql.competitorNormalize, row.sqlCompetitorNormalize);
    assert.deepEqual(row.lifecycle.sql.completion, row.sqlCompletion);
    assert.deepEqual(row.lifecycle.sql.competitorCompletion, row.sqlCompetitorCompletion);
    for (const [role, prefix] of [
      ['completion', 'sqlCompletion'],
      ['normalize', 'sqlNormalize'],
      ['seal', 'sqlSeal'],
      ['apply', 'sqlApply'],
      ['competitorNormalize', 'sqlCompetitorNormalize'],
      ['competitorCompletion', 'sqlCompetitorCompletion'],
      ['competitorSeal', 'sqlCompetitorSeal'],
      ['competitorApply', 'sqlCompetitorApply'],
    ]) {
      const overlap = row[`${prefix}Overlap`];
      const raw = row[prefix];
      assert.equal(overlap === null, raw === null, 'Missing worker overlap forwarding');
      assert.deepEqual(row.lifecycle.sql.preparedOverlaps[role], overlap);
      if (raw !== null) {
        const preparedBytes =
          row.sqlPreparation.retainedSqlBytes +
          (role.startsWith('competitor')
            ? row.sqlAdditionalReads.competitor.additionalPreparationBytes
            : 0);
        assert.equal(overlap.preparationCount, role.startsWith('competitor') ? 2 : 1);
        assert.equal(overlap.preparedSqlBytes, preparedBytes);
        assert.equal(overlap.scopedSqlHighWaterBytes, raw.retainedSqlBytes);
        assert.equal(overlap.retainedSqlBytes, preparedBytes + raw.retainedSqlBytes);
        assert.equal(overlap.retainedSqlStringChargeBytes, 2 * overlap.retainedSqlBytes);
        assert.equal(overlap.lastRetainedSqlBytes, preparedBytes + raw.lastRetainedSqlBytes);
        assert.equal(overlap.checkpoints, raw.checkpoints);
      }
    }
    if (['d-cancel', 'd-partial', 'd-corrupt', 'd-late-exit'].includes(name)) {
      assert.equal(row.sqlSealCalls, 0);
      assert.equal(row.sqlNormalizeCalls, 0);
      assert.equal(row.sqlNormalize, null);
      assert.equal(row.sqlSeal, null);
      assert.equal(row.sqlApplyCalls, 0);
      assert.equal(row.sqlApply, null);
    }
    assert.equal(row.sqlCompletionCaptureFailure, null);
    assert.equal(
      row.sqlCompletionCalls,
      ['d-cancel', 'd-corrupt', 'd-late-exit'].includes(name) ? 0 : 1,
    );
    if (['d-cancel', 'd-corrupt', 'd-late-exit', 'd-partial'].includes(name)) {
      assert.equal(row.sqlCompletion, null);
      assert.equal(row.sqlCompletionOverlap, null);
    }
    if (['d-slow-sink', 'd-rollback'].includes(name)) {
      assert.ok(row.sqlCompletion.phaseCounts.STAGE_COMPLETION_EVENT_ROW_ENTER > 0);
      assert.equal(row.sqlCompletion.lastRetainedSqlBytes, 0);
    }
    if (name === 'd-token-race') {
      assert.equal(row.sqlCompetitorCompletionCalls, 1);
      assert.equal(row.sqlCompetitorCompletion, null);
      assert.equal(row.sqlCompetitorCompletionOverlap, null);
      assert.equal(row.sqlCompetitorCompletionCaptureFailure, null);
    }
    if (name === 'd-source-race') {
      assert.equal(row.sqlCompetitorApplyCalls, 0);
      assert.equal(row.sqlCompetitorApply, null);
    }
    if (['d-slow-sink', 'd-rollback'].includes(name)) {
      assert.equal(row.sqlSealCalls, 1);
      assert.equal(row.sqlNormalizeCalls, 1);
      assert.equal(row.sqlNormalizeCaptureFailure, null);
      assert.ok(row.sqlNormalize.phaseCounts.STAGE_EVENT_ROW_ENTER > 0);
      assert.equal(row.sqlNormalize.lastRetainedSqlBytes, 0);
      assert.ok(row.sqlNormalize.retainedSqlBytes > 0);
      assert.equal(row.sqlSealCaptureFailure, null);
      assert.equal(row.sqlSeal.phaseCounts.STORE_TOKEN_SCOPE_EXIT, 1);
      assert.equal(row.sqlSeal.phaseCounts.STORE_ACTIVE_SUPPORT_SCOPE_EXIT, 1);
      assert.equal(row.sqlSeal.lastRetainedSqlBytes, 0);
      assert.ok(row.sqlSeal.retainedSqlBytes > 0);
      assert.equal(row.sqlApplyCalls, 1);
      assert.equal(row.sqlApplyCaptureFailure, null);
      assert.equal(row.sqlApply.scope, 'APPLY_RAW_SQL_OWNERSHIP_ONLY');
      assert.equal(row.sqlApply.phaseCounts.STORE_TOKEN_SCOPE_EXIT, 2);
      assert.equal(row.sqlApply.lastRetainedSqlBytes, 0);
      assert.ok(row.sqlApply.retainedSqlBytes > 0);
      assert.equal(row.sqlApply.retainedSqlStringChargeBytes, 2 * row.sqlApply.retainedSqlBytes);
    }
    if (name === 'd-token-race') {
      assert.equal(row.sqlCompetitorSealCalls, 1);
      assert.equal(row.sqlCompetitorNormalizeCalls, 1);
      assert.equal(row.sqlCompetitorNormalizeCaptureFailure, null);
      // The competitor is an unchanged empty-file refresh: the normalizer runs,
      // but has no source/upsert/remove SQL TEXT row to observe.
      assert.equal(row.sqlCompetitorNormalize, null);
      assert.equal(row.sqlCompetitorSealCaptureFailure, null);
      assert.equal(row.sqlCompetitorSeal.phaseCounts.STORE_TOKEN_SCOPE_EXIT, 1);
      assert.equal(row.sqlCompetitorSeal.phaseCounts.STORE_ACTIVE_SUPPORT_SCOPE_EXIT, 1);
      assert.equal(row.sqlCompetitorSeal.lastRetainedSqlBytes, 0);
      assert.equal(row.sqlCompetitorApplyCalls, 1);
      assert.equal(row.sqlCompetitorApplyCaptureFailure, null);
      assert.equal(row.sqlCompetitorApply.scope, 'APPLY_RAW_SQL_OWNERSHIP_ONLY');
      assert.equal(row.sqlCompetitorApply.phaseCounts.STORE_TOKEN_SCOPE_EXIT, 2);
      assert.equal(row.sqlCompetitorApply.lastRetainedSqlBytes, 0);
      assert.ok(row.sqlCompetitorApply.retainedSqlBytes > 0);
    }
    assert.equal(row.lifecycleCaptureFailure, null);
    assert.equal(row.lifecycle.scope, 'WORKER_LIFECYCLE_EVIDENCE_ONLY');
    assert.equal(
      row.lifecycle.workerFailed,
      false,
      'Expected refusals are verified worker outcomes',
    );
    assert.equal(row.lifecycle.calibrationEligible, false);
    assert.equal(row.lifecycle.memory.startupIncluded, true);
    assert.equal(row.lifecycle.memory.finishedIncluded, true);
    assert.equal(row.lifecycle.memory.peakResidentBytes, row.peakResidentBytes);
    assert.equal(row.lifecycle.sql.readRole, 'SELECTED_FIXTURE');
    assert.equal(row.lifecycle.sql.readToPreparationVerified, true);
    assert.equal(row.lifecycle.sql.preparationToStageVerified, true);
    assert.equal(row.lifecycle.sql.completeRetainedSqlBytes, null);
    assert.equal(row.lifecycle.cleanup.failed, 0);
    assert.equal(row.lifecycle.cleanup.attempted, row.lifecycle.cleanup.registered);
    assert.ok(row.lifecycle.cleanup.succeeded > 0);
    assert.deepEqual(row.lifecycle.verification, {
      persistentStateVerified: true,
      transactionClosed: true,
      tempClosed: true,
    });
    assert.ok(row.sqlPreparation, 'Prepared SQL retention must be reported');
    assert.ok(
      row.sqlReadOwnership,
      'The worker must retain its final fixture read-owner diagnostic',
    );
    assert.equal(row.sqlReadDiagnostic?.scope, 'REFRESH_READ_DIAGNOSTIC_ONLY');
    assert.equal(row.sqlReadFixtureRole, 'SELECTED_FIXTURE');
    assert.equal(row.sqlReadDiagnostic.status, 'AVAILABLE');
    assert.equal(row.sqlReadDiagnostic.reason, null);
    assert.ok(row.sqlReadDiagnostic.sqlReadFields.checkpoints > 0);
    assert.ok(row.sqlReadDiagnostic.sqlReadFields.readSqlBytes > 0);
    assert.deepEqual(row.sqlReadDiagnostic.sqlReadOwnership, row.sqlReadOwnership);
    assert.equal(row.sqlReadOwnership.scope, 'REFRESH_READ_SQL_OWNERSHIP_ONLY');
    assert.equal(
      row.sqlReadOwnership.checkpoints,
      8 +
        row.sqlReadOwnership.phaseCounts.INVENTORY_PREFIX +
        row.sqlReadOwnership.phaseCounts.BASELINE_PREFIX,
      'Exactly one selected read, including its raw prefixes; no seed preparations',
    );
    assert.ok(row.sqlReadOwnership.phaseCounts.INVENTORY_PREFIX >= 2);
    assert.ok(row.sqlReadOwnership.phaseCounts.BASELINE_PREFIX >= 4);
    assert.equal(row.sqlReadOwnership.phaseCounts.RETURN, 1);
    assert.equal(row.sqlReadOwnership.phaseCounts.BASELINE_RETURN, 1);
    assert.ok(row.sqlReadOwnership.retainedSqlBytes > row.sqlReadOwnership.returnedSqlBytes);
    assert.equal(
      row.sqlReadOwnership.retainedSqlStringChargeBytes,
      2 * row.sqlReadOwnership.retainedSqlBytes,
    );
    assert.equal(row.sqlReadOwnership.returnedSqlBytes, row.sqlPreparation.retainedSqlBytes);
    assert.equal(row.sqlPreparation.scope, 'PREPARATION_RETENTION_ONLY');
    assert.ok(row.sqlPreparation.retainedSqlBytes > 0);
    assert.equal(
      row.sqlPreparation.retainedSqlStringChargeBytes,
      2 * row.sqlPreparation.retainedSqlBytes,
    );
    assert.ok(row.sqlPreparation.baselineHeaderSqlBytes > 0);
    assert.ok(row.sqlPreparation.baselineSummarySqlBytes >= 0);
    assert.ok(row.sqlStage, 'Stage SQL accounting must survive success or failure cleanup');
    assert.ok(row.sqlPreparedStage, 'Pinned preparation and Stage accounting must survive cleanup');
    assert.equal(row.sqlPreparedStage.scope, 'PREPARATION_STAGE_ACCOUNTING_ONLY');
    assert.equal(row.sqlPreparedStage.preparedSqlBytes, row.sqlPreparation.retainedSqlBytes);
    assert.equal(row.sqlPreparedStage.stageSqlBytes, row.sqlStage.retainedSqlBytes);
    assert.equal(
      row.sqlPreparedStage.retainedSqlBytes,
      row.sqlPreparation.retainedSqlBytes + row.sqlStage.retainedSqlBytes,
    );
    assert.equal(
      row.sqlPreparedStage.retainedSqlStringChargeBytes,
      2 * row.sqlPreparedStage.retainedSqlBytes,
    );
    assert.equal(
      row.sqlPreparedStage.retainedStringChargePeakBytes,
      2 * row.sqlPreparation.retainedSqlBytes + row.sqlStage.retainedStringChargePeakBytes,
    );
    assert.equal(row.sqlStage.scope, 'STAGE_SQL_ACCOUNTING_ONLY');
    assert.equal(row.sqlStage.retainedSqlStringChargeBytes, 2 * row.sqlStage.retainedSqlBytes);
    assert.ok(
      row.sqlStage.retainedStringChargePeakBytes >= row.sqlStage.retainedSqlStringChargeBytes,
    );
    if (row.measurement) assert.deepEqual(row.sqlStage, row.measurement.stageRetention);
    assert.equal(
      row.retainedSqlBytes,
      null,
      'Preparation retention is not the complete lifecycle peak',
    );
    assert.equal(row.retainedSqlStringChargeBytes, null);
    assert.equal(row.recipe.sourceTransition, sourceTransition);
    assert.match(row.recipe.payloadDigest, /^[a-f0-9]{64}$/);
    assert.equal(row.expectedOutcome, outcome);
    assert.equal(row.observedOutcome, outcome);
    assert.equal(row.persistentStateVerified, true);
    assert.equal(row.transactionClosed, true);
    assert.equal(row.tempClosed, true);
    assert.equal(row.samples[0].phase, 'startup');
    assert.equal(row.peakResidentBytes, Math.max(...row.samples.map((s) => s.peakKiB * 1024)));
    assert.equal(row.peakMethod, 'resourceUsage.maxRSS');
    assert.equal(row.peakUnits, 'bytes');
    assert.equal(row.peakScope, 'NODE_PROCESS_LIFETIME_EXCLUDING_CHILD');
    assert.ok(row.outputBytes > 0, 'Actual stdout bytes must be observed');
    assert.ok(row.eventCount > 0);
    assert.equal(row.wire.length, 1, 'Only REFRESH, not bootstrap, is probed');
    assert.equal(row.wire[0].outputBytes, row.outputBytes);
    assert.equal(row.wire[0].outputRecords, row.eventCount);
    assert.equal(row.wire[0].outputLfTerminated, true);
    assert.ok(row.wire[0].inputBytes > 0);
    assert.match(row.wire[0].inputSha256, /^[a-f0-9]{64}$/);
    assert.match(row.wire[0].outputSha256, /^[a-f0-9]{64}$/);
    assert.equal(row.calibrationEligible, false);
    if (['d-complete-coverage', 'd-overlay-retention'].includes(name)) {
      const boundary = row.inputBoundary;
      assert.ok(boundary.accepted.inputBytes <= 1_000_000);
      assert.ok(boundary.next.inputBytes > 1_000_000);
      assert.equal(boundary.next.fileCount, boundary.accepted.fileCount + 1);
      assert.equal(row.wire[0].inputBytes, boundary.accepted.inputBytes);
      assert.equal(row.wire[0].inputSha256, boundary.accepted.payloadDigest);
      assert.deepEqual(boundary.parsedFiles, ['Target.java']);
      assert.equal(boundary.summaryCount, boundary.accepted.fileCount);
      assert.equal(boundary.coverageCount, boundary.accepted.fileCount * 5);
      assert.equal(boundary.retainedModuleCount, boundary.accepted.fileCount - 2);
      assert.equal(boundary.retainedSupportVerified, true);
      assert.equal(boundary.nextRefusedBeforeSpawn, true);
      assert.equal(boundary.nextRefusal, 'OUTPUT_LIMIT_EXCEEDED');
      t.diagnostic(JSON.stringify(boundary));
    }
    if (name === 'd-overlay-retention') {
      assert.equal(row.overlay.calls, 1);
      assert.equal(row.overlay.counts.files, row.inputBoundary.accepted.fileCount);
      assert.ok(row.overlay.counts.normalizedNodes > 0);
      assert.ok(row.overlay.counts.normalizedEdges > 0);
      assert.equal(
        row.overlay.counts.supports,
        row.overlay.counts.normalizedNodes + row.overlay.counts.normalizedEdges,
      );
      assert.equal(row.overlay.counts.coverage, row.inputBoundary.coverageCount);
      assert.equal(row.overlay.retainedModuleSupports, row.inputBoundary.retainedModuleCount);
      assert.equal(row.overlay.untouchedDuringSeal, true);
      assert.equal(row.overlay.sealedFrozen, true);
      assert.ok(row.samples.some((sample) => sample.phase === 'overlay-views-retained'));
      assert.ok(row.samples.some((sample) => sample.phase === 'overlay-seal-returned'));
      t.diagnostic(JSON.stringify(row.overlay));
    }
    if (name === 'd-dense-remove') {
      assert.ok(row.inputBoundary.accepted.inputBytes <= 1_000_000);
      assert.ok(row.inputBoundary.next.inputBytes > 1_000_000);
      assert.equal(row.inputBoundary.next.memberCount, row.inputBoundary.accepted.memberCount + 1);
      assert.equal(
        row.inputBoundary.accepted.symbolSites,
        row.inputBoundary.accepted.memberCount + 1,
      );
      assert.equal(row.wire[0].inputBytes, row.inputBoundary.accepted.inputBytes);
      assert.equal(row.wire[0].inputSha256, row.inputBoundary.accepted.payloadDigest);
      assert.equal(row.inputBoundary.removals, row.inputBoundary.accepted.memberCount);
      assert.equal(row.inputBoundary.upserts, 0);
      assert.equal(row.inputBoundary.removedFieldCount, row.inputBoundary.accepted.memberCount);
      assert.equal(row.inputBoundary.invalidatedEvidenceCount, row.inputBoundary.removedFieldCount);
      assert.equal(row.inputBoundary.activeSupportCount, 2);
      assert.equal(row.inputBoundary.retainedModuleCount, 1);
      assert.equal(row.inputBoundary.retainedFieldCount, 0);
      assert.equal(row.inputBoundary.retiredSupportVerified, true);
      assert.equal(row.inputBoundary.retainedSupportVerified, true);
      assert.equal(row.inputBoundary.nextRefusedBeforeSpawn, true);
      assert.equal(row.inputBoundary.nextRefusal, 'OUTPUT_LIMIT_EXCEEDED');
      t.diagnostic(JSON.stringify(row.inputBoundary));
    }
    if (name === 'd-dense-upsert') {
      assert.equal(row.denseBoundary.accepted.upserts, row.denseBoundary.accepted.memberCount);
      assert.equal(row.denseBoundary.next.memberCount, row.denseBoundary.accepted.memberCount + 1);
      assert.equal(row.denseBoundary.next.outcome, 'RESOURCE_LIMIT_EXCEEDED');
      assert.equal(row.denseBoundary.next.clientError, 'ANALYZER_FAILED');
      assert.equal(row.denseBoundary.next.summaryBytes, null);
      assert.equal(row.denseBoundary.newFieldCount, row.denseBoundary.accepted.memberCount);
      assert.equal(row.denseBoundary.newSupportVerified, true);
      assert.equal(row.denseBoundary.retainedSupportVerified, true);
      assert.equal(row.outputBytes, row.denseBoundary.accepted.wire[0].outputBytes);
      assert.equal(row.eventCount, row.denseBoundary.accepted.wire[0].outputRecords);
      t.diagnostic(JSON.stringify(row.denseBoundary));
    }
    if (name === 'd-shared-owners') {
      assert.ok(row.inputBoundary.accepted.inputBytes <= 1_000_000);
      assert.ok(row.inputBoundary.next.inputBytes > 1_000_000);
      assert.equal(row.inputBoundary.next.fileCount, row.inputBoundary.accepted.fileCount + 1);
      assert.equal(row.wire[0].inputBytes, row.inputBoundary.accepted.inputBytes);
      assert.equal(row.wire[0].inputSha256, row.inputBoundary.accepted.payloadDigest);
      assert.equal(row.inputBoundary.retainedModuleCount, row.inputBoundary.accepted.fileCount);
      assert.equal(row.inputBoundary.sharedOwnerCount, row.inputBoundary.accepted.fileCount);
      assert.equal(row.inputBoundary.sharedSupportCount, 1);
      assert.equal(row.inputBoundary.retainedSupportVerified, true);
      assert.equal(row.inputBoundary.nextRefusedBeforeSpawn, true);
      assert.equal(row.inputBoundary.nextRefusal, 'OUTPUT_LIMIT_EXCEEDED');
      t.diagnostic(JSON.stringify(row.inputBoundary));
    }
    if (name === 'd-preparation-input') {
      assert.ok(row.inputBoundary.accepted.inputBytes <= 1_000_000);
      assert.ok(row.inputBoundary.next.inputBytes > 1_000_000);
      assert.equal(row.inputBoundary.next.fileCount, row.inputBoundary.accepted.fileCount + 1);
      assert.equal(row.wire[0].inputBytes, row.inputBoundary.accepted.inputBytes);
      assert.equal(row.wire[0].inputSha256, row.inputBoundary.accepted.payloadDigest);
      assert.equal(row.inputBoundary.retainedModuleCount, row.inputBoundary.accepted.fileCount);
      assert.equal(row.inputBoundary.retainedSupportVerified, true);
      assert.equal(row.inputBoundary.nextRefusedBeforeSpawn, true);
      assert.equal(row.inputBoundary.nextRefusal, 'OUTPUT_LIMIT_EXCEEDED');
      assert.equal(
        row.inputBoundary.sizingScope,
        'REAL_RUST_PER_FILE_GENERATION_OUTSIDE_CALIBRATION',
      );
      t.diagnostic(JSON.stringify(row.inputBoundary));
    }
    if (name === 'd-retained-sites') {
      assert.equal(row.inputBoundary.accepted.fileCount, 1);
      assert.ok(row.inputBoundary.accepted.inputBytes <= 1_000_000);
      assert.ok(row.inputBoundary.next.inputBytes > 1_000_000);
      assert.equal(row.inputBoundary.next.memberCount, row.inputBoundary.accepted.memberCount + 1);
      assert.equal(
        row.inputBoundary.accepted.symbolSites,
        row.inputBoundary.accepted.memberCount + 1,
      );
      assert.equal(row.inputBoundary.next.symbolSites, row.inputBoundary.accepted.symbolSites + 1);
      assert.equal(row.wire[0].inputBytes, row.inputBoundary.accepted.inputBytes);
      assert.equal(row.wire[0].inputSha256, row.inputBoundary.accepted.payloadDigest);
      assert.equal(row.inputBoundary.retainedFieldCount, row.inputBoundary.accepted.memberCount);
      assert.equal(row.inputBoundary.retainedSupportVerified, true);
      assert.equal(row.inputBoundary.nextRefusedBeforeSpawn, true);
      assert.equal(row.inputBoundary.nextRefusal, 'OUTPUT_LIMIT_EXCEEDED');
      t.diagnostic(JSON.stringify(row.inputBoundary));
    }
    assert.equal(
      row.persistedSnapshotCount,
      ['d-rollback', 'd-cancel', 'd-source-race', 'd-partial', 'd-corrupt', 'd-late-exit'].includes(
        name,
      )
        ? 1
        : 2,
    );
    if (['d-partial', 'd-corrupt', 'd-late-exit'].includes(name)) {
      assert.equal(row.fault.applyCalls, 0, 'Provisional events must never reach persistent Apply');
      assert.ok(row.fault.stagedEvents.includes('COVERAGE'));
      assert.ok(row.fault.stagedSummaries > 0);
      if (name === 'd-partial')
        assert.match(row.fault.refusalMessage, /not eligible for publication/);
    }
    if (['d-source-race', 'd-token-race'].includes(name)) {
      assert.equal(row.race.competitorCommits, 1);
      assert.equal(row.race.competitorStatePreserved, true);
      assert.match(
        row.race.refusalMessage,
        name === 'd-source-race'
          ? /Native target revision changed/
          : /Native activation token changed/,
      );
      if (name === 'd-source-race') assert.equal(row.race.competitorRole, 'TEST');
      else {
        assert.equal(row.sqlAdditionalReads.competitor?.scope, 'PREPARATION_READ_ACCOUNTING_ONLY');
        assert.equal(row.sqlAdditionalReads.competitor.readToPreparationVerified, true);
        assert.equal(row.sqlAdditionalReads.retry, null);
        assert.equal(row.sqlCompetitorStage?.scope, 'PREPARATIONS_STAGE_ACCOUNTING_ONLY');
        assert.equal(row.sqlCompetitorStageCaptureFailure, null);
        assert.equal(
          row.sqlCompetitorStage.originalPreparedSqlBytes,
          row.sqlPreparation.retainedSqlBytes,
        );
        assert.equal(
          row.sqlCompetitorStage.competitorPreparedSqlBytes,
          row.sqlAdditionalReads.competitor.additionalPreparationBytes,
        );
        assert.equal(
          row.sqlCompetitorStage.retainedSqlBytes,
          row.sqlPreparation.retainedSqlBytes +
            row.sqlAdditionalReads.competitor.additionalPreparationBytes +
            row.sqlCompetitorStage.stageSqlBytes,
        );
        assert.deepEqual(row.lifecycle.sql.competitorStage, row.sqlCompetitorStage);
        assert.equal(row.race.sameIndexedFingerprint, true);
        assert.equal(row.race.competitorSnapshotId, 'snapshot-d5-competitor');
      }
    }
    if (name === 'd-reopen') {
      assert.equal(row.sqlAdditionalReads.retry?.scope, 'PREPARATION_READ_ACCOUNTING_ONLY');
      assert.equal(row.sqlAdditionalReads.retry.readToPreparationVerified, true);
      assert.equal(row.sqlAdditionalReads.competitor, null);
      assert.equal(row.retry.baselineSnapshotId, 'snapshot-source-refresh');
      assert.deepEqual(row.retry.deltaCounts, { added: 0, modified: 0, deleted: 0 });
    }
    if (['d-slow-sink', 'd-cancel'].includes(name)) {
      assert.equal(row.requestObservation?.scope, 'REQUEST_WORKSPACE_STRUCTURE_ONLY');
      assert.equal(row.requestObservationCaptureFailed, false);
      const request = row.requestObservation.components;
      for (const component of ['ENCODER', 'CLIENT']) {
        assert.equal(request[component].phaseCounts.BEGIN, 1);
        assert.equal(request[component].phaseCounts.EXIT, 1);
      }
      assert.equal(request.PREVALIDATION.phaseCounts.BEGIN, 2);
      assert.equal(request.PREVALIDATION.phaseCounts.VALIDATED, 2);
      assert.equal(request.ENCODER.maxima.joinedBytes, row.wire[0].inputBytes);
      assert.equal(request.CLIENT.maxima.clientBytes, row.wire[0].inputBytes);
      assert.equal(request.ENCODER.maxima.recordCount, row.wire[0].inputRecords);
      assert.equal(request.CLIENT.maxima.recordCount, row.wire[0].inputRecords);
      assert.equal(request.CLIENT.phaseCounts.FAILED ?? 0, name === 'd-cancel' ? 1 : 0);
      assert.equal(row.decoderObservation?.scope, 'DECODER_WORKSPACE_STRUCTURE_ONLY');
      assert.equal(row.decoderObservationCaptureFailed, false);
      assert.equal(row.decoderObservation.phaseCounts.INPUT_COPY, 1);
      assert.equal(row.decoderObservation.phaseCounts.EXIT, 1);
      assert.ok(row.decoderObservation.phaseCounts.SINK_BEGIN > 0);
      assert.equal(
        row.decoderObservation.phaseCounts.SINK_BEGIN -
          (row.decoderObservation.phaseCounts.SINK_SETTLED ?? 0),
        name === 'd-cancel' ? 1 : 0,
      );
      assert.equal(row.decoderObservation.phaseCounts.FAILED ?? 0, name === 'd-cancel' ? 1 : 0);
      const backing = row.wire[0].inputBackingStores;
      assert.equal(backing.scope, 'SUBMITTED_INPUT_BACKING_STORES_ONLY');
      assert.equal(backing.views, row.wire[0].inputRecords);
      assert.equal(backing.distinctStores, 1);
      assert.ok(backing.uniqueBackingBytes >= row.wire[0].inputBytes);
      assert.equal(backing.largestBackingBytes, backing.uniqueBackingBytes);
      assert.equal(row.sink.maximumInFlight, 1);
      assert.ok(row.sink.accepted > 0);
      assert.equal(row.sink.blockedVerified, true);
      assert.ok(row.samples.some((sample) => sample.phase === 'blocked-sink'));
    }
    // The collector must refuse this intentionally incomplete telemetry envelope.
    const { validateRefreshTransportObservation } =
      await import('../../../scripts/native-refresh-transport-memory.mjs');
    assert.throws(() => validateRefreshTransportObservation(row, {}));
  });
test('D5 slow stdin waits for real pipe drain and cancels without Apply across reopen', async (t) => {
  const child = spawnSync(process.execPath, [workerPath, 'offline', 'd-slow-stdin', '0'], {
    encoding: 'utf8',
    timeout: 300_000,
    windowsHide: true,
  });
  assert.equal(child.error, undefined, String(child.error));
  assert.equal(child.status, 0, child.stdout + child.stderr);
  const { row, failure } = JSON.parse(child.stdout);
  assert.equal(failure, null);
  assert.equal(row.status, 'WORKER_PREPARATION_ONLY');
  assert.equal(row.calibrationEligible, false);
  assert.equal(row.name, 'd-slow-stdin');
  assert.equal(row.snapshotMetadataCaptureFailed, false);
  assert.deepEqual(row.snapshotMetadata.entries, []);
  assert.equal(row.expectedOutcome, 'CANCELLED');
  assert.equal(row.observedOutcome, 'CANCELLED');
  assert.equal(row.inputGate.blockedVerified, true);
  assert.ok(row.inputGate.backpressureWrites > 0);
  assert.ok(row.inputGate.writeCalls < row.inputBoundary.accepted.inputRecords);
  assert.equal(row.inputGate.writeCalls, row.inputGate.blockedWriteCalls);
  assert.equal(row.inputGate.endCalls, 0);
  assert.equal(row.inputGate.applyCalls, 0);
  assert.equal(row.inputGate.childClosed, true);
  assert.ok(row.inputGate.maximumPendingBytes > 0);
  assert.ok(row.inputGate.maximumPendingBytes <= row.inputBoundary.accepted.inputBytes);
  assert.equal(row.wire.length, 1);
  assert.ok(row.wire[0].inputBytes > 0);
  assert.ok(row.wire[0].inputBytes < row.inputBoundary.accepted.inputBytes);
  assert.deepEqual(row.wire[0].inputBackingStores, {
    scope: 'SUBMITTED_INPUT_BACKING_STORES_ONLY',
    views: row.inputGate.writeCalls,
    distinctStores: 1,
    uniqueBackingBytes: row.inputBoundary.accepted.inputBytes,
    largestBackingBytes: row.inputBoundary.accepted.inputBytes,
  });
  assert.deepEqual(row.wire[0].streamBuffers, {
    scope: 'WIRE_STREAM_BUFFER_SAMPLES_ONLY',
    maximumPendingInputBytes: row.inputGate.maximumPendingBytes,
    maximumReadableOutputBytes: 0,
    maximumConsumedOutputChunkBytes: 0,
    consumedOutputChunks: 0,
  });
  assert.equal(row.outputBytes, 0);
  assert.equal(row.eventCount, 0);
  assert.equal(row.persistentStateVerified, true);
  assert.equal(row.transactionClosed, true);
  assert.equal(row.tempClosed, true);
  assert.equal(row.persistedSnapshotCount, 1);
  assert.ok(row.samples.some((sample) => sample.phase === 'blocked-stdin'));
  t.diagnostic(
    JSON.stringify({ gate: row.inputGate, input: row.inputBoundary.accepted, wire: row.wire }),
  );
});

test('D5 worker failure delivery serializes primitive initial-read throws without losing the row', async () => {
  const run = await worker();
  const clone = globalThis.structuredClone;
  for (const [failure, diagnostic] of [
    [0, '0'],
    [undefined, 'undefined'],
    [null, 'null'],
    ['', "''"],
    ['read fault', "'read fault'"],
  ]) {
    let copies = 0;
    globalThis.structuredClone = (value, ...args) => {
      if (typeof value?.headerJson === 'string' && Array.isArray(value.files) && ++copies === 2)
        throw failure;
      return clone(value, ...args);
    };
    try {
      const result = await run('offline', 'd-empty', 0);
      assert.equal(result.failure, diagnostic);
      assert.equal(result.row.sqlReadFixtureRole, 'SELECTED_FIXTURE');
      assert.equal(result.row.sqlReadDiagnostic.status, 'THREW');
      assert.equal(result.row.sqlReadDiagnostic.sqlReadOwnership.returnedSqlBytes, null);
      assert.equal(result.row.sqlReadDiagnostic.sqlReadOwnership.phaseCounts.STATE_CLONE_BEGIN, 1);
      assert.equal(
        result.row.sqlReadDiagnostic.sqlReadOwnership.phaseCounts.STATE_CLONE_END,
        undefined,
      );
      assert.equal(result.row.sqlPreparation, null);
      assert.equal(result.row.retainedSqlBytes, null);
      assert.equal(result.row.calibrationEligible, false);
      assert.equal(result.row.samples.at(-1).phase, 'finished');
      assert.equal(result.row.lifecycleCaptureFailure, null);
      assert.equal(result.row.lifecycle.workerFailed, true);
      assert.equal(result.row.lifecycle.sql.readRole, 'SELECTED_FIXTURE');
      assert.ok(result.row.lifecycle.sql.readScopedHighWaterBytes > 0);
      assert.equal(result.row.lifecycle.sql.readReturnedBytes, null);
      assert.equal(result.row.lifecycle.sql.readToPreparationVerified, null);
      assert.equal(result.row.lifecycle.sql.preparationToStageVerified, null);
      assert.deepEqual(result.row.lifecycle.cleanup, cleanLifecycle);
      assert.equal(result.row.lifecycle.verification.persistentStateVerified, false);
      assert.ok(Object.isFrozen(result.row.lifecycle));
      assert.equal(copies, 2);
      assert.doesNotThrow(() => JSON.stringify(result));
    } finally {
      globalThis.structuredClone = clone;
    }
  }
});

for (const name of [
  'd-preparation-input',
  'd-slow-stdin',
  'd-retained-sites',
  'd-shared-owners',
  'd-dense-remove',
  'd-dense-upsert',
  'd-complete-coverage',
  'd-overlay-retention',
])
  test(`D5 worker failure delivery retains a failed generator seed: ${name}`, async () => {
    const run = await worker();
    const clone = globalThis.structuredClone;
    const failure = new Error('Generator initial read fault');
    let copies = 0;
    globalThis.structuredClone = (value, ...args) => {
      if (typeof value?.headerJson === 'string' && Array.isArray(value.files) && ++copies === 2)
        throw failure;
      return clone(value, ...args);
    };
    try {
      const result = await run('offline', name, 0);
      assert.equal(result.failure, failure.stack);
      assert.equal(result.row.sqlReadFixtureRole, 'GENERATOR_SEED');
      assert.equal(result.row.sqlReadDiagnostic?.status, 'THREW');
      assert.equal(result.row.sqlReadDiagnostic.sqlReadOwnership.returnedSqlBytes, null);
      assert.equal(result.row.sqlPreparation, null);
      assert.equal(
        result.row.sqlReadOwnership,
        null,
        'A failed seed is not selected-fixture ownership',
      );
      assert.equal(result.row.calibrationEligible, false);
      assert.equal(result.row.samples.at(-1).phase, 'finished');
      assert.equal(result.row.lifecycleCaptureFailure, null);
      assert.equal(result.row.lifecycle.workerFailed, true);
      assert.equal(result.row.lifecycle.sql.readRole, 'GENERATOR_SEED');
      assert.equal(result.row.lifecycle.sql.knownScopedHighWaterBytes, null);
      assert.equal(result.row.lifecycle.sql.readReturnedBytes, null);
      assert.equal(result.row.lifecycle.cleanup.failed, 0);
      assert.ok(result.row.lifecycle.cleanup.succeeded > 0);
      assert.equal(copies, 2);
    } finally {
      globalThis.structuredClone = clone;
    }
  });

test('D5 worker failure delivery leaves pre-read setup diagnostics absent', async () => {
  const run = await worker();
  const clone = globalThis.structuredClone;
  globalThis.structuredClone = (value, ...args) => {
    if (typeof value?.headerJson === 'string' && Array.isArray(value.files)) throw undefined;
    return clone(value, ...args);
  };
  try {
    const result = await run('offline', 'd-empty', 0);
    assert.equal(result.failure, 'undefined');
    assert.equal(result.row.sqlReadDiagnostic, null);
    assert.equal(result.row.sqlReadFixtureRole, null);
    assert.equal(result.row.sqlReadOwnership, null);
    assert.equal(result.row.sqlPreparation, null);
    assert.equal(result.row.calibrationEligible, false);
    assert.equal(result.row.samples.at(-1).phase, 'finished');
    assert.equal(result.row.lifecycleCaptureFailure, null);
    assert.equal(result.row.lifecycle.workerFailed, true);
    assert.equal(result.row.lifecycle.sql.readRole, null);
    assert.equal(result.row.lifecycle.sql.knownScopedHighWaterBytes, null);
    assert.deepEqual(result.row.lifecycle.cleanup, cleanLifecycle);
  } finally {
    globalThis.structuredClone = clone;
  }
});

test('D5 worker failure delivery CLI exits nonzero and emits one row for an empty thrown value', () => {
  const preload =
    "const clone=globalThis.structuredClone;let copies=0;globalThis.structuredClone=(value,...args)=>{if(typeof value?.headerJson==='string'&&Array.isArray(value.files)&&++copies===2)throw '';return clone(value,...args);};";
  const child = spawnSync(
    process.execPath,
    [
      '--import',
      'data:text/javascript,' + encodeURIComponent(preload),
      workerPath,
      'offline',
      'd-empty',
      '0',
    ],
    {
      encoding: 'utf8',
      timeout: 60_000,
      windowsHide: true,
    },
  );
  assert.equal(child.error, undefined);
  assert.equal(child.status, 1, child.stdout + child.stderr);
  const lines = child.stdout.trim().split('\n');
  assert.equal(lines.length, 1);
  const result = JSON.parse(lines[0]);
  assert.equal(result.failure, "''");
  assert.equal(result.row.sqlReadDiagnostic.status, 'THREW');
  assert.equal(result.row.samples.at(-1).phase, 'finished');
  assert.equal(result.row.calibrationEligible, false);
});

test('D5 worker refuses unknown classes and actual mode rather than issuing synthetic measurements', async () => {
  const run = await worker();
  await assert.rejects(run('offline', 'd-not-a-class', 0), /recipe not materialized/);
  await assert.rejects(run('actual', 'd-empty', 0), /Actual collection not implemented/);
  await assert.rejects(run('offline', 'd-empty', -1));
});

test('D5 SQL enlargement refuses before Native TEXT reads, validation or REFRESH and survives reopen', async () => {
  const child = spawnSync(process.execPath, [workerPath, 'offline', 'd-sql-preflight', '0'], {
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true,
  });
  assert.equal(child.status, 0, child.stdout + child.stderr);
  const { row, failure } = JSON.parse(child.stdout);
  assert.equal(failure, null);
  assert.equal(row.observedOutcome, 'RESOURCE_LIMIT_EXCEEDED');
  assert.equal(row.expectedOutcome, 'RESOURCE_LIMIT_EXCEEDED');
  assert.equal(row.snapshotMetadataCaptureFailed, false);
  assert.deepEqual(row.snapshotMetadata.entries, []);
  assert.equal(row.preflight.enlargedBytes, row.preflight.maxSerializedBytes + 1);
  assert.equal(row.preflight.nativeTextReads, 0);
  assert.equal(row.preflight.validationCalls, 0);
  assert.deepEqual(row.wire, []);
  assert.equal(row.outputBytes, 0);
  assert.equal(row.eventCount, 0);
  assert.equal(row.persistentStateVerified, true);
  assert.equal(row.transactionClosed, true);
  assert.equal(row.tempClosed, true);
  assert.equal(row.persistedSnapshotCount, 1);
  assert.equal(row.preflight.injectedStatePreserved, true);
  assert.equal(row.lifecycleCaptureFailure, null);
  assert.equal(row.lifecycle.workerFailed, false);
  assert.equal(row.lifecycle.sql.readToPreparationVerified, true);
  assert.equal(row.lifecycle.sql.preparationToStageVerified, null);
  assert.equal(row.lifecycle.sql.stageScopedHighWaterBytes, null);
  assert.equal(row.lifecycle.sql.preparedStageScopedHighWaterBytes, null);
  assert.equal(row.lifecycle.sql.completeRetainedSqlBytes, null);
  assert.deepEqual(row.lifecycle.cleanup, cleanLifecycle);
  assert.deepEqual(row.lifecycle.verification, {
    persistentStateVerified: true,
    transactionClosed: true,
    tempClosed: true,
  });
  assert.equal(row.calibrationEligible, false);
  assert.equal(row.status, 'WORKER_PREPARATION_ONLY');
  assert.ok(row.samples.some((sample) => sample.phase === 'sql-preflight-refused'));
  assert.match(row.recipe.payloadDigest, /^[a-f0-9]{64}$/);
});

test('fault child control is valid through decoder, Stage and real Application/Store Apply', async (t) => {
  const { preparedSourceRefresh, sourceTransitions, activationImage } =
    await import('./helpers/native-refresh-source-fixture.mjs');
  const { applyPreparedNativeRefreshAnalysisV3 } =
    await import('../dist/native-refresh-workspace.js');
  const { DatabaseSync } = await import('node:sqlite');
  const f = await preparedSourceRefresh(
    t,
    sourceTransitions.find((row) => row.id === 'empty-file-noop'),
  );
  const helperPath = fileURLToPath(
    new URL('./helpers/native-refresh-fault-process.mjs', import.meta.url),
  );
  await applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, {
    ...f.options,
    executablePath: process.execPath,
    arguments: [helperPath, 'valid-noop'],
  });
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 2);
  assert.equal(
    f.db.prepare('SELECT provider_snapshot_id AS id FROM native_analysis_state').get().id,
    'snapshot-source-refresh',
  );
  assert.equal(f.db.isTransaction, false);
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM sqlite_temp_master WHERE name LIKE 'patch_%'").get().n,
    0,
  );
  const committed = activationImage(f.db);
  f.db.close();
  const reopened = new DatabaseSync(f.databasePath);
  try {
    assert.deepEqual(activationImage(reopened), committed);
  } finally {
    reopened.close();
  }
});

async function probe() {
  const module = await import('./helpers/native-refresh-wire-probe.mjs').catch((error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  });
  assert.equal(typeof module.observeNativeWire, 'function', 'Physical wire probe missing');
  return module.observeNativeWire;
}
test('D5 wire failure discriminator distinguishes successful nullish returns from thrown values', async () => {
  const observe = await probe();
  const originalSpawn = spawn;
  for (const value of [null, undefined, 0, '']) {
    const result = await observe(() => value);
    assert.equal(result.threw, false);
    assert.equal(result.value, value);
    assert.equal(result.error, null);
    assert.deepEqual(result.wire, []);
    assert.equal(spawn, originalSpawn);
  }
  for (const failure of [0, null, undefined, '', new Error('wire fault')]) {
    const result = await observe(() => {
      throw failure;
    });
    assert.equal(result.threw, true);
    assert.equal(result.value, null);
    assert.equal(result.error, failure);
    assert.deepEqual(result.wire, []);
    assert.equal(spawn, originalSpawn);
  }
});

test('D5 wire failure discriminator preserves seal throws and the reopened old image', async () => {
  const { RepositoryPatchStage } = await import('../../storage/dist/index.js');
  const { DatabaseSync } = await import('node:sqlite');
  const { activationImage } = await import('./helpers/native-refresh-source-fixture.mjs');
  const run = await worker();
  const seal = RepositoryPatchStage.prototype.sealNativePatchState;
  const close = DatabaseSync.prototype.close;
  for (const [failure, diagnostic] of [
    [0, '0'],
    [null, 'null'],
    [undefined, 'undefined'],
    ['', "''"],
  ]) {
    let before,
      databasePath,
      checked = false,
      faulted = false;
    DatabaseSync.prototype.close = function (...args) {
      const path = this.prepare('PRAGMA database_list')
        .all()
        .find((row) => row.name === 'main').file;
      if (path === databasePath || !databasePath) {
        // Migration connections have no committed bootstrap yet.
        const table = this.prepare(
          "SELECT count(*) AS n FROM sqlite_master WHERE name='provider_snapshots'",
        ).get().n;
        if (table && this.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n === 1) {
          databasePath = path;
          if (!before) before = activationImage(this);
          if (faulted) {
            assert.equal(this.isTransaction, false);
            assert.equal(
              this.prepare(
                "SELECT count(*) AS n FROM sqlite_temp_master WHERE name LIKE 'patch_%' OR type='trigger'",
              ).get().n,
              0,
            );
            assert.deepEqual(activationImage(this), before);
            checked = true;
          }
        }
      }
      const result = close.apply(this, args);
      if (faulted && path === databasePath) {
        const reopened = new DatabaseSync(databasePath);
        try {
          assert.deepEqual(activationImage(reopened), before);
        } finally {
          close.call(reopened);
        }
      }
      return result;
    };
    RepositoryPatchStage.prototype.sealNativePatchState = function (...args) {
      seal.apply(this, args);
      faulted = true;
      throw failure;
    };
    try {
      const result = await run('offline', 'd-empty', 0);
      assert.equal(result.failure, diagnostic);
      assert.equal(result.row.observedOutcome, 'WORKER_EXCEPTION');
      assert.equal(result.row.measurement, null);
      assert.equal(result.row.wire.length, 1);
      assert.equal(result.row.samples.at(-1).phase, 'finished');
      assert.equal(result.row.calibrationEligible, false);
      assert.equal(faulted, true);
      assert.equal(checked, true);
    } finally {
      RepositoryPatchStage.prototype.sealNativePatchState = seal;
      DatabaseSync.prototype.close = close;
    }
  }
});

test('D5 submitted input backing stores deduplicate views without counting probe string conversions', async () => {
  const observe = await probe();
  const result = await observe(async () => {
    const child = spawn(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], {
      windowsHide: true,
    });
    const closed = once(child, 'close');
    const shared = Buffer.allocUnsafeSlow(64);
    shared.write('abc\ndef\n');
    const separate = Buffer.allocUnsafeSlow(32);
    separate.write('ghi\n');
    child.stdin.write(shared.subarray(0, 4));
    child.stdin.write(shared.subarray(4, 8));
    child.stdin.write(separate.subarray(0, 4));
    child.stdin.write('四\n');
    child.stdin.end(shared.subarray(0, 4));
    let output = '';
    for await (const chunk of child.stdout) output += chunk.toString('utf8');
    assert.equal((await closed)[0], 0);
    return output;
  });
  assert.equal(result.threw, false);
  assert.equal(result.value, 'abc\ndef\nghi\n四\nabc\n');
  assert.equal(result.wire[0].inputBytes, 20);
  assert.deepEqual(result.wire[0].inputBackingStores, {
    scope: 'SUBMITTED_INPUT_BACKING_STORES_ONLY',
    views: 4,
    distinctStores: 2,
    uniqueBackingBytes: 96,
    largestBackingBytes: 64,
  });
  assert.ok(Object.isFrozen(result.wire[0].inputBackingStores));
});

test('D5 submitted input backing stores report no typed buffers for string-only input', async () => {
  const observe = await probe();
  const result = await observe(async () => {
    const child = spawn(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], {
      windowsHide: true,
    });
    const closed = once(child, 'close');
    child.stdin.end('四\n');
    let output = '';
    for await (const chunk of child.stdout) output += chunk.toString('utf8');
    assert.equal((await closed)[0], 0);
    return output;
  });
  assert.equal(result.threw, false);
  assert.equal(result.value, '四\n');
  assert.equal(result.wire[0].inputBytes, 4);
  assert.deepEqual(result.wire[0].inputBackingStores, {
    scope: 'SUBMITTED_INPUT_BACKING_STORES_ONLY',
    views: 0,
    distinctStores: 0,
    uniqueBackingBytes: 0,
    largestBackingBytes: 0,
  });
});

test('D5 wire buffers sample real stream queues without replacing wire totals', async () => {
  const observe = await probe();
  let pendingPeak = 0,
    readablePeak = 0,
    chunkPeak = 0,
    chunks = 0;
  const result = await observe(async () => {
    const child = spawn(
      process.execPath,
      [
        '-e',
        "process.stdin.resume(); process.stdin.on('end',()=>process.stdout.write('four\\nend'))",
      ],
      { windowsHide: true },
    );
    const closed = once(child, 'close');
    const sample = () => {
      pendingPeak = Math.max(pendingPeak, child.stdin.writableLength);
      readablePeak = Math.max(readablePeak, child.stdout.readableLength);
    };
    sample();
    child.stdin.write('abc\n');
    sample();
    child.stdin.end('四\n');
    sample();
    let output = '';
    for await (const chunk of child.stdout) {
      sample();
      chunkPeak = Math.max(chunkPeak, chunk.byteLength);
      chunks++;
      output += chunk.toString('utf8');
    }
    assert.equal((await closed)[0], 0);
    sample();
    return output;
  });
  assert.equal(result.error, null);
  assert.equal(result.value, 'four\nend');
  assert.equal(result.wire[0].inputBytes, 8);
  assert.equal(result.wire[0].outputBytes, 8);
  assert.deepEqual(result.wire[0].streamBuffers, {
    scope: 'WIRE_STREAM_BUFFER_SAMPLES_ONLY',
    maximumPendingInputBytes: pendingPeak,
    maximumReadableOutputBytes: readablePeak,
    maximumConsumedOutputChunkBytes: chunkPeak,
    consumedOutputChunks: chunks,
  });
  assert.ok(Object.isFrozen(result.wire[0].streamBuffers));
});
test('D5 wire buffers keep consumed chunk maxima separate from accumulated output', async () => {
  const observe = await probe();
  let chunks = 0,
    peak = 0;
  const result = await observe(async () => {
    const child = spawn(
      process.execPath,
      [
        '-e',
        "process.stdout.write('abc'); process.stdin.once('data',()=>process.stdout.end('12345')); process.stdin.resume()",
      ],
      { windowsHide: true },
    );
    const closed = once(child, 'close');
    let output = '';
    for await (const chunk of child.stdout) {
      chunks++;
      peak = Math.max(peak, chunk.byteLength);
      output += chunk.toString('utf8');
      if (chunks === 1) child.stdin.end('go\n');
    }
    assert.equal((await closed)[0], 0);
    return output;
  });
  assert.equal(result.error, null);
  assert.equal(result.value, 'abc12345');
  assert.equal(result.wire[0].outputBytes, 8);
  assert.ok(chunks >= 2);
  assert.ok(peak < 8);
  assert.equal(result.wire[0].streamBuffers.maximumConsumedOutputChunkBytes, peak);
  assert.equal(result.wire[0].streamBuffers.consumedOutputChunks, chunks);
});
test('physical wire probe counts original UTF8/whitespace/LF bytes and restores spawn', async () => {
  const observe = await probe();
  const originalSpawn = spawn;
  const output = ' { "x": "🐎" } \nlast\n';
  const observedChunks = [];
  const result = await observe(
    async () => {
      const child = spawn(
        process.execPath,
        [
          '-e',
          `process.stdin.resume(); process.stdin.on('end',()=>process.stdout.write(${JSON.stringify(output)}))`,
        ],
        { windowsHide: true },
      );
      const closed = once(child, 'close');
      child.stdin.write('abc\n');
      const multibyte = Buffer.from('四');
      child.stdin.write(multibyte.subarray(0, 1));
      child.stdin.write(multibyte.subarray(1, 2));
      child.stdin.end(Buffer.concat([multibyte.subarray(2), Buffer.from('\n')]));
      const chunks = [];
      for await (const chunk of child.stdout) chunks.push(chunk);
      assert.equal((await closed)[0], 0);
      return Buffer.concat(chunks).toString('utf8');
    },
    (chunk) => observedChunks.push(Buffer.from(chunk)),
  );
  assert.equal(result.error, null);
  assert.equal(result.value, output);
  assert.equal(Buffer.concat(observedChunks).toString('utf8'), output);
  assert.equal(spawn, originalSpawn);
  const [{ streamBuffers, inputBackingStores, ...physicalWire }] = result.wire;
  assert.equal(inputBackingStores.scope, 'SUBMITTED_INPUT_BACKING_STORES_ONLY');
  assert.equal(streamBuffers.scope, 'WIRE_STREAM_BUFFER_SAMPLES_ONLY');
  assert.equal(
    streamBuffers.maximumConsumedOutputChunkBytes,
    Math.max(...observedChunks.map((chunk) => chunk.byteLength)),
  );
  assert.equal(streamBuffers.consumedOutputChunks, observedChunks.length);
  assert.deepEqual(
    [physicalWire],
    [
      {
        inputBytes: 8,
        inputRecords: 2,
        largestInputLineBytes: 3,
        inputLfTerminated: true,
        outputBytes: Buffer.byteLength(output),
        outputRecords: 2,
        largestOutputLineBytes: Buffer.byteLength(output.split('\n')[0]),
        outputLfTerminated: true,
        inputSha256: createHash('sha256').update('abc\n四\n').digest('hex'),
        outputSha256: createHash('sha256').update(output).digest('hex'),
      },
    ],
  );
});
test('physical wire probe preserves the original operation failure and restores spawn', async () => {
  const observe = await probe();
  const originalSpawn = spawn;
  const error = new Error('Apply failed');
  const result = await observe(async () => {
    throw error;
  });
  assert.equal(result.error, error);
  assert.equal(result.value, null);
  assert.deepEqual(result.wire, []);
  assert.equal(spawn, originalSpawn);
});

test('physical wire probe retains failed-child unterminated output without inventing a record', async () => {
  const observe = await probe();
  const originalSpawn = spawn;
  const error = new Error('Nonzero child exit');
  const result = await observe(async () => {
    const child = spawn(
      process.execPath,
      [
        '-e',
        "process.stdin.resume(); process.stdin.on('end',()=>process.stdout.write('raw-tail',()=>process.exit(7)))",
      ],
      { windowsHide: true },
    );
    const closed = once(child, 'close');
    child.stdin.end();
    for await (const _chunk of child.stdout) {
      /* Drain the actual stream. */
    }
    assert.equal((await closed)[0], 7);
    throw error;
  });
  assert.equal(result.error, error);
  assert.equal(result.wire.length, 1);
  assert.equal(result.wire[0].inputBytes, 0);
  assert.equal(result.wire[0].outputBytes, 8);
  assert.equal(result.wire[0].streamBuffers?.scope, 'WIRE_STREAM_BUFFER_SAMPLES_ONLY');
  assert.ok(result.wire[0].streamBuffers?.maximumConsumedOutputChunkBytes > 0);
  assert.ok(result.wire[0].streamBuffers.maximumConsumedOutputChunkBytes <= 8);
  assert.equal(result.wire[0].outputRecords, 0);
  assert.equal(result.wire[0].largestOutputLineBytes, 8);
  assert.equal(result.wire[0].outputLfTerminated, false);
  assert.equal(result.wire[0].outputSha256, createHash('sha256').update('raw-tail').digest('hex'));
  assert.equal(spawn, originalSpawn);
});
