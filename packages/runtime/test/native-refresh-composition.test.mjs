import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import * as runtime from '../dist/index.js';
import { NativeClientError } from '../../providers/dist/index.js';
import { RepositoryCanonicalFactStore, RepositoryPatchStage } from '../../storage/dist/index.js';
import { preparedEmptyRefresh } from './helpers/native-refresh-d-fixture.mjs';
import {
  preparedSourceRefresh,
  sourceTransitions,
  assertSourceRelations,
  activationImage,
  observeRefreshBaselineRead,
} from './helpers/native-refresh-source-fixture.mjs';
const load = (path) =>
  import(path).catch((error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  });

const composition = await load('../dist/native-refresh-composition.js');
const workspace = await load('../dist/native-refresh-workspace.js');
const sqlLifetime = await import('../../storage/dist/analysis/native-apply-sql-observation.js');
const compositionObservation = await load('../dist/native-refresh-composition-observation.js');

test('D5 replay worker guarded continuation cannot escape its observation lifetime', async () => {
  let escaped,
    calls = 0;
  await assert.rejects(
    () =>
      compositionObservation.observeNativeRefreshComposition(
        () =>
          compositionObservation.applyObservedNativeRefreshComposition(
            Object.freeze({}),
            async () => {
              calls++;
            },
          ),
        async (_prepared, apply) => {
          escaped = apply;
        },
      ),
    /once/,
  );
  assert.throws(() => escaped(), /settled|lifetime|active/i);
  assert.equal(calls, 0);
});

for (const scenario of [
  'original_result',
  'original_falsy_error',
  'double_apply',
  'missing_apply',
  'unawaited_apply',
])
  test(`D5 replay worker guarded continuation ${scenario}`, async () => {
    assert.equal(typeof compositionObservation.observeNativeRefreshComposition, 'function');
    assert.equal(typeof compositionObservation.applyObservedNativeRefreshComposition, 'function');
    const prepared = Object.freeze({ marker: 'original prepared object' });
    let calls = 0;
    const result = { original: true };
    const operation = async () => {
      calls++;
      await new Promise((resolve) => setImmediate(resolve));
      if (scenario === 'original_falsy_error') throw 0;
      return result;
    };
    const invoke = () =>
      compositionObservation.observeNativeRefreshComposition(
        () => compositionObservation.applyObservedNativeRefreshComposition(prepared, operation),
        async (observed, apply) => {
          assert.strictEqual(observed, prepared);
          if (scenario === 'missing_apply') return 'forged result';
          if (scenario === 'unawaited_apply') {
            void apply();
            return 'forged result';
          }
          try {
            await apply();
          } catch (error) {
            assert.equal(error, 0);
          }
          if (scenario === 'double_apply') await apply();
          return 'forged result';
        },
      );
    if (scenario === 'original_falsy_error') await assert.rejects(invoke, (error) => error === 0);
    else if (scenario === 'double_apply') await assert.rejects(invoke, /once/);
    else if (scenario === 'missing_apply') await assert.rejects(invoke, /once/);
    else assert.strictEqual(await invoke(), result);
    assert.equal(calls, scenario === 'missing_apply' ? 0 : 1);
    assert.strictEqual(
      await compositionObservation.applyObservedNativeRefreshComposition(prepared, () => result),
      result,
    );
  });

async function unmatchedComposition(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-refresh-unmatched-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const isolated = path.join(directory, 'packages/runtime');
  await mkdir(isolated, { recursive: true });
  await cp(new URL('../dist', import.meta.url), path.join(isolated, 'dist'), { recursive: true });
  await cp(new URL('../package.json', import.meta.url), path.join(isolated, 'package.json'));
  for (const name of ['providers', 'storage', 'application'])
    await symlink(
      fileURLToPath(new URL(`../../${name}`, import.meta.url)),
      path.join(directory, 'packages', name),
      'junction',
    );
  // Keep approved profiles intact. A real added implementation file makes this
  // isolated build unmatched, independently of the caller's ample budget.
  await writeFile(path.join(isolated, 'dist/unmatched-build.js'), 'export const changed = true;\n');
  return {
    composition: await import(
      pathToFileURL(path.join(isolated, 'dist/native-refresh-composition.js')).href
    ),
    observation: await import(
      pathToFileURL(path.join(isolated, 'dist/native-refresh-composition-observation.js')).href
    ),
  };
}

