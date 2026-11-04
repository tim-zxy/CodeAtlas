import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareDeclaredNativeObservationScope } from '../../providers/dist/history-transition.js';
import candidate from '../../providers/dist/delta-support-candidate.js';
import {
  modelDeclaredHistoryScope,
  modelNoObservationSupportCandidate,
} from '../../../fixtures/phase1/mixed-analysis-stage/independent-delta-history-resource-model.mjs';
const ref = JSON.parse(
    fs.readFileSync('fixtures/phase1/mixed-analysis-stage/delta-history-resource-reference.json'),
  ),
  sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
for (const c of ref.cases) {
  test('independent declared history observation scope complete resource ' + c.id, () => {
    for (const s of [...ref.models, c.source])
      assert.equal(sha(fs.readFileSync(s.path)), s.sha256, s.path);
    assert.deepEqual(modelDeclaredHistoryScope(c.packet), c.scope);
    const before = structuredClone(c.packet),
      l = {
        maxSerializedBytes: c.scope.cost.serializedBytes,
        maxItems: c.scope.cost.items,
        maxDepth: c.scope.cost.maxDepth,
      },
      run = (l) => prepareDeclaredNativeObservationScope(c.packet, l);
    const actual = run(l);
    assert.deepEqual(actual.scope, c.scope.result);
    assert.deepEqual(actual.packet, c.packet);
    assert.deepEqual(actual.budget, { serializedBytes: l.maxSerializedBytes, items: l.maxItems });
    for (const key of Object.keys(l))
      assert.throws(
        () => run({ ...l, [key]: l[key] - 1 }),
        (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
        key,
      );
    assert.deepEqual(c.packet, before);
  });
  if (c.candidate)
    test('independent no-observation complete support candidate resource ' + c.id, () => {
      assert.deepEqual(modelNoObservationSupportCandidate(c.packet), c.candidate);
      const before = structuredClone(c.packet),
        cost = c.candidate.cost,
        l = {
          maxSerializedBytes: cost.serializedBytes,
          maxItems: cost.items,
          maxDepth: cost.maxDepth,
        },
        run = (l, prior = { serializedBytes: 0, items: 0 }) => {
          const context = { limits: l, budget: { ...prior } },
            result = candidate(c.packet, context);
          return { result, budget: context.budget };
        };
      assert.deepEqual(run(l), {
        result: c.candidate.result,
        budget: { serializedBytes: cost.serializedBytes, items: cost.items },
      });
      for (const key of Object.keys(l))
        assert.throws(
          () => run({ ...l, [key]: l[key] - 1 }),
          (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
          key,
        );
      const prior = { serializedBytes: c.scope.cost.serializedBytes, items: c.scope.cost.items },
        continued = {
          ...l,
          maxSerializedBytes: l.maxSerializedBytes + prior.serializedBytes,
          maxItems: l.maxItems + prior.items,
        };
      assert.deepEqual(run(continued, prior), {
        result: c.candidate.result,
        budget: { serializedBytes: continued.maxSerializedBytes, items: continued.maxItems },
      });
      for (const key of ['maxSerializedBytes', 'maxItems'])
        assert.throws(
          () => run({ ...continued, [key]: continued[key] - 1 }, prior),
          (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
          key + ' cumulative',
        );
      assert.deepEqual(c.packet, before);
      for (const field of ['items', 'serializedBytes'])
        assert.equal(
          c.candidate.ledger.reduce((n, s) => n + s[field], 0),
          cost[field],
        );
    });
}
