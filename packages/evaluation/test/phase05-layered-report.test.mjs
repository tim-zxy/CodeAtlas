import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as evaluation from '../dist/index.js';

const vectors = JSON.parse(
  await readFile(
    new URL('./fixtures/phase05-layered-report-vectors.json', import.meta.url),
    'utf8',
  ),
);
const evaluate = (input) => {
  assert.equal(
    typeof evaluation.evaluatePhase05LayeredReport,
    'function',
    'Missing v2 layered evaluator',
  );
  return evaluation.evaluatePhase05LayeredReport(input);
};
function complete() {
  const requiredRuns = vectors.policy.map(
    ([fixtureId, scenario, completionOrderId, executionKind, expectedOutcome]) => ({
      fixtureId,
      scenario,
      completionOrderId,
      executionKind,
      expectedOutcome,
      repetition: 1,
      requestedWorkers:
        executionKind === 'RECORDED_PROVIDER_SQLITE'
          ? null
          : completionOrderId?.endsWith('_2')
            ? 2
            : 1,
      expectedEffectiveWorkers:
        executionKind === 'RECORDED_PROVIDER_SQLITE'
          ? null
          : completionOrderId?.endsWith('_2')
            ? 2
            : 1,
    }),
  );
  const observations = requiredRuns.map((runKey) => {
    const recorded = runKey.executionKind === 'RECORDED_PROVIDER_SQLITE';
    const partial = runKey.expectedOutcome === 'PARTIAL_RETAINED';
    const checks = recorded
      ? vectors.checks[runKey.fixtureId]
      : runKey.executionKind === 'DECLARED_SOURCE_NATIVE'
        ? vectors.checks.metadata
        : null;
    return {
      runKey: structuredClone(runKey),
      status: 'PASSED',
      effectiveWorkers: recorded || partial ? null : runKey.expectedEffectiveWorkers,
      nativeOutcome: recorded ? null : partial ? 'PARTIAL' : 'SUCCEEDED',
      workerUnavailableReason: recorded
        ? 'NOT_APPLICABLE_RECORDED_PROVIDER'
        : partial
          ? 'PUBLIC_REFUSAL_HAS_NO_WORKER_RESULT'
          : null,
      componentChecks: checks ? Object.fromEntries(checks.map((name) => [name, true])) : null,
      sourceDigest: '6'.repeat(64),
      artifactDigests: Object.fromEntries(
        Object.entries({
          canonical: '7'.repeat(64),
          ...(runKey.completionOrderId
            ? { 'completion-order': (runKey.expectedEffectiveWorkers === 1 ? '8' : '9').repeat(64) }
            : {}),
          receipt: 'a'.repeat(64),
        }).sort(([a], [b]) => (a < b ? -1 : 1)),
      ),
      facts: runKey.scenario === 'GOLDEN' && !recorded ? structuredClone(vectors.metrics) : null,
      graphEqual: true,
      coverageEqual: true,
      supportEqual: true,
      staleBindings: 0,
      closure: { transactionClosed: true, tempClosed: true, childClosed: recorded ? null : true },
      timings: Object.fromEntries(
        vectors.stages.map((name) => [
          name,
          name === 'total'
            ? { value: 10, unavailableReason: null }
            : { value: null, unavailableReason: 'NOT_OBSERVED' },
        ]),
      ),
      peak: {
        value: null,
        unavailableReason: 'NOT_OBSERVED',
        units: 'bytes',
        method: 'UNAVAILABLE',
        scope: 'SYNTHETIC_LOGIC_ONLY',
      },
      failure: null,
    };
  });
  return {
    schemaVersion: 2,
    identity: structuredClone(vectors.identity),
    requiredRuns,
    observations,
  };
}
test('v2 accepts complete synthetic layered evidence without claiming physical qualification', () => {
  const input = complete(),
    before = structuredClone(input),
    report = evaluate(input);
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.overall, 'PASS');
  assert.deepEqual(report.aggregateCounts, {
    symbol: { tp: 50, fp: 0, fn: 0 },
    directCall: { tp: 50, fp: 0, fn: 0 },
  });
  assert.equal(report.gates.find((g) => g.name === 'IncrementalCorrectness').value, 1);
  assert.deepEqual(input, before);
  assert.equal(report.observations.filter((row) => row.nativeOutcome === 'PARTIAL').length, 2);
});
for (const defect of [
  'missing-case',
  'foreign-case',
  'relabel-layer',
  'wrong-scenario',
  'duplicate-case',
  'partial-repetition',
  'version',
  'aggregate-injection',
  'unknown-key',
  'unsafe-worker',
  'fake-recorded-worker',
  'fake-recorded-child',
  'native-null-worker',
  'missing-check',
  'extra-check',
]) {
  test(`v2 refuses malformed policy/input ${defect}`, () => {
    const data = complete();
    const recorded = data.observations.find(
      (row) => row.runKey.fixtureId === 'canonical-normalization',
    );
    if (defect === 'missing-case') data.requiredRuns.pop();
    if (defect === 'foreign-case') data.requiredRuns[0].fixtureId = 'foreign';
    if (defect === 'relabel-layer') data.requiredRuns[0].executionKind = 'RECORDED_PROVIDER_SQLITE';
    if (defect === 'wrong-scenario') data.requiredRuns[0].scenario = 'GOLDEN';
    if (defect === 'duplicate-case') data.requiredRuns.push(structuredClone(data.requiredRuns[0]));
    if (defect === 'partial-repetition')
      data.requiredRuns.push({ ...data.requiredRuns[0], repetition: 2 });
    if (defect === 'version') data.schemaVersion = 1;
    if (defect === 'aggregate-injection') data.gates = [];
    if (defect === 'unknown-key') data.requiredRuns[0].applicability = [];
    if (defect === 'unsafe-worker')
      data.requiredRuns[0].expectedEffectiveWorkers = Number.MAX_SAFE_INTEGER + 1;
    if (defect === 'fake-recorded-worker') recorded.effectiveWorkers = 1;
    if (defect === 'fake-recorded-child') recorded.closure.childClosed = true;
    if (defect === 'native-null-worker')
      data.observations[0].workerUnavailableReason = 'NOT_APPLICABLE_RECORDED_PROVIDER';
    if (defect === 'missing-check') delete recorded.componentChecks.receipts;
    if (defect === 'extra-check') recorded.componentChecks.exemption = true;
    assert.throws(() => evaluate(data), /Invalid Phase0.5 layered report input/);
  });
}
test('missing observations remain explicit failures, not a reduced denominator', () => {
  const data = complete();
  data.observations = data.observations.filter(
    (row) => !row.runKey.fixtureId.endsWith('/metadata-only-source-change'),
  );
  const report = evaluate(data);
  assert.equal(report.overall, 'FAIL');
  assert.equal(report.missingRuns.length, 1);
  assert.equal(report.gates.find((g) => g.name === 'IncrementalCorrectness').value, 20 / 21);
});
for (const defect of [
  'component-check',
  'component-sql-close',
  'generic-error-partial',
  'missing-partial-receipt',
  'native-child',
  'stale',
  'worker-order',
  'worker-count',
  'accuracy',
]) {
  test(`v2 fails incomplete required evidence ${defect}`, () => {
    const data = complete();
    const recorded = data.observations.find(
      (row) => row.runKey.fixtureId === 'canonical-normalization',
    );
    const partial = data.observations.find((row) => row.nativeOutcome === 'PARTIAL');
    if (defect === 'component-check') recorded.componentChecks.reopenedImages = false;
    if (defect === 'component-sql-close') recorded.closure.transactionClosed = null;
    if (defect === 'generic-error-partial') partial.nativeOutcome = null;
    if (defect === 'missing-partial-receipt') delete partial.artifactDigests.receipt;
    if (defect === 'native-child') data.observations[0].closure.childClosed = null;
    if (defect === 'stale') recorded.staleBindings = 1;
    if (defect === 'worker-order')
      data.observations.at(-1).artifactDigests['completion-order'] = '8'.repeat(64);
    if (defect === 'worker-count') data.observations.at(-1).effectiveWorkers = 1;
    if (defect === 'accuracy') {
      const row = data.observations.find((row) => row.facts !== null);
      row.facts.directCall.fn = 20;
      row.facts.directCall.recall = 1 / 3;
    }
    const result = evaluate(data);
    assert.equal(result.overall, 'FAIL');
    if (defect !== 'accuracy') assert.equal(result.aggregateCounts.symbol.tp, 50);
  });
}
test('non-Golden counts cannot dilute critical accuracy', () => {
  const data = complete();
  data.observations[0].facts = structuredClone(vectors.metrics);
  assert.equal(evaluate(data).aggregateCounts.symbol.tp, 50);
});