test('D5 replay worker actual profile absence precedes observer opener SQL and Stage', async (t) => {
  const isolated = await unmatchedComposition(t);
  assert.equal(typeof compositionObservation.observeNativeRefreshComposition, 'function');
  const db = new DatabaseSync(':memory:');
  let observerCalls = 0,
    openerCalls = 0,
    sqlCalls = 0;
  db.prepare = () => {
    sqlCalls++;
    assert.fail('Admission must precede SQL');
  };
  try {
    await assert.rejects(
      () =>
        isolated.observation.observeNativeRefreshComposition(
          () =>
            isolated.composition.applyNativeRefreshAnalysisV3(
              db,
              1_000_000_000,
              () => {
                openerCalls++;
                assert.fail('Admission must precede context');
              },
              {},
            ),
          () => {
            observerCalls++;
            assert.fail('Admission must precede observer');
          },
        ),
      /reviewed|profile|environment/i,
    );
    assert.deepEqual([observerCalls, openerCalls, sqlCalls], [0, 0, 0]);
  } finally {
    db.close();
  }
});

test('D5 retry Apply counter sees the actual Store below nested collectors', async (t) => {
  const worker = await import('./helpers/native-refresh-transport-worker.mjs');
  const f = await preparedEmptyRefresh(t);
  const original = RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch;
  const capture = await worker.observeRetryApplyCalls(() =>
    worker.observeRefreshApplySql(() =>
      workspace.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
    ),
  );
  assert.equal(capture.threw, false);
  assert.equal(capture.guarded, true);
  assert.equal(capture.applyCalls, 1);
  assert.equal(capture.value.applyCalls, 1);
  assert.equal(capture.value.threw, false);
  assert.equal(RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch, original);
  noTempStage(f.db);
  assert.equal(f.db.isTransaction, false);
  const reopened = new DatabaseSync(f.databasePath);
  try {
    assert.equal(reopened.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 2);
    assert.equal(
      reopened.prepare('SELECT provider_snapshot_id AS id FROM native_analysis_state').get().id,
      'snap-runtime-next',
    );
  } finally {
    reopened.close();
  }
});

test('D5 retry Apply counter proves actual reopened read and preparation make zero calls', async (t) => {
  const worker = await import('./helpers/native-refresh-transport-worker.mjs');
  const { createNativeRefreshPreparation } = await import('../dist/native-refresh-preparation.js');
  const row = sourceTransitions.find((item) => item.id === 'modify-call-target');
  const f = await preparedSourceRefresh(t, row);
  await workspace.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options);
  const reopened = new DatabaseSync(f.databasePath);
  const original = RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch;
  try {
    assertSourceRelations(reopened, row.relations);
    const committed = activationImage(reopened);
    const capture = await worker.observeRetryApplyCalls(() => {
      const observed = observeRefreshBaselineRead(
        reopened,
        f.prepared.trustedContext,
        f.prepared.limits,
      );
      if (observed.value === null) throw observed.error;
      assert.equal(observed.value.status, 'AVAILABLE');
      const {
        baseRevisionId,
        baseRevisionFingerprint,
        baselineState,
        targetSourceFiles,
        changes,
        ...payload
      } = f.prepared.request.payload;
      const retry = createNativeRefreshPreparation(
        {
          requestId: 'd5-counted-retry',
          descriptor: f.prepared.descriptor,
          trustedContext: f.prepared.trustedContext,
          payload: { ...payload, providerSnapshotId: 'snapshot-counted-retry' },
        },
        observed.value,
        f.prepared.limits.memoryBudgetBytes,
        f.options,
      );
      try {
        assert.equal(
          retry.token.states.find((state) => state.providerId === 'native')?.snapshotId,
          'snapshot-source-refresh',
        );
        return Object.fromEntries(
          Object.entries(retry.request.payload.changes).map(([key, value]) => [key, value.length]),
        );
      } finally {
        sqlLifetime.endNativeSqlSourceFor(retry);
      }
    });
    assert.equal(capture.threw, false);
    assert.equal(capture.guarded, true);
    assert.equal(capture.applyCalls, 0);
    assert.deepEqual(capture.value, { added: 0, modified: 0, deleted: 0 });
    assert.equal(RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch, original);
    noTempStage(reopened);
    assert.equal(reopened.isTransaction, false);
    assert.deepEqual(activationImage(reopened), committed);
  } finally {
    reopened.close();
  }
});

