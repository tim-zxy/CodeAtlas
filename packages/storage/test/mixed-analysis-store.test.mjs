import { readComponentReference } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { observationFixture, ownerFixture } from './helpers/mixed-analysis-fixture.mjs';
import { historyLimits, referenceCanonical } from './helpers/r011-history-fixture.mjs';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
const w = 'fixtures/phase1/mixed-analysis-stage/component-references';
const api = async () => {
  const u = new URL('../dist/analysis/mixed-analysis-store.js', import.meta.url);
  assert.ok(fs.existsSync(u), 'real Store implementation must exist');
  return import(u.href);
};
import { allRows, frozen } from './helpers/mixed-analysis-store-fixture.mjs';
for (const id of ['java-only', 'mixed', 'python-only'])
  test(
    'Store applies real frozen full target with exact independent persistent rows ' + id,
    async (t) => {
      const { MixedAnalysisStore } = await api(),
        f = await frozen(t, id),
        before = allRows(f.db),
        ref = JSON.parse(readComponentReference(w + '/store-row-independent/' + id + '.json')),
        expected = {
          ...before,
          ...Object.fromEntries(
            Object.entries(ref.tables).map(([k, rows]) => [
              k,
              rows.sort((a, b) =>
                referenceCanonical(a) < referenceCanonical(b)
                  ? -1
                  : referenceCanonical(a) > referenceCanonical(b)
                    ? 1
                    : 0,
              ),
            ]),
          ),
        },
        store = new MixedAnalysisStore(f.db),
        idOut = store.apply(f.token.lease, historyLimits);
      assert.equal(idOut, ref.expected.activationId);
      assert.deepEqual(allRows(f.db), expected);
      const h = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
      assert.deepEqual(h.view.history, ref.expected.manifest);
      assert.deepEqual(h.view.activeBasis, ref.expected.basis);
      assert.throws(
        () => store.apply(f.token.lease, historyLimits),
        (e) => e.code === 'STAGE_RELEASED',
      );
      const readonly = f.reopen(true);
      assert.deepEqual(allRows(readonly), expected);
      f.stage.close();
    },
  );
for (const kind of ['clone', 'cross-db', 'source', 'temp', 'ambient', 'begin', 'snapshot-write'])
  test(
    'Store refuses ' + kind + ' with complete last-good rows and no reusable lease',
    async (t) => {
      const { MixedAnalysisStore } = await api(),
        f = await frozen(t),
        before = allRows(f.db);
      let db = f.db,
        lease = f.token.lease;
      if (kind === 'clone') lease = {};
      if (kind === 'cross-db') db = (await observationFixture(t, 'mixed')).db;
      if (kind === 'source')
        f.db.prepare("UPDATE source_files SET content_fingerprint='new-source'").run();
      if (kind === 'temp')
        f.db.prepare("UPDATE mixed_stage SET value_json='{}' WHERE key='FROZEN'").run();
      if (kind === 'ambient') f.db.exec('BEGIN');
      const external = allRows(f.db);
      if (kind === 'begin') {
        const original = f.db.exec;
        f.db.exec = function (sql) {
          if (sql === 'BEGIN IMMEDIATE') throw Error('injected');
          return original.call(this, sql);
        };
      }
      if (kind === 'snapshot-write')
        f.db.exec(
          "CREATE TEMP TRIGGER refuse_snapshot BEFORE INSERT ON main.provider_snapshots BEGIN SELECT RAISE(ABORT,'INJECTED'); END",
        );
      const store = new MixedAnalysisStore(db);
      assert.throws(
        () => store.apply(lease, historyLimits),
        (e) => e.message === e.code,
      );
      if (kind === 'ambient') {
        assert.equal(f.db.isTransaction, true);
        f.db.exec('ROLLBACK');
      }
      assert.deepEqual(allRows(f.db), kind === 'source' ? external : before);
      if (!['clone', 'cross-db'].includes(kind))
        assert.throws(
          () => store.apply(f.token.lease, historyLimits),
          (e) => e.code === 'STAGE_RELEASED',
        );
      f.stage.close();
    },
  );

