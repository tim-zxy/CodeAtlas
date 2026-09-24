import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  calculateMetrics,
  compareCanonicalFacts,
  discoverFixtures,
  FixtureRegistryError,
} from '../dist/index.js';

const fixtureRoot = fileURLToPath(
  new URL('../../../fixtures/evaluation/metrics-v1/', import.meta.url),
);

test('declared golden Fixture counts changed pairs once and scopes critical facts', async () => {
  const [fixture] = await discoverFixtures(fixtureRoot);
  assert.equal(fixture.manifest.id, 'p0-metric-engine-v1');
  const expected = JSON.parse(await readFile(fixture.expected.canonical, 'utf8'));
  const actual = JSON.parse(await readFile(fixture.inputs.actual, 'utf8'));
  const comparison = compareCanonicalFacts({ expected, actual });
  assert.deepEqual(
    comparison.entries
      .find((entry) => entry.expected?.factKey === 'edge-changed')
      .differences.map((diff) => diff.kind),
    ['SEMANTIC_DIFFERENCE', 'RESOLUTION_DIFFERENCE', 'RESOLUTION_DIFFERENCE'],
  );

  const result = calculateMetrics(comparison, fixture.manifest.criticalFacts, fixture.manifestPath);
  assert.deepEqual(result.counts, {
    node: { tp: 1, fp: 2, fn: 2 },
    edge: { tp: 0, fp: 2, fn: 1 },
    criticalFact: { tp: 1, fp: 2, fn: 2 },
  });
  assert.deepEqual(result.metrics.nodePrecision, { value: 1 / 3, reason: null });
  assert.deepEqual(result.metrics.nodeRecall, { value: 1 / 3, reason: null });
  assert.deepEqual(result.metrics.edgePrecision, { value: 0, reason: null });
  assert.deepEqual(result.metrics.edgeRecall, { value: 0, reason: null });
  assert.deepEqual(result.metrics.criticalFactPrecision, { value: 1 / 3, reason: null });
  assert.deepEqual(result.metrics.criticalFactRecall, { value: 1 / 3, reason: null });
  assert.deepEqual(result.criticalFailures, [
    { type: 'NODE', factKey: 'node-changed', classification: 'CHANGED' },
    { type: 'EDGE', factKey: 'edge-changed', classification: 'CHANGED' },
  ]);
  assert.deepEqual(result.coverageExclusions, [
    { reason: 'NON_CRITICAL', type: 'NODE', factKey: 'node-missing' },
    { reason: 'UNDECLARED_ACTUAL_EXTRA', type: 'NODE', factKey: 'node-extra' },
    { reason: 'UNDECLARED_ACTUAL_EXTRA', type: 'EDGE', factKey: 'edge-extra' },
  ]);
});

test('a pair with both difference classes counts once in its type and critical counts', () => {
  const comparison = {
    entries: [
      {
        factType: 'EDGE',
        expected: { id: 'e', factKey: 'k' },
        actual: { id: 'a', factKey: 'k' },
        matchBasis: 'FACT_KEY',
        classification: null,
        differences: [
          { kind: 'SEMANTIC_DIFFERENCE', path: 'source.id' },
          { kind: 'RESOLUTION_DIFFERENCE', path: 'target.state' },
        ],
      },
    ],
  };
  const declarations = [{ id: 'k', type: 'EDGE', importance: 'CRITICAL' }];
  const before = structuredClone({ comparison, declarations });
  const result = calculateMetrics(comparison, declarations, 'fixture.json');
  assert.deepEqual(result.counts.edge, { tp: 0, fp: 1, fn: 1 });
  assert.deepEqual(result.counts.criticalFact, { tp: 0, fp: 1, fn: 1 });
  assert.deepEqual(result.metrics.nodePrecision, { value: null, reason: 'NO_PREDICTIONS' });
  assert.deepEqual(result.metrics.nodeRecall, { value: null, reason: 'NO_EXPECTED_FACTS' });
  assert.deepEqual({ comparison, declarations }, before);
});

test('missing critical fact has zero recall and undefined precision', () => {
  const comparison = {
    entries: [
      {
        factType: 'NODE',
        expected: { id: 'e', factKey: 'missing' },
        actual: null,
        matchBasis: null,
        classification: 'MISSING',
        differences: [],
      },
    ],
  };
  const result = calculateMetrics(
    comparison,
    [{ id: 'missing', type: 'NODE', importance: 'CRITICAL' }],
    'fixture.json',
  );
  assert.deepEqual(result.counts.criticalFact, { tp: 0, fp: 0, fn: 1 });
  assert.deepEqual(result.metrics.criticalFactPrecision, { value: null, reason: 'NO_PREDICTIONS' });
  assert.deepEqual(result.metrics.criticalFactRecall, { value: 0, reason: null });
  assert.deepEqual(result.criticalFailures, [
    { type: 'NODE', factKey: 'missing', classification: 'MISSING' },
  ]);
});

test('empty comparison reports null precision and recall for every group', () => {
  const result = calculateMetrics({ entries: [] }, [], 'fixture.json');
  assert.deepEqual(result.counts.node, { tp: 0, fp: 0, fn: 0 });
  for (const name of ['nodePrecision', 'edgePrecision', 'criticalFactPrecision'])
    assert.deepEqual(result.metrics[name], { value: null, reason: 'NO_PREDICTIONS' });
  for (const name of ['nodeRecall', 'edgeRecall', 'criticalFactRecall'])
    assert.deepEqual(result.metrics[name], { value: null, reason: 'NO_EXPECTED_FACTS' });
});

test('invalid critical type or missing expected FactKey fails at declaration path', () => {
  const comparison = {
    entries: [
      {
        factType: 'NODE',
        expected: { id: 'e', factKey: 'known' },
        actual: { id: 'a', factKey: 'known' },
        matchBasis: 'FACT_KEY',
        classification: null,
        differences: [],
      },
    ],
  };
  for (const [declaration, fieldPath] of [
    [{ id: 'known', type: 'RELATION', importance: 'CRITICAL' }, 'criticalFacts.0.type'],
    [{ id: 'other', type: 'NODE', importance: 'CRITICAL' }, 'criticalFacts.0.id'],
    [{ id: 'known', type: 'EDGE', importance: 'SECONDARY' }, 'criticalFacts.0.id'],
  ]) {
    assert.throws(
      () => calculateMetrics(comparison, [declaration], 'fixture.json'),
      (error) => {
        assert.ok(error instanceof FixtureRegistryError);
        assert.equal(error.code, 'MANIFEST_INVALID');
        assert.equal(error.fieldPath, fieldPath);
        return true;
      },
    );
  }
});