test('D5 retry Apply counter preserves falsy failures and restores its method', async () => {
  const worker = await import('./helpers/native-refresh-transport-worker.mjs');
  const original = RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch;
  const capture = await worker.observeRetryApplyCalls(() => {
    throw 0;
  });
  assert.equal(capture.threw, true);
  assert.equal(capture.error, 0);
  assert.equal(capture.guarded, true);
  assert.equal(capture.applyCalls, 0);
  assert.equal(RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch, original);
});

test('D5 retry Apply counter refuses a replaced entry point', async () => {
  const worker = await import('./helpers/native-refresh-transport-worker.mjs');
  const original = RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch;
  const capture = await worker.observeRetryApplyCalls(() => {
    RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch = () => {};
    return false;
  });
  assert.equal(capture.threw, false);
  assert.equal(capture.value, false);
  assert.equal(capture.guarded, false);
  assert.equal(RepositoryCanonicalFactStore.prototype.applyNativeAnalysisPatch, original);
});

test('D5 lifetime family real Native composition observes four raw source families', async (t) => {
  const row = sourceTransitions.find((row) => row.id === 'modify-call-target');
  const f = await preparedSourceRefresh(t, row);
  const families = ['COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY'];
  const capture = await sqlLifetime.observeNativeSqlLifetime(
    () => workspace.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
    families.map((family) => ({ family, role: 'MAIN', disposition: 'OBSERVED' })),
  );
  assert.equal(capture.threw, false);
  assert.equal(capture.captureFailed, false);
  assert.equal(capture.evidence.coverageComplete, true);
  assert.deepEqual(
    capture.evidence.coverage.map((row) => [row.family, row.disposition]),
    families.map((family) => [family, 'OBSERVED']),
  );
  assert.ok(capture.evidence.retainedSqlBytes > 0);
  assert.equal(
    capture.evidence.retainedSqlStringChargeBytes,
    2 * capture.evidence.retainedSqlBytes,
  );
  noTempStage(f.db);
  assert.equal(f.db.isTransaction, false);
  const reopened = new DatabaseSync(f.databasePath);
  try {
    assertSourceRelations(reopened, row.relations);
  } finally {
    reopened.close();
  }
});
const noTempStage = (db) =>
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM sqlite_temp_master WHERE name LIKE 'patch_%'").get().n,
    0,
  );

test('D5 lifetime family empty Native queries positively prove no TEXT', async (t) => {
  // An unexecuted/short-circuited query must not qualify an empty family.
  const f = await preparedEmptyRefresh(t);
  const capture = await sqlLifetime.observeNativeSqlLifetime(
    () => workspace.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
    [
      { family: 'COMPLETION', role: 'MAIN', disposition: 'PROVEN_NO_TEXT' },
      { family: 'NORMALIZE', role: 'MAIN', disposition: 'PROVEN_NO_TEXT' },
      { family: 'SEAL', role: 'MAIN', disposition: 'OBSERVED' },
      { family: 'APPLY', role: 'MAIN', disposition: 'OBSERVED' },
    ],
  );
  assert.equal(capture.threw, false);
  assert.equal(capture.captureFailed, false);
  assert.equal(capture.evidence.coverageComplete, true);
  assert.deepEqual(
    capture.evidence.coverage.map((item) => item.disposition),
    ['PROVEN_NO_TEXT', 'PROVEN_NO_TEXT', 'OBSERVED', 'OBSERVED'],
  );
  noTempStage(f.db);
  assert.equal(f.db.isTransaction, false);
  const reopened = new DatabaseSync(f.databasePath);
  try {
    assert.equal(reopened.prepare('SELECT count(*) AS n FROM canonical_nodes').get().n, 0);
    assert.equal(reopened.prepare('SELECT count(*) AS n FROM canonical_edges').get().n, 0);
    assert.equal(reopened.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 2);
    assert.equal(
      reopened.prepare('SELECT provider_snapshot_id AS id FROM native_analysis_state').get().id,
      'snap-runtime-next',
    );
  } finally {
    reopened.close();
  }
});

