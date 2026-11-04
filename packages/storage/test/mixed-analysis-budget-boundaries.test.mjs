import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  historyFixture,
  seedLiteral,
  historyLimits,
  referenceCanonical,
} from './helpers/r011-history-fixture.mjs';
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import { observationFixture } from './helpers/mixed-analysis-fixture.mjs';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { MixedAnalysisStore } from '../dist/analysis/mixed-analysis-store.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
const root = new URL('../../../fixtures/phase1/mixed-analysis-stage/', import.meta.url),
  r = JSON.parse(fs.readFileSync(new URL('independent-budget-boundary-reference.json', root))),
  sha = (b) => crypto.createHash('sha256').update(b).digest('hex'),
  depth = (v) =>
    v && typeof v === 'object' ? Math.max(0, ...Object.values(v).map((c) => 1 + depth(c))) : 0;
function binding(id) {
  const b = r.bindings.find((c) => c.id === id);
  for (const k of ['input', 'expected'])
    assert.equal(sha(fs.readFileSync(new URL(b[k], root))), b[k + 'Sha256']);
}
test('bound original depth-one-below follows independent closed-schema maximum through capture Stage and Store', async (t) => {
  binding('depth-one-below');
  assert.equal(sha(fs.readFileSync(r.source.path)), r.source.sha256);
  assert.deepEqual(
    Object.fromEntries(Object.entries(r.depth.roots).map(([k, v]) => [k, depth(v)])),
    r.depth.depthByRoot,
  );
  assert.equal(r.depth.exact, Math.max(...Object.values(r.depth.depthByRoot)));
  const x = JSON.parse(fs.readFileSync(r.source.path)),
    ordered = (rows) =>
      rows
        .map((row) => ({ ...row }))
        .sort((a, b) =>
          referenceCanonical(a) < referenceCanonical(b)
            ? -1
            : referenceCanonical(a) > referenceCanonical(b)
              ? 1
              : 0,
        );
  for (const [limit, success] of [
    [r.depth.exact, true],
    [r.depth.oneBelow, false],
  ]) {
    const f = await historyFixture(t, 'available', { seed: false });
    seedLiteral(f.db, x.input);
    const before = allRows(f.db),
      limits = { ...historyLimits, maxDepth: limit };
    let stage;
    const operation = () => {
      const h = captureActivationContext(f.db, x.input.repositoryId, limits);
      stage = new MixedAnalysisStage(f.db, h.handle, 'DELTA', limits, createMixedAnalysisRules());
      const owner = stage.prepareOwner(null, x.preparation);
      stage.acceptObservation(owner.ownerHandle, null);
      return new MixedAnalysisStore(f.db).apply(stage.freeze().lease, limits);
    };
    if (success) {
      assert.equal(operation(), x.expected.activationId);
      const expected = {
        ...before,
        ...Object.fromEntries(Object.entries(x.expectedTables).map(([k, v]) => [k, ordered(v)])),
      };
      assert.deepEqual(allRows(f.db), expected);
      assert.deepEqual(allRows(f.reopen(true)), expected);
    } else {
      assert.throws(operation, (e) =>
        ['HISTORY_LIMIT_EXCEEDED', 'STAGE_LIMIT_EXCEEDED'].includes(e.code),
      );
      assert.deepEqual(allRows(f.db), before);
      assert.deepEqual(allRows(f.reopen(true)), before);
    }
    if (stage) stage.close();
    assert.equal(f.db.isTransaction, false);
  }
});
test('bound original safe-integer-overflow uses independent BigInt prior-spend proof and never publishes owner', async (t) => {
  binding('safe-integer-overflow');
  const proof = r.overflow;
  assert.equal(
    BigInt(proof.limit) + BigInt(proof.minimumAlreadyRequiredSerializedBytes),
    BigInt(proof.exactSum),
  );
  assert.ok(
    BigInt(proof.reportedAdditionalSerializedBytes) +
      BigInt(proof.minimumAlreadyRequiredSerializedBytes) >
      BigInt(proof.limit),
  );
  const f = await observationFixture(t, 'java-only'),
    before = allRows(f.db),
    h = captureActivationContext(f.db, f.input.repositoryId, historyLimits),
    real = createMixedAnalysisRules();
  let calls = 0;
  const stage = new MixedAnalysisStage(
    f.db,
    h.handle,
    'FULL',
    historyLimits,
    Object.freeze({
      ...real,
      prepareJavaOwner(...args) {
        calls++;
        const value = structuredClone(real.prepareJavaOwner(...args));
        value.usage.serializedBytes = proof.reportedAdditionalSerializedBytes;
        return value;
      },
    }),
  );
  assert.throws(
    () => stage.prepareOwner(f.javaRows, f.preparation),
    (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
  );
  assert.equal(calls, 1);
  assert.equal(f.db.prepare("SELECT count(*) n FROM mixed_stage WHERE key='OWNER'").get().n, 0);
  assert.throws(
    () => stage.freeze(),
    (e) => e.code === 'STAGE_RELEASED',
  );
  assert.deepEqual(allRows(f.db), before);
  stage.close();
  assert.deepEqual(allRows(f.reopen(true)), before);
});
import { HistoryReadBudget } from '../dist/analysis/activation-history-format.js';
test('bound original cumulative-insufficient carries prior items and live pins before any Store transaction', async (t) => {
  binding('cumulative-insufficient');
  const c = r.cumulative,
    x = JSON.parse(fs.readFileSync(r.source.path));
  assert.ok(c.minimumPriorOwnedItems > c.isolatedResultItems);
  assert.ok(c.minimumPriorPinnedWeight > c.isolatedResultWeight);
  const itemControl = new HistoryReadBudget({ ...historyLimits, maxItems: c.isolatedResultItems });
  itemControl.own(c.fullFrozenResult, false);
  assert.equal(itemControl.items, c.isolatedResultItems);
  const memoryControl = new HistoryReadBudget({
    ...historyLimits,
    memoryBudgetBytes: 2 * c.isolatedResultWeight,
  });
  memoryControl.own(c.fullFrozenResult);
  assert.equal(memoryControl.retainedLogicalBytes, c.isolatedResultWeight);
  for (const limits of [
    { ...historyLimits, maxItems: c.isolatedResultItems },
    { ...historyLimits, memoryBudgetBytes: 2 * c.isolatedResultWeight },
  ]) {
    const f = await historyFixture(t, 'available', { seed: false });
    seedLiteral(f.db, x.input);
    const before = allRows(f.db),
      h = captureActivationContext(f.db, x.input.repositoryId, historyLimits),
      stage = new MixedAnalysisStage(
        f.db,
        h.handle,
        'DELTA',
        historyLimits,
        createMixedAnalysisRules(),
      ),
      owner = stage.prepareOwner(null, x.preparation);
    stage.acceptObservation(owner.ownerHandle, null);
    const token = stage.freeze();
    const { usage: observedUsage, ...observedSemantics } = JSON.parse(
        f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='FROZEN'").get().value_json,
      ),
      { usage: modelUsage, ...expectedSemantics } = c.fullFrozenResult;
    assert.deepEqual(observedSemantics, expectedSemantics);
    assert.deepEqual(Object.keys(observedUsage).sort(), Object.keys(modelUsage).sort());
    for (const n of Object.values(observedUsage)) assert.ok(Number.isSafeInteger(n) && n >= 0);
    const exec = f.db.exec;
    let begins = 0;
    f.db.exec = function (sql) {
      if (sql === 'BEGIN IMMEDIATE') begins++;
      return exec.call(this, sql);
    };
    const store = new MixedAnalysisStore(f.db);
    assert.throws(
      () => store.apply(token.lease, limits),
      (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
    );
    f.db.exec = exec;
    assert.equal(begins, 0);
    assert.throws(
      () => store.apply(token.lease, historyLimits),
      (e) => e.code === 'STAGE_RELEASED',
    );
    assert.deepEqual(allRows(f.db), before);
    stage.close();
    assert.deepEqual(allRows(f.reopen(true)), before);
  }
});