for (const point of ['begin-after-open', 'commit-before', 'commit-after', 'post-commit-close'])
  test(
    'Store settlement boundary ' + point + ' keeps exact rows and a permanently dead lease',
    async (t) => {
      const { MixedAnalysisStore, inspectMixedAnalysisOutcome } = await api();
      const f = await frozen(t),
        before = allRows(f.db),
        original = f.db.exec;
      let injected = 0;
      f.db.exec = function (sql) {
        if (point === 'begin-after-open' && sql === 'BEGIN IMMEDIATE') {
          original.call(this, sql);
          injected++;
          throw Error('injected');
        }
        if (point === 'commit-before' && sql === 'COMMIT') {
          injected++;
          throw Error('injected');
        }
        if (point === 'commit-after' && sql === 'COMMIT') {
          original.call(this, sql);
          injected++;
          throw Error('injected');
        }
        if (point === 'post-commit-close' && sql === 'DROP TABLE temp.mixed_stage') {
          injected++;
          throw Error('injected');
        }
        return original.call(this, sql);
      };
      const store = new MixedAnalysisStore(f.db);
      if (point === 'post-commit-close')
        assert.equal(
          store.apply(f.token.lease, historyLimits),
          JSON.parse(readComponentReference(w + '/store-row-independent/mixed.json')).expected
            .activationId,
        );
      else
        assert.throws(
          () => store.apply(f.token.lease, historyLimits),
          (e) =>
            e.code ===
            (point.startsWith('commit-') ? 'COMMIT_OUTCOME_UNKNOWN' : 'INVALID_CANDIDATE'),
        );
      assert.equal(injected, 1);
      assert.equal(
        f.db.isTransaction,
        false,
        'Store must not leak its own BEGIN when execution throws after acquiring',
      );
      f.db.exec = original;
      assert.throws(
        () => store.apply(f.token.lease, historyLimits),
        (e) => e.code === 'STAGE_RELEASED',
      );
      const after = allRows(f.db),
        expectedCommitted = point === 'commit-after' || point === 'post-commit-close';
      if (!expectedCommitted) assert.deepEqual(after, before);
      else {
        const target = JSON.parse(readComponentReference(w + '/store-row-independent/mixed.json'));
        const expected = { ...before, ...target.tables };
        for (const rows of Object.values(expected))
          rows.sort((a, b) =>
            referenceCanonical(a) < referenceCanonical(b)
              ? -1
              : referenceCanonical(a) > referenceCanonical(b)
                ? 1
                : 0,
          );
        assert.deepEqual(after, expected);
      }
      assert.equal(typeof inspectMixedAnalysisOutcome, 'function');
      const result = inspectMixedAnalysisOutcome(store, historyLimits);
      assert.equal(result.status, expectedCommitted ? 'COMMITTED' : 'NOT_COMMITTED');
      assert.equal(result.cleanupFailed, point === 'post-commit-close');
      assert.deepEqual(allRows(f.reopen(true)), after);
      f.stage.close();
    },
  );

test('readonly unknown classification refuses an externally inconsistent complete state', async (t) => {
  const { MixedAnalysisStore, inspectMixedAnalysisOutcome } = await api();
  const f = await frozen(t),
    original = f.db.exec;
  f.db.exec = function (sql) {
    if (sql === 'COMMIT') {
      original.call(this, sql);
      throw Error('injected');
    }
    return original.call(this, sql);
  };
  const store = new MixedAnalysisStore(f.db);
  assert.throws(
    () => store.apply(f.token.lease, historyLimits),
    (e) => e.code === 'COMMIT_OUTCOME_UNKNOWN',
  );
  f.db.exec = original;
  f.db.prepare("UPDATE analysis_diagnostics SET message='changed diagnostic'").run();
  // This Fixture can have no diagnostics: a real unrelated persisted Source mutation must still be visible.
  f.db.prepare("UPDATE source_files SET content_fingerprint='changed-after-unknown'").run();
  const before = allRows(f.db);
  assert.equal(inspectMixedAnalysisOutcome(store, historyLimits).status, 'INCONSISTENT');
  assert.deepEqual(allRows(f.db), before);
  f.stage.close();
});