for (const [method, missingFamily] of [
  ['readDiagnostics', 'COMPLETION'],
  ['readRemoveEdges', 'NORMALIZE'],
])
  test(`D5 empty query proof real Native rejects unexecuted ${method}`, async (t) => {
    const f = await preparedEmptyRefresh(t);
    // An empty replacement omits the actual SQL query and its positive completion signal.
    t.mock.method(RepositoryPatchStage.prototype, method, function* () {});
    const capture = await sqlLifetime.observeNativeSqlLifetime(
      () => workspace.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
      [
        { family: 'COMPLETION', role: 'MAIN', disposition: 'PROVEN_NO_TEXT' },
        { family: 'NORMALIZE', role: 'MAIN', disposition: 'PROVEN_NO_TEXT' },
        { family: 'SEAL', role: 'MAIN', disposition: 'OBSERVED' },
        { family: 'APPLY', role: 'MAIN', disposition: 'OBSERVED' },
      ],
    );
    assert.equal(capture.threw, false);
    assert.equal(
      capture.evidence.coverage.find((item) => item.family === missingFamily).disposition,
      'UNKNOWN',
    );
    assert.equal(capture.evidence.coverageComplete, false);
    assert.equal(capture.evidence.retainedSqlBytes, null);
    noTempStage(f.db);
    assert.equal(f.db.isTransaction, false);
  });

test('D5 lifetime family PARTIAL proves downstream no-call and exact recovery', async (t) => {
  // Missing guarded proofs must fail even when cleanup and the old graph happen to survive.
  const row = sourceTransitions.find((row) => row.id === 'syntax-partial-retained-restart');
  const f = await preparedSourceRefresh(t, row);
  const before = activationImage(f.db);
  let sealCalls = 0,
    applyCalls = 0;
  // Guard the forbidden calls themselves: an unchanged DB alone cannot prove no-call.
  t.mock.method(RepositoryPatchStage.prototype, 'sealNativePatchState', () => {
    sealCalls++;
    throw new Error('PARTIAL unexpectedly entered Seal');
  });
  t.mock.method(RepositoryCanonicalFactStore.prototype, 'applyNativeAnalysisPatch', () => {
    applyCalls++;
    throw new Error('PARTIAL unexpectedly entered Apply');
  });
  let normalizationCalls = -1;
  const capture = await sqlLifetime.observeNativeSqlLifetime(async () => {
    const normalization = await workspace.observeNativeRefreshNormalizationSql(
      () => workspace.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
      () => assert.fail('PARTIAL must not normalize SQL'),
    );
    normalizationCalls = normalization.normalizationCalls;
    assert.equal(normalization.captureFailed, false);
    if (normalization.threw) throw normalization.error;
    return normalization.value;
  }, [
    { family: 'COMPLETION', role: 'MAIN', disposition: 'OBSERVED' },
    { family: 'NORMALIZE', role: 'MAIN', disposition: 'PROVEN_NOT_REACHED' },
    { family: 'SEAL', role: 'MAIN', disposition: 'PROVEN_NOT_REACHED' },
    { family: 'APPLY', role: 'MAIN', disposition: 'PROVEN_NOT_REACHED' },
  ]);
  assert.equal(capture.threw, true);
  assert.match(capture.error.message, /Analysis patch is not eligible for publication/);
  assert.equal(normalizationCalls, 0);
  assert.equal(sealCalls, 0);
  assert.equal(applyCalls, 0);
  assert.equal(capture.captureFailed, false);
  assert.equal(capture.evidence.coverageComplete, true);
  assert.deepEqual(
    capture.evidence.coverage.map((item) => item.disposition),
    ['OBSERVED', 'PROVEN_NOT_REACHED', 'PROVEN_NOT_REACHED', 'PROVEN_NOT_REACHED'],
  );
  assert.ok(capture.evidence.retainedSqlBytes > 0);
  noTempStage(f.db);
  assert.equal(f.db.isTransaction, false);
  const reopened = new DatabaseSync(f.databasePath);
  try {
    assert.deepEqual(activationImage(reopened), before);
  } finally {
    reopened.close();
  }
});

