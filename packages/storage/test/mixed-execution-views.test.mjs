import test from 'node:test';
import assert from 'node:assert/strict';
import {
  historyFixture,
  nativeEmptyHistoryInput,
  seedLiteral,
  historyLimits,
} from './helpers/r011-history-fixture.mjs';
import { frozen, allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import * as stageAPI from '../dist/analysis/mixed-analysis-stage.js';
import * as storeAPI from '../dist/analysis/mixed-analysis-store.js';
import { beginMixedSourceAccount } from '../dist/analysis/mixed-source-account.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
async function base(t, mode = 'DELTA') {
  const f = await historyFixture(t, 'available', { seed: false }),
    input = await nativeEmptyHistoryInput();
  seedLiteral(f.db, input);
  const capture = captureActivationContext(f.db, input.repositoryId, historyLimits);
  const prelude = beginMixedSourceAccount(historyLimits, {
    signal: new AbortController().signal,
    deadlineEpochMs: Date.now() + 60000,
    maxInputBytes: Number.MAX_SAFE_INTEGER,
  });
  const stage = new stageAPI.MixedAnalysisStage(
    f.db,
    capture.handle,
    mode,
    historyLimits,
    createMixedAnalysisRules(),
    prelude.budget,
  );
  t.after(() => stage.close());
  return {
    ...f,
    input,
    capture,
    stage,
    ...prelude,
    contracts: capture.view.history.state.contracts,
  };
}
test('A5 NO_OP returns authenticated immutable old basis without OWNER/history writes', async (t) => {
  const f = await base(t),
    before = allRows(f.db);
  const value = stageAPI.readMixedNoOpBasis(f.stage, f.contracts);
  assert.deepEqual(value, {
    basis: f.capture.view.history.state.basis,
    activationId: f.input.tables.active_history_pointer[0].activation_id,
  });
  assert.ok(Object.isFrozen(value.basis));
  assert.deepEqual(allRows(f.db), before);
  assert.equal(f.db.prepare("SELECT count(*) n FROM mixed_stage WHERE key='OWNER'").get().n, 0);
});
for (const kind of ['contracts', 'source', 'history', 'full', 'foreign'])
  test('A5 NO_OP refuses or declines ' + kind, async (t) => {
    const f = await base(t, kind === 'full' ? 'FULL' : 'DELTA');
    let contracts = structuredClone(f.contracts);
    if (kind === 'contracts') contracts[0].policy += '-changed';
    if (kind === 'source')
      f.db.prepare("UPDATE source_files SET content_fingerprint='changed'").run();
    if (kind === 'history') f.db.prepare('DELETE FROM active_history_pointer').run();
    if (kind === 'contracts') assert.equal(stageAPI.readMixedNoOpBasis(f.stage, contracts), null);
    else
      assert.throws(() =>
        stageAPI.readMixedNoOpBasis(kind === 'foreign' ? {} : f.stage, contracts),
      );
  });
for (const kind of ['committed', 'begin', 'unknown', 'cleanup'])
  test(
    'A5 local settlement ' + kind + ' is read without SQL or receipt payload leakage',
    async (t) => {
      const f = await frozen(t, 'python-only'),
        before = allRows(f.db),
        store = new storeAPI.MixedAnalysisStore(f.db);
      assert.equal(storeAPI.readMixedAnalysisSettlement(store), null);
      const exec = f.db.exec.bind(f.db);
      f.db.exec = (sql) => {
        if (kind === 'begin' && sql === 'BEGIN IMMEDIATE') throw Error('injected begin');
        if (kind === 'cleanup' && sql === 'DROP TABLE temp.mixed_stage')
          throw Error('injected close');
        const result = exec(sql);
        if (kind === 'unknown' && sql === 'COMMIT') throw Error('injected uncertain commit');
        return result;
      };
      if (['begin', 'unknown'].includes(kind))
        assert.throws(() => store.apply(f.token.lease, historyLimits));
      else assert.match(store.apply(f.token.lease, historyLimits), /^activation:/);
      f.db.exec = exec;
      const prepare = f.db.prepare;
      f.db.prepare = () => {
        throw Error('getter must not query');
      };
      let value;
      try {
        value = storeAPI.readMixedAnalysisSettlement(store);
      } finally {
        f.db.prepare = prepare;
      }
      assert.deepEqual(Object.keys(value).sort(), ['activationId', 'cleanupFailed', 'status']);
      assert.equal(
        value.status,
        {
          committed: 'COMMITTED',
          begin: 'NOT_COMMITTED',
          unknown: 'COMMIT_OUTCOME_UNKNOWN',
          cleanup: 'COMMITTED',
        }[kind],
      );
      assert.equal(value.cleanupFailed, kind === 'cleanup');
      assert.ok(Object.isFrozen(value));
      if (kind === 'begin') assert.deepEqual(allRows(f.db), before);
      f.stage.close();
    },
  );

for (const below of [false, true])
  test('A5 NO_OP new history identity prefix fee ' + (below ? 'one-below' : 'exact'), async (t) => {
    const f = await base(t),
      b = f.budget,
      original = b.add;
    const fee = Buffer.byteLength('codeatlas-activation-history-v1') + 1;
    let reached = false,
      spent;
    b.add = function (key, n) {
      if (
        !reached &&
        key === 'serializedBytes' &&
        n === fee &&
        new Error().stack.includes('historyDigest')
      ) {
        reached = true;
        spent = this.serializedBytes;
        Object.defineProperty(this, 'limits', {
          configurable: true,
          value: { ...historyLimits, maxSerializedBytes: spent + fee - (below ? 1 : 0) },
        });
        const result = original.call(this, key, n);
        Object.defineProperty(this, 'limits', { configurable: true, value: historyLimits });
        return result;
      }
      return original.call(this, key, n);
    };
    if (below) {
      assert.throws(
        () => stageAPI.readMixedNoOpBasis(f.stage, f.contracts),
        (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
      );
      assert.equal(b.serializedBytes, spent);
      assert.throws(
        () => f.account.checkpoint(),
        (e) => e.code === 'STAGE_RELEASED',
      );
    } else
      assert.equal(
        stageAPI.readMixedNoOpBasis(f.stage, f.contracts).activationId,
        f.input.tables.active_history_pointer[0].activation_id,
      );
    assert.equal(reached, true);
    assert.equal(f.db.prepare("SELECT count(*) n FROM mixed_stage WHERE key='OWNER'").get().n, 0);
  });
