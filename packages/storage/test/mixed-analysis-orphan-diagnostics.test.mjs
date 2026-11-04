import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { historyFixture, seedLiteral, historyLimits } from './helpers/r011-history-fixture.mjs';
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { MixedAnalysisStore } from '../dist/analysis/mixed-analysis-store.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
const x = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../fixtures/phase1/mixed-analysis-store/orphan-nonempty-diagnostics-context.json',
        import.meta.url,
      ),
    ),
  ),
  order = (a) =>
    a.map((r) => ({ ...r })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
test('orphan full recovery preserves nonempty immutable diagnostics without inventing old SQL columns or rows', async (t) => {
  const f = await historyFixture(t, 'available', { seed: false });
  seedLiteral(f.db, x.input);
  const before = allRows(f.db),
    h = captureActivationContext(f.db, x.input.repositoryId, historyLimits);
  assert.equal(h.view.status, 'UNAVAILABLE');
  const stage = new MixedAnalysisStage(
    f.db,
    h.handle,
    'FULL',
    historyLimits,
    createMixedAnalysisRules(),
  );
  t.after(() => stage.close());
  const owner = stage.prepareOwner(null, x.preparation);
  assert.equal(owner.stageDigest, x.owner.stageDigest);
  stage.acceptObservation(owner.ownerHandle, {
    metadata: x.raw.metadata,
    requestBytes: Buffer.from(x.raw.requestText),
    outputBytes: Buffer.from(x.raw.outputText),
  });
  const token = stage.freeze(),
    frozen = JSON.parse(
      f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='FROZEN'").get().value_json,
    );
  assert.deepEqual(frozen.manifest, x.expected.manifest);
  assert.equal(
    frozen.manifest.state.snapshots.find((v) => v.id === 'snapshot:one').diagnostics.length,
    1,
  );
  assert.deepEqual(allRows(f.db), before);
  assert.equal(
    new MixedAnalysisStore(f.db).apply(token.lease, historyLimits),
    x.expected.activationId,
  );
  const target = {
    ...before,
    ...Object.fromEntries(Object.entries(x.expectedTables).map(([k, v]) => [k, order(v)])),
  };
  for (const db of [f.db, f.reopen(true)]) {
    const actual = allRows(db);
    for (const [table, expected] of Object.entries(target))
      assert.deepEqual(order(actual[table]), order(expected), table);
    assert.equal(db.prepare('SELECT count(*) n FROM analysis_diagnostics').get().n, 0);
  }
  assert.equal(
    captureActivationContext(f.db, x.input.repositoryId, historyLimits).view.status,
    'AVAILABLE',
  );
});