test('D5 lifetime family pre-aborted transport proves downstream no-call and exact recovery', async (t) => {
  const f = await preparedEmptyRefresh(t);
  const before = activationImage(f.db);
  const controller = new AbortController();
  controller.abort();
  const capture = await sqlLifetime.observeNativeSqlLifetime(
    () =>
      workspace.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, {
        ...f.options,
        signal: controller.signal,
      }),
    ['COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY'].map((family) => ({
      family,
      role: 'MAIN',
      disposition: 'PROVEN_NOT_REACHED',
    })),
  );
  assert.equal(capture.threw, true);
  assert.equal(capture.error.code, 'CANCELLED');
  assert.deepEqual(
    capture.evidence.coverage.map((item) => item.disposition),
    ['PROVEN_NOT_REACHED', 'PROVEN_NOT_REACHED', 'PROVEN_NOT_REACHED', 'PROVEN_NOT_REACHED'],
  );
  assert.equal(capture.captureFailed, false);
  assert.equal(capture.evidence.coverageComplete, true);
  assert.equal(capture.evidence.retainedSqlBytes, 0);
  assert.equal(capture.evidence.retainedSqlStringChargeBytes, 0);
  noTempStage(f.db);
  assert.equal(f.db.isTransaction, false);
  const reopened = new DatabaseSync(f.databasePath);
  try {
    assert.deepEqual(activationImage(reopened), before);
  } finally {
    reopened.close();
  }
});

