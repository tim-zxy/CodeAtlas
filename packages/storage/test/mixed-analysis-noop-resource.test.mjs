import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { historyFixture, seedLiteral, historyLimits } from './helpers/r011-history-fixture.mjs';
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import { modelNoopComposition } from '../../../fixtures/phase1/mixed-analysis-stage/independent-noop-resource-model.mjs';
const ref = JSON.parse(
    fs.readFileSync('fixtures/phase1/mixed-analysis-stage/noop-resource-reference.json'),
  ),
  sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
test('independent complete Runtime NO_OP resource and unchanged durable history', async (t) => {
  for (const s of [ref.source, ...ref.models]) assert.equal(sha(s.path), s.sha256, s.path);
  const source = JSON.parse(fs.readFileSync(ref.source.path)),
    e = ref.expected;
  assert.deepEqual(modelNoopComposition(e.input), e);
  const f = await historyFixture(t, 'available', { seed: false });
  seedLiteral(f.db, source.source);
  const before = allRows(f.db),
    h = captureActivationContext(f.db, source.source.repositoryId, historyLimits);
  assert.equal(h.view.status, 'AVAILABLE');
  assert.deepEqual(h.view.history, e.input.capture.history);
  const limits = {
      maxRows: 1,
      maxSerializedBytes: e.cost.serializedBytes,
      maxItems: e.cost.items,
      maxDepth: e.cost.maxDepth,
      memoryBudgetBytes: e.cost.memoryBudgetBytes,
    },
    input = structuredClone(e.input),
    original = structuredClone(input),
    run = (l) => createMixedAnalysisRules().compose(input, l);
  assert.deepEqual(run(limits), e.result);
  for (const key of ['maxSerializedBytes', 'maxItems', 'maxDepth', 'memoryBudgetBytes'])
    assert.throws(
      () => run({ ...limits, [key]: limits[key] - 1 }),
      (err) => ['HISTORY_LIMIT_EXCEEDED', 'RESOURCE_LIMIT_EXCEEDED'].includes(err.code),
      key,
    );
  for (const key of Object.keys(limits))
    assert.throws(
      () => run({ ...limits, [key]: Number.MAX_SAFE_INTEGER + 1 }),
      undefined,
      key + ' unsafe',
    );
  for (const field of ['items', 'serializedBytes', 'retainedLogicalBytes'])
    assert.equal(
      e.ledger.reduce((n, s) => n + s[field], 0),
      e.cost[field],
    );
  assert.equal(e.cost.rows, 0);
  assert.equal(e.result.activationId, e.input.capture.parent.activationId);
  assert.deepEqual(input, original);
  assert.deepEqual(allRows(f.db), before);
  assert.deepEqual(allRows(f.reopen(true)), before);
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM sqlite_temp_schema WHERE name='mixed_stage'").get().n,
    0,
  );
  assert.equal(f.db.isTransaction, false);
});
