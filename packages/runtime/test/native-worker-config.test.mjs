import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nativeLaunchArguments, resolveNativeWorkerConfig } from '../dist/index.js';

// Pinned local Java Fixture runs peaked below 5.51 MiB; policy reserves 16 MiB per worker.
const reservation = 16 * 1024 * 1024;
const budget = { maxDurationMs: 10_000, maxMemoryBytes: reservation * 3, maxEvents: 100 };
const config = (parseWorkers) => ({ indexing: { nativeAnalyzer: { parseWorkers } } });

test('AUTO derives an effective count bounded by available workers and memory', () => {
  const effective = resolveNativeWorkerConfig(config('AUTO'), budget, 4, reservation);
  assert.equal(effective.requested, 'AUTO');
  assert.equal(effective.effectiveCount, 3);
  assert.equal(effective.reservationBytes, reservation);
  assert.deepEqual(nativeLaunchArguments(effective), ['--parse-workers', '3']);
});

test('explicit worker count is preserved only when feasible', () => {
  assert.equal(resolveNativeWorkerConfig(config(1), budget, 4, reservation).effectiveCount, 1);
  assert.equal(resolveNativeWorkerConfig(config(2), budget, 4, reservation).effectiveCount, 2);
  for (const requested of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '2']) {
    assert.throws(() => resolveNativeWorkerConfig(config(requested), budget, 4, reservation), {
      code: 'INVALID_CONFIGURATION',
    });
  }
  assert.throws(() => resolveNativeWorkerConfig(config(4), budget, 4, reservation), {
    code: 'RESOURCE_LIMIT_EXCEEDED',
  });
});

test('invalid resource inputs cannot create an unbounded or independent override', () => {
  for (const args of [
    [0, reservation],
    [4, 0],
    [4, -1],
    [4, 1.5],
  ]) {
    assert.throws(() => resolveNativeWorkerConfig(config('AUTO'), budget, ...args), {
      code: 'INVALID_CONFIGURATION',
    });
  }
  assert.throws(
    () =>
      resolveNativeWorkerConfig(
        config('AUTO'),
        { ...budget, maxMemoryBytes: reservation - 1 },
        4,
        reservation,
      ),
    {
      code: 'RESOURCE_LIMIT_EXCEEDED',
    },
  );
  assert.throws(
    () =>
      resolveNativeWorkerConfig(
        { indexing: { nativeAnalyzer: { parseWorkers: 'AUTO', workers: 99 } } },
        budget,
        4,
        reservation,
      ),
    {
      code: 'INVALID_CONFIGURATION',
    },
  );
});