test('D5 original SQL retention refuses before TEMP or Apply when reservation leaves one byte too little', async (t) => {
  const f = await preparedEmptyRefresh(t);
  const before = activationImage(f.db);
  const prepared = {
    ...f.prepared,
    // Component arithmetic, not a reviewed profile or product configuration.
    retainedSqlBytes: 1,
    limits: { ...f.prepared.limits, workspaceReservationBytes: f.budget - 1 },
  };
  await assert.rejects(
    workspace.applyPreparedNativeRefreshAnalysisV3(f.db, prepared, f.options),
    (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
  );
  noTempStage(f.db);
  const reopened = new DatabaseSync(f.databasePath);
  try {
    assert.deepEqual(activationImage(reopened), before);
  } finally {
    reopened.close();
  }
});

for (const row of sourceTransitions)
  for (const workers of [1, 2])
    test(`offline real Rust bootstrap/refresh/reopen preserves history: ${row.id}, workers=${workers}`, async (t) => {
      // Catches wrong target/reselection and relabeling retained Evidence to the new snapshot.
      const f = await preparedSourceRefresh(t, row, workers);
      const before = activationImage(f.db);
      if (row.outcome === 'PARTIAL') {
        await assert.rejects(
          workspace.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
          /not eligible for publication/,
        );
        noTempStage(f.db);
        const reopened = new DatabaseSync(f.databasePath);
        try {
          assert.deepEqual(activationImage(reopened), before);
        } finally {
          reopened.close();
        }
        return;
      }
      await workspace.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options);
      noTempStage(f.db);
      const reopened = new DatabaseSync(f.databasePath);
      try {
        assertSourceRelations(reopened, row.relations);
        assert.equal(reopened.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 2);
        assert.equal(
          reopened.prepare('SELECT indexed_content_fingerprint FROM repository_state').get()
            .indexed_content_fingerprint,
          f.targetRevision.contentFingerprint,
        );
        assert.equal(
          reopened.prepare('SELECT provider_snapshot_id FROM native_analysis_state').get()
            .provider_snapshot_id,
          'snapshot-source-refresh',
        );
        assert.equal(
          reopened.prepare('SELECT count(*) AS n FROM native_analysis_file').get().n,
          f.targetFiles.length,
        );
        const retained = f.oldEvidence.filter(
          (e) =>
            reopened.prepare('SELECT status FROM evidence WHERE id=?').get(e.id)?.status ===
            'ACTIVE',
        );
        if (
          [
            'modify-call-target',
            'add-class-method-unknown-to-resolved',
            'delete-class-resolved-to-unknown',
          ].includes(row.id)
        )
          assert.ok(retained.length > 0, 'unchanged Native supports remain active');
        for (const evidence of retained)
          assert.deepEqual(
            reopened.prepare('SELECT * FROM evidence WHERE id=?').get(evidence.id),
            evidence,
          );
        assert.equal(
          reopened.prepare('SELECT count(*) AS n FROM evidence').get().n >= f.oldEvidence.length,
          true,
        );
        for (const old of f.oldEvidence) {
          const current = reopened.prepare('SELECT * FROM evidence WHERE id=?').get(old.id);
          assert.ok(current, 'historical Evidence is not deleted');
          assert.deepEqual({ ...current, status: old.status }, { ...old });
        }
        if (row.shared)
          assert.equal(
            reopened
              .prepare("SELECT count(*) AS n FROM canonical_nodes WHERE kind='PACKAGE' AND name=?")
              .get(row.shared.name).n,
            row.shared.count,
          );
        if (f.targetFiles.length === 0) {
          assert.equal(reopened.prepare('SELECT count(*) AS n FROM canonical_nodes').get().n, 0);
          assert.equal(reopened.prepare('SELECT count(*) AS n FROM canonical_edges').get().n, 0);
        }
      } finally {
        reopened.close();
      }
    });

for (const [label, timing, operation, table] of [
  ['support retirement', 'AFTER', 'UPDATE', 'evidence'],
  ['snapshot insertion', 'AFTER', 'INSERT', 'provider_snapshots'],
  ['upsert candidate', 'AFTER', 'INSERT', 'active_support_candidates'],
  ['summary deletion', 'AFTER', 'DELETE', 'native_analysis_state'],
  ['summary file insertion', 'AFTER', 'INSERT', 'native_analysis_file'],
  ['pointer update', 'AFTER', 'UPDATE', 'repository_state'],
])
  test(`offline nonzero Rust refresh rollback/reopen: ${label}`, async (t) => {
    const f = await preparedSourceRefresh(
      t,
      sourceTransitions.find((row) => row.id === 'modify-call-target'),
    );
    const before = activationImage(f.db);
    f.db.exec(
      `CREATE TRIGGER fail_source_apply ${timing} ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'source apply failure'); END`,
    );
    await assert.rejects(
      workspace.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
      /source apply failure/,
    );
    noTempStage(f.db);
    const reopened = new DatabaseSync(f.databasePath);
    try {
      assert.deepEqual(activationImage(reopened), before);
    } finally {
      reopened.close();
    }
  });

