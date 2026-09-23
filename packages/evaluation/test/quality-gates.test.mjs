import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluateQualityGates, FixtureRegistryError } from '../dist/index.js';

const metrics = {
  nodePrecision: { value: 0.8, reason: null },
  nodeRecall: { value: 0.75, reason: null },
  edgePrecision: { value: 0.5, reason: null },
  edgeRecall: { value: 0, reason: null },
  criticalFactPrecision: { value: 1, reason: null },
  criticalFactRecall: { value: 0.9, reason: null },
};

for (const [operator, threshold, expected] of [
  ['>=', 0.8, 'PASS'],
  ['>', 0.8, 'FAIL'],
  ['<=', 0.8, 'PASS'],
  ['<', 0.8, 'FAIL'],
  ['==', 0.8, 'PASS'],
  ['>=', 0.9, 'FAIL'],
  ['>', 0.7, 'PASS'],
  ['<=', 0.7, 'FAIL'],
  ['<', 0.9, 'PASS'],
  ['==', 0.7, 'FAIL'],
]) {
  test(`${operator} at ${threshold} produces ${expected}`, () => {
    const result = evaluateQualityGates(
      metrics,
      { nodePrecision: { operator, threshold } },
      'fixture.json',
    );
    assert.deepEqual(result.gates, [
      { name: 'nodePrecision', value: 0.8, operator, threshold, status: expected },
    ]);
    assert.equal(result.overall, expected);
  });
}

test('null metric makes its gate not evaluable and overall failed', () => {
  const result = evaluateQualityGates(
    { ...metrics, nodeRecall: { value: null, reason: 'NO_EXPECTED_FACTS' } },
    { nodeRecall: { operator: '>=', threshold: 0 } },
    'fixture.json',
  );
  assert.deepEqual(result.gates, [
    { name: 'nodeRecall', value: null, operator: '>=', threshold: 0, status: 'NOT_EVALUABLE' },
  ]);
  assert.equal(result.overall, 'FAIL');
});

test('gates are emitted in ordinal name order independent of manifest insertion order', () => {
  const result = evaluateQualityGates(
    metrics,
    {
      nodeRecall: { operator: '>=', threshold: 0.7 },
      edgePrecision: { operator: '>', threshold: 0.5 },
    },
    'fixture.json',
  );
  assert.deepEqual(
    result.gates.map((gate) => gate.name),
    ['edgePrecision', 'nodeRecall'],
  );
  assert.deepEqual(
    result.gates.map((gate) => gate.status),
    ['FAIL', 'PASS'],
  );
  assert.equal(result.overall, 'FAIL');
});

test('an empty gate map means successful evaluation but no declared threshold', () => {
  assert.deepEqual(evaluateQualityGates(metrics, {}, 'fixture.json'), {
    gates: [],
    overall: 'PASS',
  });
});

test('unknown gate and out-of-range or nonfinite thresholds fail at manifest paths', () => {
  for (const [name, gate, fieldPath] of [
    ['callPrecision', { operator: '>=', threshold: 0.9 }, 'qualityGates.callPrecision'],
    ['nodeRecall', { operator: '>=', threshold: -0.01 }, 'qualityGates.nodeRecall.threshold'],
    ['nodeRecall', { operator: '>=', threshold: 1.01 }, 'qualityGates.nodeRecall.threshold'],
    ['nodeRecall', { operator: '>=', threshold: NaN }, 'qualityGates.nodeRecall.threshold'],
    ['nodeRecall', { operator: '>=', threshold: Infinity }, 'qualityGates.nodeRecall.threshold'],
  ]) {
    assert.throws(
      () => evaluateQualityGates(metrics, { [name]: gate }, 'fixture.json'),
      (error) => {
        assert.ok(error instanceof FixtureRegistryError);
        assert.equal(error.code, 'MANIFEST_INVALID');
        assert.equal(error.fieldPath, fieldPath);
        return true;
      },
    );
  }
});
