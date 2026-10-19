import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as evaluation from '../dist/index.js';

const { policy } = JSON.parse(
  await readFile(
    new URL('./fixtures/phase05-layered-report-vectors.json', import.meta.url),
    'utf8',
  ),
);
test('fixed policy preserves every original case and its non-interchangeable evidence basis', () => {
  assert.ok(Array.isArray(evaluation.PHASE05_CASE_POLICY), 'Missing fixed evidence policy');
  assert.deepEqual(
    evaluation.PHASE05_CASE_POLICY.map((row) => [
      row.fixtureId,
      row.scenario,
      row.completionOrderId,
      row.executionKind,
      row.expectedOutcome,
    ]),
    policy,
  );
  assert.equal(Object.isFrozen(evaluation.PHASE05_CASE_POLICY), true);
  for (const row of evaluation.PHASE05_CASE_POLICY) {
    assert.equal(Object.isFrozen(row), true);
    assert.throws(() => {
      row.executionKind = 'RECORDED_PROVIDER_SQLITE';
    }, TypeError);
  }
});
