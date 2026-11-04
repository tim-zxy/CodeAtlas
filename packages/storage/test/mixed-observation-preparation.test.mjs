import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { observationFixture, ownerFixture } from './helpers/mixed-analysis-fixture.mjs';
import { historyLimits } from './helpers/r011-history-fixture.mjs';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import * as api from '../dist/analysis/mixed-analysis-stage.js';
import { beginMixedSourceAccount } from '../dist/analysis/mixed-source-account.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
const root = new URL(
  '../../../fixtures/phase1/mixed-runtime-readiness/request-preparation/',
  import.meta.url,
);
const cases = JSON.parse(fs.readFileSync(new URL('cases.json', root)));
const expected = JSON.parse(fs.readFileSync(new URL('expected.json', root)));
async function setup(t, id, owner = false) {
  const f = await (owner ? ownerFixture : observationFixture)(t, id);
  const capture = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  const prelude = beginMixedSourceAccount(historyLimits, {
    signal: new AbortController().signal,
    deadlineEpochMs: Date.now() + 60000,
    maxInputBytes: Number.MAX_SAFE_INTEGER,
  });
  const stage = new api.MixedAnalysisStage(
    f.db,
    capture.handle,
    owner ? f.mode : 'FULL',
    historyLimits,
    createMixedAnalysisRules(),
    prelude.budget,
  );
  return { ...f, capture, stage, ...prelude };
}
for (const id of cases.observation)
  test('A3 Stage authenticated full projections ' + id, async (t) => {
    const f = await setup(t, id);
    const java = api.readMixedJavaPreparation(f.stage, f.preparation.contracts);
    assert.deepEqual(java.javaSourceFiles, f.metadata.java?.request.payload.sourceFiles ?? []);
    const handle = f.stage.prepareOwner(f.javaRows, f.preparation);
    const out = api.readMixedCodeSyntaxPreparation(f.stage, handle.ownerHandle);
    for (const k of ['sourceFiles', 'owners', 'expectedActivationBasis', 'removedSourceFiles'])
      assert.deepEqual(out[k], expected[id][k], k);
    assert.equal(out.stageDigest, expected[id].ownerBinding.stageDigest);
    assert.deepEqual(out.inventory, f.metadata.inventory);
    assert.ok(Object.isFrozen(out) && Object.isFrozen(out.sourceFiles));
    assert.throws(() => {
      out.sourceFiles[0].path = 'changed';
    }, TypeError);
    assert.notEqual(out.inventory, f.metadata.inventory);
    assert.throws(
      () => api.readMixedJavaPreparation(f.stage, f.preparation.contracts),
      (e) => e.code === 'INVALID_STAGE',
    );
    f.stage.close();
  });
for (const id of cases.owner)
  test('A3 Stage original owner scope ' + id, async (t) => {
    const f = await setup(t, id, true);
    assert.deepEqual(
      api.readMixedJavaPreparation(f.stage, f.preparation.contracts).javaSourceFiles,
      [],
    );
    const h = f.stage.prepareOwner(null, f.preparation);
    const out = api.readMixedCodeSyntaxPreparation(f.stage, h.ownerHandle);
    assert.deepEqual(
      out.expectedActivationBasis,
      f.mode === 'FULL' ? null : f.capture.view.history.state.basis,
    );
    assert.equal(out.stageDigest, f.expected.stageDigest);
    if (id === 'delta-delete-only') {
      const old = f.capture.view.history.state.inventory.find((x) => x.id === 'source:one');
      assert.deepEqual(out.sourceFiles, []);
      assert.deepEqual(out.removedSourceFiles, [
        { id: old.id, path: old.path, previousContentFingerprint: old.contentFingerprint },
      ]);
    } else assert.equal(out.sourceFiles.length, 1);
    f.stage.close();
  });
for (const kind of ['foreign-owner', 'closed', 'transaction', 'changed'])
  test('A3 Stage projection refuses ' + kind, async (t) => {
    const f = await setup(t, 'python-only');
    const h = f.stage.prepareOwner(null, f.preparation);
    if (kind === 'closed') f.stage.close();
    if (kind === 'transaction') f.db.exec('BEGIN');
    if (kind === 'changed')
      f.db.prepare("UPDATE mixed_stage SET value_json='{}' WHERE key='OWNER'").run();
    assert.throws(
      () =>
        api.readMixedCodeSyntaxPreparation(f.stage, kind === 'foreign-owner' ? {} : h.ownerHandle),
      (e) =>
        ['INVALID_CANDIDATE', 'INVALID_STAGE', 'STAGE_RELEASED', 'STAGE_CHANGED'].includes(e.code),
    );
    if (kind === 'transaction') {
      assert.ok(f.db.isTransaction);
      f.db.exec('ROLLBACK');
    }
    f.stage.close();
  });
test('A3 Stage projection spends same cumulative budget and retains failure prefix', async (t) => {
  const f = await setup(t, 'mixed');
  const before = f.budget.serializedBytes;
  api.readMixedJavaPreparation(f.stage, f.preparation.contracts);
  assert.ok(f.budget.serializedBytes > before);
  const once = f.budget.serializedBytes;
  api.readMixedJavaPreparation(f.stage, f.preparation.contracts);
  assert.ok(f.budget.serializedBytes > once);
  Object.defineProperty(f.budget, 'limits', {
    value: { ...historyLimits, maxSerializedBytes: f.budget.serializedBytes + 1 },
  });
  assert.throws(
    () => api.readMixedJavaPreparation(f.stage, f.preparation.contracts),
    (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
  );
  assert.ok(f.budget.serializedBytes >= once);
  assert.throws(
    () => f.account.checkpoint(),
    (e) => e.code === 'STAGE_RELEASED',
  );
  f.stage.close();
});