import { committedPythonFixture } from './helpers/mixed-analysis-store-fixture.mjs';
test('Store real full re-establishment keeps exact parent, supersedes old support and preserves physical coverage', async (t) => {
  const { MixedAnalysisStore } = await api(),
    f = await committedPythonFixture(t),
    before = allRows(f.db),
    oldPointer = before.active_history_pointer[0].activation_id;
  const id = new MixedAnalysisStore(f.db).apply(f.token.lease, historyLimits),
    after = allRows(f.db),
    h = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  assert.equal(h.view.history.parent.activationId, oldPointer);
  assert.equal(h.view.history.transitions, null);
  assert.equal(h.view.history.state.snapshots.length, 2);
  assert.equal(after.provider_snapshots.length, before.provider_snapshots.length + 1);
  for (const e of before.evidence)
    assert.equal(after.evidence.find((v) => v.id === e.id).status, 'SUPERSEDED');
  for (const r of before.analysis_coverage)
    assert.deepEqual(
      after.analysis_coverage.find((v) => v.id === r.id),
      r,
    );
  assert.equal(after.active_history_pointer[0].activation_id, id);
  assert.deepEqual(allRows(f.reopen(true)), after);
});
test('Store applies actual delete-only delta without fabricating snapshots or observations', async (t) => {
  const { MixedAnalysisStore } = await api(),
    f = await ownerFixture(t, 'delta-delete-only'),
    before = allRows(f.db),
    h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
    stage = new MixedAnalysisStage(
      f.db,
      h.handle,
      'DELTA',
      historyLimits,
      createMixedAnalysisRules(),
    ),
    owner = stage.prepareOwner(null, f.preparation);
  stage.acceptObservation(owner.ownerHandle, null);
  const token = stage.freeze(),
    id = new MixedAnalysisStore(f.db).apply(token.lease, historyLimits),
    after = allRows(f.db),
    current = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  assert.equal(current.view.history.observation, null);
  assert.equal(current.view.history.transitions.kind, 'TRANSITION_DRAFT');
  assert.equal(
    current.view.history.parent.activationId,
    before.active_history_pointer[0].activation_id,
  );
  assert.deepEqual(after.provider_snapshots, before.provider_snapshots);
  assert.deepEqual(after.provider_capabilities, before.provider_capabilities);
  assert.deepEqual(after.analysis_coverage, before.analysis_coverage);
  assert.deepEqual(after.canonical_nodes, []);
  assert.deepEqual(after.canonical_edges, []);
  assert.equal(after.active_history_pointer[0].activation_id, id);
  assert.deepEqual(allRows(f.reopen(true)), after);
});

import { injectWriteBoundary, writePoints } from './helpers/mixed-analysis-faults.mjs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cases as storeCases,
  loadCase as loadStoreCase,
} from '../../../fixtures/phase1/mixed-analysis-store/corpus.mjs';
const storeFixtureRoot = new URL('../../../fixtures/phase1/mixed-analysis-store/', import.meta.url),
  recoveryBindings = JSON.parse(
    fs.readFileSync(new URL('recovery-execution-bindings.json', storeFixtureRoot)),
  ),
  recoveryCases = storeCases.filter((c) => c.family === 'WRITE_RECOVERY');
