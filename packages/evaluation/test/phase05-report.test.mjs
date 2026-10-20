import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as evaluation from '../dist/index.js';
const vectors = JSON.parse(
  await readFile(new URL('./fixtures/phase05-report-vectors.json', import.meta.url), 'utf8'),
);
function evaluate(input) {
  assert.equal(
    typeof evaluation.evaluatePhase05Report,
    'function',
    'Missing failure-inclusive reporter',
  );
  return evaluation.evaluatePhase05Report(input);
}
const input = () => ({
  ...structuredClone(vectors.missingRun),
  observations: [structuredClone(vectors.observation)],
});

function completeSynthetic() {
  const data = input();
  data.requiredRuns = [];
  data.observations = [];
  for (const scenario of [
    'COLD',
    'INCREMENTAL_1',
    'INCREMENTAL_5',
    'INCREMENTAL_50',
    'WORKER_CONSISTENCY',
    'TRANSITION',
    'GOLDEN',
    'PROVIDER_MERGE',
  ]) {
    const row = structuredClone(vectors.observation);
    row.runKey.scenario = scenario;
    if (scenario === 'WORKER_CONSISTENCY') {
      row.runKey.completionOrderId = 'order-a';
      row.artifactDigests['completion-order'] = '8'.repeat(64);
      const other = structuredClone(row);
      other.runKey.requestedWorkers = 2;
      other.runKey.expectedEffectiveWorkers = 2;
      other.effectiveWorkers = 2;
      other.runKey.completionOrderId = 'order-b';
      other.artifactDigests['completion-order'] = '9'.repeat(64);
      data.requiredRuns.push(other.runKey);
      data.observations.push(other);
    }
    data.requiredRuns.push(row.runKey);
    data.observations.push(row);
  }
  return data;
}
test('phase05 report accepts complete synthetic evidence without claiming Native execution', () => {
  const data = completeSynthetic(),
    before = structuredClone(data);
  const result = evaluate(data);
  assert.equal(result.overall, 'PASS');
  assert.deepEqual(data, before);
  assert.equal(result.telemetry.WORKER_CONSISTENCY.sampleCount, 2);
  assert.equal(result.telemetry.WORKER_CONSISTENCY.throughput.units, 'observed-trials/second');
  assert.equal(result.observations[0].peak.value, null);
});
test('phase05 report matches run keys independent of JSON member order', () => {
  const data = input();
  data.observations[0].runKey = Object.fromEntries(
    Object.entries(data.observations[0].runKey).reverse(),
  );
  assert.equal(evaluate(data).missingRuns.length, 0);
});
test('phase05 report refuses reordered duplicate semantic run keys', () => {
  const data = input();
  data.requiredRuns.push(Object.fromEntries(Object.entries(data.requiredRuns[0]).reverse()));
  assert.equal(typeof evaluation.evaluatePhase05Report, 'function');
  assert.throws(() => evaluate(data), /Invalid Phase0.5 report input/);
});
for (const defect of [
  'single-count',
  'missing-order-proof',
  'different-source',
  'different-canonical',
])
  test(`phase05 report cannot pass worker ${defect}`, () => {
    const data = completeSynthetic();
    const rows = data.observations.filter((row) => row.runKey.scenario === 'WORKER_CONSISTENCY');
    if (defect === 'single-count') {
      for (const row of rows) {
        row.effectiveWorkers = 1;
        row.runKey.expectedEffectiveWorkers = 1;
        row.runKey.requestedWorkers = 1;
      }
    } else if (defect === 'missing-order-proof') delete rows[0].artifactDigests['completion-order'];
    else if (defect === 'different-source') rows[0].sourceDigest = 'a'.repeat(64);
    else rows[0].artifactDigests.canonical = 'b'.repeat(64);
    const result = evaluate(data);
    assert.equal(result.overall, 'FAIL');
    assert.ok(result.failures.some((failure) => failure.code === 'WORKER_CONSISTENCY_UNPROVED'));
  });

test('phase05 report cannot pass performance with missing total measurements', () => {
  const data = completeSynthetic();
  data.observations[0].timings.total = { value: null, unavailableReason: 'Unobserved total' };
  const result = evaluate(data);
  assert.equal(result.overall, 'FAIL');
  assert.ok(result.failures.some((failure) => failure.code === 'TOTAL_TIMING_UNPROVED'));
});