for (const defect of ['missing', 'failed', 'missing-metrics', 'invalid-terminal'])
  test(`critical gates stay unavailable when an original Java scope is ${defect}`, () => {
    const data = complete();
    const index = data.observations.findIndex((row) => row.runKey.fixtureId === 'java-call-basic');
    if (defect === 'missing') data.observations.splice(index, 1);
    else if (defect === 'failed') {
      data.observations[index].status = 'FAILED';
      data.observations[index].failure = {
        code: 'ANALYSIS_FAILED',
        message: 'Trial did not complete; inspect controlled evidence.',
      };
    } else if (defect === 'invalid-terminal') data.observations[index].nativeOutcome = 'PARTIAL';
    else data.observations[index].facts = null;
    const report = evaluate(data);
    assert.equal(report.overall, 'FAIL');
    assert.equal(report.aggregateCounts.symbol.tp, 40);
    for (const gate of report.gates.filter((gate) => gate.name.startsWith('Critical'))) {
      assert.equal(gate.value, null);
      assert.equal(gate.status, 'NOT_EVALUABLE');
    }
  });
test('v2 separates recorded and PARTIAL telemetry from successful Native work', () => {
  const report = evaluate(complete());
  const groups = Object.values(report.telemetry);
  assert.equal(
    groups.filter((g) => g.scope === 'NATIVE_FAILURE_PATH').reduce((n, g) => n + g.sampleCount, 0),
    2,
  );
  assert.equal(
    groups.filter((g) => g.scope === 'COMPONENT_REPLAY').reduce((n, g) => n + g.sampleCount, 0),
    3,
  );
  assert.equal(
    groups
      .filter((g) => g.scope === 'SUCCESSFUL_NATIVE_INDEX')
      .reduce((n, g) => n + g.sampleCount, 0),
    26,
  );
});
test('v2 rejects active accessors before executing caller code', () => {
  const data = complete();
  let calls = 0;
  Object.defineProperty(data, 'identity', {
    enumerable: true,
    get() {
      calls++;
      return vectors.identity;
    },
  });
  assert.throws(() => evaluate(data), /Invalid Phase0.5 layered report input/);
  assert.equal(calls, 0);
});