assert.equal(recoveryCases.length, 19);
assert.deepEqual(
  recoveryBindings.cases.map((c) => c.point),
  writePoints,
);
function independentRecoveryTarget(before) {
  const ref = JSON.parse(readComponentReference(w + '/store-row-independent/mixed.json'));
  return {
    ...before,
    ...Object.fromEntries(
      Object.entries(ref.tables).map(([key, rows]) => [
        key,
        rows.sort((a, b) =>
          referenceCanonical(a) < referenceCanonical(b)
            ? -1
            : referenceCanonical(a) > referenceCanonical(b)
              ? 1
              : 0,
        ),
      ]),
    ),
  };
}
for (const fixture of recoveryCases) {
  const { input, expected } = loadStoreCase(fixture),
    binding = recoveryBindings.cases.find((c) => c.id === fixture.id),
    point = input.point;
  assert.ok(binding);
  assert.equal(binding.point, point);
  assert.equal(input.processExit, true);
  assert.equal(expected.leaseReusable, false);
  assert.equal(binding.effectiveExpected.result, expected.result);
  for (const key of ['input', 'expected'])
    assert.equal(
      createHash('sha256')
        .update(fs.readFileSync(new URL(fixture[key], storeFixtureRoot)))
        .digest('hex'),
      binding[key + 'Sha256'],
    );
  assert.equal(
    binding.effectiveExpected.persistentRows,
    ['commit-unknown', 'post-commit-close'].includes(point)
      ? 'EXACT_INDEPENDENT_FROZEN_TARGET'
      : 'EXACT_BOUND_LITERAL_CONTEXT',
  );
  if (point === 'commit-unknown') {
    assert.equal(expected.persistentRows, 'EXACT_LITERAL_BASE');
    assert.ok(binding.expectedCorrection.includes('after successful actual COMMIT'));
  }

  test(
    'real SQL fault boundary ' + point + ' restores exact last-good rows or committed target',
    async (t) => {
      const { MixedAnalysisStore, inspectMixedAnalysisOutcome } = await api(),
        f = point === 'evidence-retire' ? await committedPythonFixture(t) : await frozen(t),
        before = allRows(f.db),
        fault = injectWriteBoundary(f.db, point, () => {
          throw Error('injected');
        }),
        store = new MixedAnalysisStore(f.db);
      if (point === 'post-commit-close')
        assert.equal(typeof store.apply(f.token.lease, historyLimits), 'string');
      else
        assert.throws(
          () => store.apply(f.token.lease, historyLimits),
          (e) =>
            e.message === e.code &&
            (point !== 'commit-unknown' || e.code === 'COMMIT_OUTCOME_UNKNOWN'),
        );
      assert.equal(fault.hits(), 1);
      fault.restore();
      assert.equal(f.db.isTransaction, false);
      assert.throws(
        () => store.apply(f.token.lease, historyLimits),
        (e) => e.code === 'STAGE_RELEASED',
      );
      if (!['commit-unknown', 'post-commit-close'].includes(point))
        assert.deepEqual(allRows(f.db), before);
      else {
        assert.deepEqual(allRows(f.db), independentRecoveryTarget(before));
        const outcome = inspectMixedAnalysisOutcome(store, historyLimits);
        assert.equal(outcome.status, 'COMMITTED');
        if (point === 'post-commit-close') assert.equal(outcome.cleanupFailed, true);
      }
      assert.deepEqual(allRows(f.reopen(true)), allRows(f.db));
      f.stage.close();
    },
  );
  test(
    'actual Node exit at ' + point + ' recovers complete persisted state on fresh readonly reopen',
    async (t) => {
      // The parent only creates literal seed data; the child executes its own real Stage/Store and exits at the actual boundary.
      const f =
        point === 'evidence-retire'
          ? await committedPythonFixture(t)
          : await observationFixture(t, 'mixed');
      if (point === 'evidence-retire') f.stage.close();
      const before = allRows(f.db),
        id = point === 'evidence-retire' ? 'python-only' : 'mixed';
      f.db.close();
      const child = spawnSync(
        process.execPath,
        [
          new URL('./helpers/mixed-analysis-crash-worker.mjs', import.meta.url).pathname.replace(
            /^\/([A-Za-z]:)/,
            '$1',
          ),
          f.databasePath,
          point,
          id,
        ],
        {
          encoding: 'utf8',
          env: {
            SystemRoot: process.env.SystemRoot,
            TEMP: process.env.TEMP,
            TMP: process.env.TMP,
            PATH: process.env.PATH,
          },
        },
      );
      assert.equal(child.status, 73, child.stderr + child.stdout);
      assert.equal(child.signal, null);
      const readonly = f.reopen(true),
        after = allRows(readonly);
      if (!['commit-unknown', 'post-commit-close'].includes(point)) assert.deepEqual(after, before);
      else {
        const target = JSON.parse(readComponentReference(w + '/store-row-independent/mixed.json')),
          expected = { ...before, ...target.tables };
        for (const rows of Object.values(expected))
          rows.sort((a, b) =>
            referenceCanonical(a) < referenceCanonical(b)
              ? -1
              : referenceCanonical(a) > referenceCanonical(b)
                ? 1
                : 0,
          );
        assert.deepEqual(after, expected);
      }
      const h = captureActivationContext(readonly, f.input.repositoryId, historyLimits);
      if (['commit-unknown', 'post-commit-close'].includes(point))
        assert.deepEqual(
          h.view.history,
          JSON.parse(readComponentReference(w + '/store-row-independent/mixed.json')).expected
            .manifest,
        );
      else
        assert.equal(
          h.view.history?.parent?.activationId ?? null,
          point === 'evidence-retire'
            ? (JSON.parse(before.activation_history[0].manifest_json).parent?.activationId ?? null)
            : null,
        );
    },
  );
}

for (const kind of [
  'same-connection-aba',
  'other-connection-aba',
  'rows',
  'bytes',
  'items',
  'memory',
])
  test('Store lock/whole-operation guard refuses ' + kind + ' before publishing', async (t) => {
    const { MixedAnalysisStore } = await api(),
      f = await frozen(t),
      before = allRows(f.db);
    let limits = historyLimits;
    if (kind.endsWith('-aba')) {
      const db = kind.startsWith('other-') ? f.reopen() : f.db;
      db.exec('BEGIN');
      db.prepare("UPDATE source_files SET path=path||'.temporary'").run();
      db.prepare('UPDATE source_files SET path=substr(path,1,length(path)-10)').run();
      db.exec('COMMIT');
      assert.deepEqual(allRows(f.db), before);
    } else
      limits = {
        ...historyLimits,
        [{
          rows: 'maxRows',
          bytes: 'maxSerializedBytes',
          items: 'maxItems',
          memory: 'memoryBudgetBytes',
        }[kind]]: 1,
      };
    const store = new MixedAnalysisStore(f.db);
    assert.throws(
      () => store.apply(f.token.lease, limits),
      (e) => e.code === (kind.endsWith('-aba') ? 'STAGE_CHANGED' : 'STAGE_LIMIT_EXCEEDED'),
    );
    assert.deepEqual(allRows(f.db), before);
    assert.equal(f.db.isTransaction, false);
    assert.throws(
      () => store.apply(f.token.lease, historyLimits),
      (e) => e.code === 'STAGE_RELEASED',
    );
    f.stage.close();
  });