test('phase05 report does not invoke inherited JSON serialization hooks', () => {
  const data = input();
  let calls = 0;
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
  Object.defineProperty(Object.prototype, 'toJSON', {
    configurable: true,
    value() {
      calls++;
      return null;
    },
  });
  try {
    assert.equal(evaluate(data).kind, 'PHASE05_EVALUATION');
    assert.equal(calls, 0);
  } finally {
    if (previous) Object.defineProperty(Object.prototype, 'toJSON', previous);
    else delete Object.prototype.toJSON;
  }
});
test('phase05 report preserves observed latency median, maximum and failed samples', () => {
  const data = input();
  const second = structuredClone(data.observations[0]);
  second.runKey.repetition = 2;
  second.status = 'FAILED';
  second.timings.total.value = 30;
  data.requiredRuns.push(second.runKey);
  data.observations.push(second);
  const stats = evaluate(data).telemetry.INCREMENTAL_1;
  assert.equal(stats.medianMs, 20);
  assert.equal(stats.maximumObservedMs, 30);
  assert.equal(stats.sampleCount, 2);
  assert.equal(stats.throughput.value, 50);
  assert.equal(stats.samples.filter((sample) => sample.status === 'FAILED').length, 1);
});
test('phase05 report preserves missing declared runs as FAIL', () => {
  const result = evaluate(vectors.missingRun);
  assert.equal(result.overall, 'FAIL');
  assert.equal(result.missingRuns.length, 1);
  assert.ok(result.failures.some((failure) => failure.code === 'REQUIRED_RUN_MISSING'));
});
test('phase05 report sums raw counts, not percentages', () => {
  const data = input();
  const second = structuredClone(vectors.observation);
  second.runKey.repetition = 2;
  second.facts.symbol = { tp: 0, fp: 0, fn: 1, recall: 0 };
  second.facts.directCall = { tp: 0, fp: 1, fn: 1, precision: 0, recall: 0 };
  data.requiredRuns.push(second.runKey);
  data.observations.push(second);
  const result = evaluate(data);
  assert.deepEqual(result.aggregateCounts.symbol, { tp: 10, fp: 0, fn: 1 });
  assert.equal(result.gates.find((gate) => gate.name === 'CriticalSymbolRecall').value, 10 / 11);
  assert.equal(
    result.gates.find((gate) => gate.name === 'CriticalDirectCallPrecision').value,
    10 / 11,
  );
  assert.deepEqual(
    result.gates.map((gate) => [gate.name, gate.operator, gate.threshold]),
    [
      ['CriticalSymbolRecall', '>=', 0.95],
      ['CriticalDirectCallPrecision', '>=', 0.95],
      ['CriticalDirectCallRecall', '>=', 0.9],
      ['IncrementalCorrectness', '==', 1],
      ['StaleProviderBindings', '==', 0],
    ],
  );
});
for (const field of ['graphEqual', 'coverageEqual', 'supportEqual'])
  test(`phase05 report cannot pass unproved ${field}`, () => {
    const data = input();
    data.observations[0][field] = null;
    const result = evaluate(data);
    assert.equal(result.overall, 'FAIL');
    assert.ok(result.failures.some((failure) => failure.code === 'RUN_CHECK_UNPROVED'));
  });
for (const field of ['transactionClosed', 'tempClosed', 'childClosed'])
  test(`phase05 report cannot pass unclosed ${field}`, () => {
    const data = input();
    data.observations[0].closure[field] = false;
    assert.ok(
      evaluate(data).failures.some((failure) => failure.code === 'RESOURCE_CLOSURE_UNPROVED'),
    );
  });
test('phase05 report retains failed trials and unavailable stages rather than zero', () => {
  const data = input();
  data.observations[0].status = 'FAILED';
  data.observations[0].facts = null;
  const result = evaluate(data);
  assert.equal(result.overall, 'FAIL');
  assert.equal(result.observations[0].status, 'FAILED');
  assert.equal(result.observations[0].timings.parse.value, null);
  assert.ok(result.gates.some((gate) => gate.status === 'NOT_EVALUABLE'));
  assert.equal(result.telemetry.INCREMENTAL_1.maximumObservedMs, 10);
});
test('phase05 report does not coerce workers or ignore stale bindings', () => {
  const data = input();
  data.requiredRuns[0].expectedEffectiveWorkers = 2;
  data.observations[0].runKey.expectedEffectiveWorkers = 2;
  data.observations[0].staleBindings = 1;
  const result = evaluate(data);
  assert.ok(result.failures.some((failure) => failure.code === 'WORKER_COUNT_MISMATCH'));
  assert.equal(result.gates.find((gate) => gate.name === 'StaleProviderBindings').status, 'FAIL');
});
for (const defect of [
  'duplicate-required',
  'duplicate-observed',
  'foreign-key',
  'identity-extra',
  'invalid-hash',
  'invalid-ratio',
  'unsafe-counter',
  'missing-null-reason',
])
  test(`phase05 report rejects ${defect}`, () => {
    const data = input();
    if (defect === 'duplicate-required')
      data.requiredRuns.push(structuredClone(data.requiredRuns[0]));
    if (defect === 'duplicate-observed')
      data.observations.push(structuredClone(data.observations[0]));
    if (defect === 'foreign-key') data.observations[0].runKey.fixtureId = 'foreign';
    if (defect === 'identity-extra') data.identity.unknown = true;
    if (defect === 'invalid-hash') data.observations[0].sourceDigest = 'not-a-hash';
    if (defect === 'invalid-ratio') data.observations[0].facts.symbol.recall = 0.5;
    if (defect === 'unsafe-counter')
      data.observations[0].facts.symbol.tp = Number.MAX_SAFE_INTEGER + 1;
    if (defect === 'missing-null-reason')
      data.observations[0].timings.parse.unavailableReason = null;
    assert.equal(typeof evaluation.evaluatePhase05Report, 'function');
    assert.throws(() => evaluate(data), /Invalid Phase0.5 report input/);
  });
test('phase05 report rejects hostile accessors without evaluating them', () => {
  const data = input();
  let calls = 0;
  Object.defineProperty(data.identity, 'fixtureDigest', {
    enumerable: true,
    get() {
      calls++;
      return 'secret';
    },
  });
  assert.equal(typeof evaluation.evaluatePhase05Report, 'function');
  assert.throws(() => evaluate(data), /Invalid Phase0.5 report input/);
  assert.equal(calls, 0);
});