test('failed graph checks cannot be labelled successful Native benchmark telemetry', () => {
  const data = complete();
  data.observations[0].graphEqual = false;
  const report = evaluate(data);
  assert.equal(report.overall, 'FAIL');
  assert.equal(
    Object.values(report.telemetry)
      .filter((g) => g.scope === 'SUCCESSFUL_NATIVE_INDEX' && g.scenario === 'COLD')
      .reduce((n, g) => n + g.sampleCount, 0),
    0,
  );
});
test('the same complete inventory can be repeated without pooling worker proof across repetitions', () => {
  const data = complete();
  const second = complete();
  for (const key of second.requiredRuns) key.repetition = 2;
  for (const row of second.observations) {
    row.runKey.repetition = 2;
    row.sourceDigest = 'b'.repeat(64);
  }
  data.requiredRuns.push(...second.requiredRuns);
  data.observations.push(...second.observations);
  assert.equal(evaluate(data).overall, 'PASS');
  data.observations.at(-1).sourceDigest = '6'.repeat(64);
  assert.equal(evaluate(data).overall, 'FAIL');
});
for (const defect of [
  'sparse',
  'proxy',
  'hidden',
  'cycle',
  'negative-zero',
  'digest-order',
  'missing-null-reason',
  'foreign-observation',
  'duplicate-observation',
]) {
  test(`v2 data-only boundary rejects ${defect}`, () => {
    const data = complete();
    if (defect === 'sparse') delete data.observations[0];
    if (defect === 'proxy') data.identity = new Proxy(data.identity, {});
    if (defect === 'hidden') Object.defineProperty(data, 'hidden', { value: true });
    if (defect === 'cycle') data.identity.loop = data;
    if (defect === 'negative-zero') data.observations[0].staleBindings = -0;
    if (defect === 'digest-order')
      data.observations[0].artifactDigests = { receipt: 'a'.repeat(64), canonical: '7'.repeat(64) };
    if (defect === 'missing-null-reason') data.observations[0].peak.unavailableReason = null;
    if (defect === 'foreign-observation') data.observations[0].runKey.fixtureId = 'foreign';
    if (defect === 'duplicate-observation')
      data.observations.push(structuredClone(data.observations[0]));
    assert.throws(() => evaluate(data), /Invalid Phase0.5 layered report input/);
  });
}