for (const phase of ['normalization', 'overlay-seal'])
  test(`offline actual Rust ${phase} failure closes TEMP and preserves exact reopened state`, async (t) => {
    const f = await preparedSourceRefresh(
      t,
      sourceTransitions.find((row) => row.id === 'modify-call-target'),
    );
    const before = activationImage(f.db);
    const exec = f.db.exec.bind(f.db);
    let installed = 0;
    f.db.exec = (sql) => {
      const result = exec(sql);
      if (sql.includes('CREATE TEMP TABLE patch_normalized')) {
        exec(
          phase === 'normalization'
            ? "CREATE TEMP TRIGGER fail_normalization AFTER INSERT ON patch_normalized BEGIN SELECT RAISE(ABORT,'injected normalization failure'); END"
            : "CREATE TEMP TRIGGER corrupt_overlay AFTER INSERT ON patch_normalized BEGIN UPDATE patch_native_summary SET summary_json=json_set(summary_json,'$.sourceFile.contentFingerprint','injected-fingerprint'); END",
        );
        installed += 1;
      }
      return result;
    };
    try {
      let lifetimeCapture;
      await assert.rejects(
        (async () => {
          lifetimeCapture = await sqlLifetime.observeNativeSqlLifetime(
            () => workspace.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options),
            ['COMPLETION', 'NORMALIZE', 'SEAL', 'APPLY'].map((family) => ({
              family,
              role: 'MAIN',
              disposition: 'OBSERVED',
            })),
          );
          if (lifetimeCapture.threw) throw lifetimeCapture.error;
          return lifetimeCapture.value;
        })(),
        phase === 'normalization'
          ? /injected normalization failure/
          : (error) => error.nativeStateReason === 'INVALID',
      );
      assert.equal(lifetimeCapture.captureFailed, false);
      assert.equal(lifetimeCapture.evidence.coverageComplete, false);
      assert.equal(lifetimeCapture.evidence.retainedSqlBytes, null);
      assert.equal(
        lifetimeCapture.evidence.coverage.find((item) => item.family === 'APPLY').disposition,
        'UNKNOWN',
      );
      assert.ok(
        lifetimeCapture.evidence.coverage.every(
          (item) => item.disposition !== 'PROVEN_NOT_REACHED',
        ),
        'Post-transport failures cannot borrow transport no-call proof',
      );
      assert.equal(installed, 1);
      assert.equal(f.db.isTransaction, false);
      noTempStage(f.db);
      assert.equal(
        f.db.prepare("SELECT count(*) AS n FROM sqlite_temp_master WHERE type='trigger'").get().n,
        0,
      );
      const reopened = new DatabaseSync(f.databasePath);
      try {
        assert.deepEqual(activationImage(reopened), before);
      } finally {
        reopened.close();
      }
    } finally {
      f.db.exec = exec;
    }
  });