for (const method of ['prepareOwner', 'acceptObservation', 'freeze', 'close'])
  test(
    'real APPLYING refuses ' + method + ' while preserving Store transaction ownership',
    async (t) => {
      const { MixedAnalysisStore } = await api(),
        f = await frozen(t),
        original = f.db.exec;
      let seen = 0;
      f.db.exec = function (sql) {
        if (sql === 'BEGIN IMMEDIATE') {
          seen++;
          assert.throws(
            () => f.stage[method](null, null),
            (e) => e.code === 'INVALID_STAGE',
          );
        }
        return original.call(this, sql);
      };
      const id = new MixedAnalysisStore(f.db).apply(f.token.lease, historyLimits);
      assert.equal(typeof id, 'string');
      assert.equal(seen, 1);
      assert.equal(f.db.isTransaction, false);
      f.db.exec = original;
      assert.deepEqual(allRows(f.reopen(true)), allRows(f.db));
      f.stage.close();
    },
  );

test('a real closed frozen lease is released rather than a forged token', async (t) => {
  const { MixedAnalysisStore } = await api(),
    f = await frozen(t),
    before = allRows(f.db);
  f.stage.close();
  assert.throws(
    () => new MixedAnalysisStore(f.db).apply(f.token.lease, historyLimits),
    (e) => e.code === 'STAGE_RELEASED',
  );
  assert.deepEqual(allRows(f.db), before);
});
test('reentrant real APPLYING.apply returns INVALID_STAGE and leaves the original apply usable', async (t) => {
  const { MixedAnalysisStore } = await api(),
    f = await frozen(t),
    store = new MixedAnalysisStore(f.db),
    original = f.db.exec;
  let hits = 0;
  f.db.exec = function (sql) {
    if (sql === 'BEGIN IMMEDIATE') {
      hits++;
      assert.throws(
        () => store.apply(f.token.lease, historyLimits),
        (e) => e.code === 'INVALID_STAGE',
      );
    }
    return original.call(this, sql);
  };
  assert.equal(typeof store.apply(f.token.lease, historyLimits), 'string');
  assert.equal(hits, 1);
  f.db.exec = original;
});
test('CONSUMED methods keep STAGE_RELEASED even when committed cleanup failed', async (t) => {
  const { MixedAnalysisStore } = await api(),
    f = await frozen(t),
    original = f.db.exec;
  f.db.exec = function (sql) {
    if (sql === 'DROP TABLE temp.mixed_stage') throw Error('injected');
    return original.call(this, sql);
  };
  new MixedAnalysisStore(f.db).apply(f.token.lease, historyLimits);
  for (const method of ['prepareOwner', 'acceptObservation', 'freeze'])
    assert.throws(
      () => f.stage[method](null, null),
      (e) => e.code === 'STAGE_RELEASED',
    );
  f.db.exec = original;
  f.stage.close();
});
test('rollback failure remains unknown and cannot be classified not-committed while its writer transaction is open', async (t) => {
  const { MixedAnalysisStore, inspectMixedAnalysisOutcome } = await api(),
    f = await frozen(t),
    before = allRows(f.db),
    original = f.db.exec,
    fault = injectWriteBoundary(f.db, 'node', () => {
      throw Error('injected');
    }),
    wrapped = f.db.exec;
  f.db.exec = function (sql) {
    if (sql === 'ROLLBACK') throw Error('rollback-injected');
    return wrapped.call(this, sql);
  };
  const store = new MixedAnalysisStore(f.db);
  assert.throws(
    () => store.apply(f.token.lease, historyLimits),
    (e) => e.code === 'COMMIT_OUTCOME_UNKNOWN',
  );
  assert.equal(f.db.isTransaction, true);
  assert.equal(inspectMixedAnalysisOutcome(store, historyLimits).status, 'INCONSISTENT');
  fault.restore();
  f.db.exec = original;
  f.db.exec('ROLLBACK');
  assert.deepEqual(allRows(f.db), before);
  f.stage.close();
});