for (const budget of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
  test(`refresh composition refuses invalid budget ${budget} before opener/database`, async () => {
    assert.equal(typeof composition.applyNativeRefreshAnalysisV3, 'function');
    let opened = 0;
    await assert.rejects(
      composition.applyNativeRefreshAnalysisV3(
        null,
        budget,
        () => {
          opened++;
          throw new Error('OPENER_REACHED');
        },
        null,
      ),
      (error) => error.code === 'INVALID_CONFIGURATION',
    );
    assert.equal(opened, 0);
  });

test('refresh composition missing exact transport profile refuses before opener/database', async (t) => {
  const isolated = await unmatchedComposition(t);
  assert.equal(typeof composition.applyNativeRefreshAnalysisV3, 'function');
  let opened = 0;
  await assert.rejects(
    isolated.composition.applyNativeRefreshAnalysisV3(
      null,
      1_000_000_000,
      () => {
        opened++;
        throw new Error('OPENER_REACHED');
      },
      null,
    ),
    (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
  );
  assert.equal(opened, 0);
  assert.equal('applyNativeRefreshAnalysisV3' in runtime, false);
});

test('prepared refresh retains the validated indexed state for the stage, not a rebuilt ledger', async (t) => {
  const fixture = await preparedEmptyRefresh(t);
  assert.deepEqual(fixture.prepared.baselineState, fixture.baseline.state);
  assert.equal(Object.isFrozen(fixture.prepared.baselineState), true);
});

test('offline real Rust empty refresh coactivates through Application/Store and reopens', async (t) => {
  assert.equal(typeof workspace.applyPreparedNativeRefreshAnalysisV3, 'function');
  const f = await preparedEmptyRefresh(t);
  const measured = await workspace.applyPreparedNativeRefreshAnalysisV3(
    f.db,
    f.prepared,
    f.options,
  );
  noTempStage(f.db);
  assert.ok(measured.transportMs >= 0);
  assert.ok(measured.stageBytes > 0);
  assert.equal(measured.stageRetention.scope, 'STAGE_SQL_ACCOUNTING_ONLY');
  assert.ok(measured.stageRetention.retainedSqlBytes > 0);
  assert.equal(
    measured.stageRetention.retainedSqlStringChargeBytes,
    2 * measured.stageRetention.retainedSqlBytes,
  );
  assert.ok(
    measured.stageRetention.retainedStringChargePeakBytes >
      measured.stageRetention.retainedSqlStringChargeBytes,
  );
  assert.equal(measured.nativeParseMs, null);
  assert.equal(measured.childPeakBytes, null);
  assert.equal(measured.effectiveWorkers, 1);
  assert.equal(measured.nodePeakMethod, 'resourceUsage.maxRSS');
  assert.equal(measured.nodePeakUnits, 'bytes');
  assert.equal(measured.nodePeakScope, 'PROCESS_LIFETIME_HIGH_WATER');
  assert.ok(Number.isSafeInteger(measured.nodePeakBytes) && measured.nodePeakBytes > 0);
  assert.equal(measured.requestedWorkers, 1);
  const reopened = new DatabaseSync(f.databasePath);
  try {
    assert.equal(reopened.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 2);
    assert.equal(
      reopened.prepare('SELECT provider_snapshot_id FROM native_analysis_state').get()
        .provider_snapshot_id,
      'snap-runtime-next',
    );
    assert.equal(
      reopened.prepare('SELECT indexed_content_fingerprint FROM repository_state').get()
        .indexed_content_fingerprint,
      'base',
    );
  } finally {
    reopened.close();
  }
});

test('offline Runtime transport failure leaves the committed image intact and closes TEMP', async (t) => {
  const f = await preparedEmptyRefresh(t);
  const before = activationImage(f.db);
  await assert.rejects(
    workspace.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, {
      ...f.options,
      executablePath: f.options.executablePath + '.missing',
    }),
    (error) => error instanceof NativeClientError && error.code === 'PROTOCOL_VIOLATION',
  );
  noTempStage(f.db);
  const reopened = new DatabaseSync(f.databasePath);
  try {
    assert.deepEqual(activationImage(reopened), before);
  } finally {
    reopened.close();
  }
});

test('offline Runtime Store failure rolls back and always closes its TEMP stage', async (t) => {
  assert.equal(typeof workspace.applyPreparedNativeRefreshAnalysisV3, 'function');
  const f = await preparedEmptyRefresh(t);
  const before = activationImage(f.db);
  f.db.exec(
    "CREATE TRIGGER fail_runtime_pointer BEFORE UPDATE ON repository_state BEGIN SELECT RAISE(ABORT,'pointer failure'); END",
  );
  await assert.rejects(workspace.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, f.options));
  noTempStage(f.db);
  const reopened = new DatabaseSync(f.databasePath);
  try {
    assert.deepEqual(activationImage(reopened), before);
    assert.equal(reopened.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 1);
    assert.equal(
      reopened.prepare('SELECT provider_snapshot_id FROM native_analysis_state').get()
        .provider_snapshot_id,
      'snap',
    );
  } finally {
    reopened.close();
  }
});

test('offline Runtime cancellation before spawn preserves state and closes TEMP', async (t) => {
  const f = await preparedEmptyRefresh(t);
  const controller = new AbortController();
  controller.abort();
  const before = activationImage(f.db);
  await assert.rejects(
    workspace.applyPreparedNativeRefreshAnalysisV3(f.db, f.prepared, {
      ...f.options,
      signal: controller.signal,
    }),
    (error) => error instanceof NativeClientError && error.code === 'CANCELLED',
  );
  noTempStage(f.db);
  const reopened = new DatabaseSync(f.databasePath);
  try {
    assert.deepEqual(activationImage(reopened), before);
  } finally {
    reopened.close();
  }
});
