import { types } from 'node:util';
import type { Phase05FactMetrics } from './phase05-metrics.js';
import type { FactCounts } from './metric-engine.js';

const scenarios = [
  'COLD',
  'INCREMENTAL_1',
  'INCREMENTAL_5',
  'INCREMENTAL_50',
  'WORKER_CONSISTENCY',
  'TRANSITION',
  'GOLDEN',
  'PROVIDER_MERGE',
] as const;
const stages = [
  'scan',
  'parse',
  'resolve',
  'ipc',
  'normalize',
  'merge',
  'dbApply',
  'dbLock',
  'total',
] as const;
export type Phase05RunKey = {
  fixtureId: string;
  scenario: (typeof scenarios)[number];
  repetition: number;
  requestedWorkers: 'AUTO' | number;
  expectedEffectiveWorkers: number;
  completionOrderId: string | null;
};
type Measurement = { value: number | null; unavailableReason: string | null };
type Peak = Measurement & { units: 'bytes'; method: string; scope: string };
export type Phase05ReportIdentity = {
  implementationDigest: string;
  nativeExecutableSha256: string;
  fixtureDigest: string;
  configDigest: string;
  corpusDigest: string;
  environment: { node: string; v8: string; platform: string; arch: string };
};
export type Phase05Observation = {
  runKey: Phase05RunKey;
  status: 'SUCCEEDED' | 'FAILED' | 'NOT_RUN';
  effectiveWorkers: number | null;
  sourceDigest: string;
  artifactDigests: Record<string, string>;
  facts: Phase05FactMetrics | null;
  graphEqual: boolean | null;
  coverageEqual: boolean | null;
  supportEqual: boolean | null;
  staleBindings: number | null;
  closure: {
    transactionClosed: boolean | null;
    tempClosed: boolean | null;
    childClosed: boolean | null;
  };
  timings: Record<(typeof stages)[number], Measurement>;
  peak: Peak;
  failure: { code: string; message: string } | null;
};
export type Phase05ReportInput = {
  schemaVersion: 1;
  identity: Phase05ReportIdentity;
  requiredRuns: Phase05RunKey[];
  observations: Phase05Observation[];
};
type Failure = { code: string; runKey: Phase05RunKey | null; message: string };
type Gate = {
  name: string;
  value: number | null;
  nullReason: string | null;
  operator: '>=' | '==';
  threshold: number;
  status: 'PASS' | 'FAIL' | 'NOT_EVALUABLE';
};
type Telemetry = {
  samples: { runKey: Phase05RunKey; status: Phase05Observation['status']; valueMs: number }[];
  sampleCount: number;
  medianMs: number | null;
  maximumObservedMs: number | null;
  throughput: { value: number | null; units: 'observed-trials/second' };
  peaks: { runKey: Phase05RunKey; peak: Peak }[];
};
export type Phase05ReportV1 = Phase05ReportInput & {
  kind: 'PHASE05_EVALUATION';
  aggregateCounts: { symbol: FactCounts; directCall: FactCounts };
  gates: Gate[];
  telemetry: Record<string, Telemetry>;
  missingRuns: Phase05RunKey[];
  failures: Failure[];
  overall: 'PASS' | 'FAIL';
};

function check(value: unknown): asserts value {
  if (!value) throw new Error('Invalid Phase0.5 report input');
}
function record(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  check(
    value !== null && typeof value === 'object' && !Array.isArray(value) && !types.isProxy(value),
  );
  check(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  if (keys)
    check(
      Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)),
    );
  return value as Record<string, unknown>;
}
function text(value: unknown): asserts value is string {
  check(
    typeof value === 'string' &&
      value.length > 0 &&
      value.trim() === value &&
      !/[\u0000-\u001f]/.test(value),
  );
}
function integer(value: unknown, minimum = 0): asserts value is number {
  check(
    typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= minimum &&
      !Object.is(value, -0),
  );
}
function sha(value: unknown) {
  check(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value));
}
function choice(value: unknown, options: readonly unknown[]) {
  check(options.includes(value));
}
// Inspect descriptors before copying: no getters, proxies, custom serialization,
// sparse arrays, hidden members or cycles execute at this input boundary.
function snapshot(input: unknown): unknown {
  const active = new Set<object>();
  const visit = (value: unknown): void => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      check(Number.isFinite(value) && !Object.is(value, -0));
      return;
    }
    check(typeof value === 'object' && !types.isProxy(value) && !active.has(value));
    active.add(value);
    if (Array.isArray(value)) {
      check(
        Object.getPrototypeOf(value) === Array.prototype &&
          Reflect.ownKeys(value).length === value.length + 1,
      );
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        check(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'));
        visit(descriptor.value);
      }
    } else {
      record(value);
      for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        check(
          typeof key === 'string' && descriptor.enumerable && Object.hasOwn(descriptor, 'value'),
        );
        visit(descriptor.value);
      }
    }
    active.delete(value);
  };
  visit(input);
  return structuredClone(input);
}
function runKey(value: unknown): asserts value is Phase05RunKey {
  const row = record(value, [
    'fixtureId',
    'scenario',
    'repetition',
    'requestedWorkers',
    'expectedEffectiveWorkers',
    'completionOrderId',
  ]);
  text(row.fixtureId);
  choice(row.scenario, scenarios);
  integer(row.repetition, 1);
  integer(row.expectedEffectiveWorkers, 1);
  if (row.requestedWorkers !== 'AUTO') integer(row.requestedWorkers, 1);
  if (row.completionOrderId !== null) {
    check(row.scenario === 'WORKER_CONSISTENCY');
    text(row.completionOrderId);
  }
}
function encodedRunKey(key: Phase05RunKey): string {
  return [
    key.fixtureId,
    key.scenario,
    String(key.repetition),
    String(key.requestedWorkers),
    String(key.expectedEffectiveWorkers),
    key.completionOrderId === null ? 'NULL' : 'ID:' + key.completionOrderId,
  ].join('\0');
}
function ratio(tp: number, denominator: number): number | null {
  integer(denominator);
  return denominator === 0 ? null : tp / denominator;
}
function facts(value: unknown) {
  const row = record(value, ['symbol', 'directCall', 'comparison', 'criticalFailures']);
  for (const field of ['symbol', 'directCall']) {
    const counts = record(
      row[field],
      field === 'symbol' ? ['tp', 'fp', 'fn', 'recall'] : ['tp', 'fp', 'fn', 'recall', 'precision'],
    );
    integer(counts.tp);
    integer(counts.fp);
    integer(counts.fn);
    check(counts.recall === ratio(counts.tp, counts.tp + counts.fn));
    if (field === 'directCall') check(counts.precision === ratio(counts.tp, counts.tp + counts.fp));
  }
  const comparison = record(row.comparison, ['entries']);
  check(Array.isArray(comparison.entries));
  for (const value of comparison.entries) {
    const entry = record(value, [
      'factType',
      'expected',
      'actual',
      'matchBasis',
      'classification',
      'differences',
    ]);
    choice(entry.factType, ['NODE', 'EDGE']);
    choice(entry.classification, [null, 'MISSING', 'EXTRA']);
    choice(entry.matchBasis, [null, 'FACT_KEY', 'ID']);
    for (const side of ['expected', 'actual'])
      if (entry[side] !== null) {
        const identity = record(entry[side], ['id', 'factKey']);
        text(identity.id);
        text(identity.factKey);
      }
    check(Array.isArray(entry.differences));
    for (const difference of entry.differences) {
      const diff = record(difference);
      check(Object.keys(diff).every((key) => ['kind', 'path', 'expected', 'actual'].includes(key)));
      choice(diff.kind, ['SEMANTIC_DIFFERENCE', 'RESOLUTION_DIFFERENCE']);
      text(diff.path);
    }
    if (entry.classification === 'MISSING')
      check(
        entry.expected !== null &&
          entry.actual === null &&
          entry.matchBasis === null &&
          entry.differences.length === 0,
      );
    else if (entry.classification === 'EXTRA')
      check(
        entry.expected === null &&
          entry.actual !== null &&
          entry.matchBasis === null &&
          entry.differences.length === 0,
      );
    else check(entry.expected !== null && entry.actual !== null && entry.matchBasis !== null);
  }
  check(Array.isArray(row.criticalFailures));
  for (const failure of row.criticalFailures) {
    const item = record(failure, ['type', 'factKey', 'classification']);
    choice(item.type, ['NODE', 'EDGE']);
    text(item.factKey);
    choice(item.classification, ['MISSING', 'CHANGED']);
  }
}
function measurement(value: unknown, peak = false) {
  const row = record(
    value,
    peak
      ? ['value', 'unavailableReason', 'units', 'method', 'scope']
      : ['value', 'unavailableReason'],
  );
  if (row.value === null) text(row.unavailableReason);
  else {
    check(
      typeof row.value === 'number' &&
        row.value >= 0 &&
        Number.isFinite(row.value) &&
        row.unavailableReason === null,
    );
    if (peak) integer(row.value);
  }
  if (peak) {
    check(row.units === 'bytes');
    text(row.method);
    text(row.scope);
  }
}
function parse(input: unknown): Phase05ReportInput {
  const data = record(snapshot(input), [
    'schemaVersion',
    'identity',
    'requiredRuns',
    'observations',
  ]);
  check(data.schemaVersion === 1);
  const identity = record(data.identity, [
    'implementationDigest',
    'nativeExecutableSha256',
    'fixtureDigest',
    'configDigest',
    'corpusDigest',
    'environment',
  ]);
  for (const key of [
    'implementationDigest',
    'nativeExecutableSha256',
    'fixtureDigest',
    'configDigest',
    'corpusDigest',
  ])
    sha(identity[key]);
  for (const value of Object.values(
    record(identity.environment, ['node', 'v8', 'platform', 'arch']),
  ))
    text(value);
  check(Array.isArray(data.requiredRuns) && Array.isArray(data.observations));
  const required = new Set<string>();
  for (const key of data.requiredRuns) {
    runKey(key);
    const encoded = encodedRunKey(key);
    check(!required.has(encoded));
    required.add(encoded);
  }
  const observed = new Set<string>();
  for (const value of data.observations) {
    const row = record(value, [
      'runKey',
      'status',
      'effectiveWorkers',
      'sourceDigest',
      'artifactDigests',
      'facts',
      'graphEqual',
      'coverageEqual',
      'supportEqual',
      'staleBindings',
      'closure',
      'timings',
      'peak',
      'failure',
    ]);
    runKey(row.runKey);
    const encoded = encodedRunKey(row.runKey);
    check(required.has(encoded) && !observed.has(encoded));
    observed.add(encoded);
    choice(row.status, ['SUCCEEDED', 'FAILED', 'NOT_RUN']);
    if (row.effectiveWorkers !== null) integer(row.effectiveWorkers, 1);
    sha(row.sourceDigest);
    const digests = record(row.artifactDigests);
    const names = Object.keys(digests);
    check(names.every((name, index) => index === 0 || names[index - 1]! < name));
    for (const [name, value] of Object.entries(digests)) {
      text(name);
      sha(value);
    }
    if (row.facts !== null) facts(row.facts);
    for (const name of ['graphEqual', 'coverageEqual', 'supportEqual'])
      choice(row[name], [true, false, null]);
    if (row.staleBindings !== null) integer(row.staleBindings);
    for (const value of Object.values(
      record(row.closure, ['transactionClosed', 'tempClosed', 'childClosed']),
    ))
      choice(value, [true, false, null]);
    const timings = record(row.timings, stages);
    for (const value of Object.values(timings)) measurement(value);
    measurement(row.peak, true);
    if (row.failure !== null) {
      const failure = record(row.failure, ['code', 'message']);
      check(typeof failure.code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(failure.code));
      check(failure.message === 'Trial did not complete; inspect controlled evidence.');
    }
  }
  return data as unknown as Phase05ReportInput;
}

export function evaluatePhase05Report(input: Phase05ReportInput): Phase05ReportV1 {
  const data = parse(input);
  const failures: Failure[] = [];
  const add = (code: string, key: Phase05RunKey | null) =>
    failures.push({
      code,
      runKey: key,
      message:
        'Required Phase0.5 evaluation evidence is missing or does not satisfy its declared check.',
    });
  const observed = new Map(data.observations.map((row) => [encodedRunKey(row.runKey), row]));
  const missingRuns = data.requiredRuns.filter((key) => !observed.has(encodedRunKey(key)));
  for (const key of missingRuns) add('REQUIRED_RUN_MISSING', key);
  if (scenarios.some((scenario) => !data.requiredRuns.some((key) => key.scenario === scenario)))
    add('SCENARIO_INVENTORY_INCOMPLETE', null);
  const aggregateCounts = { symbol: { tp: 0, fp: 0, fn: 0 }, directCall: { tp: 0, fp: 0, fn: 0 } };
  const correct = (row: Phase05Observation) =>
    row.status === 'SUCCEEDED' &&
    row.facts !== null &&
    row.graphEqual === true &&
    row.coverageEqual === true &&
    row.supportEqual === true &&
    row.staleBindings === 0 &&
    Object.values(row.closure).every((value) => value === true) &&
    row.effectiveWorkers === row.runKey.expectedEffectiveWorkers &&
    row.facts.criticalFailures.length === 0 &&
    row.facts.comparison.entries.every(
      (entry) => entry.classification === null && entry.differences.length === 0,
    );
  for (const row of data.observations) {
    if (
      row.timings.total.value === null &&
      (row.runKey.scenario === 'COLD' ||
        row.runKey.scenario.startsWith('INCREMENTAL_') ||
        row.runKey.scenario === 'WORKER_CONSISTENCY')
    )
      add('TOTAL_TIMING_UNPROVED', row.runKey);
    if (row.status !== 'SUCCEEDED') add('RUN_NOT_SUCCESSFUL', row.runKey);
    if (row.facts === null) add('FACT_METRICS_UNPROVED', row.runKey);
    if ([row.graphEqual, row.coverageEqual, row.supportEqual].some((value) => value !== true))
      add('RUN_CHECK_UNPROVED', row.runKey);
    if (Object.values(row.closure).some((value) => value !== true))
      add('RESOURCE_CLOSURE_UNPROVED', row.runKey);
    if (row.effectiveWorkers !== row.runKey.expectedEffectiveWorkers)
      add('WORKER_COUNT_MISMATCH', row.runKey);
    if (
      row.facts &&
      (row.facts.criticalFailures.length ||
        row.facts.comparison.entries.some(
          (entry) => entry.classification !== null || entry.differences.length,
        ))
    )
      add('RUN_GRAPH_MISMATCH', row.runKey);
    if (row.status === 'SUCCEEDED' && row.facts)
      for (const field of ['symbol', 'directCall'] as const)
        for (const counter of ['tp', 'fp', 'fn'] as const) {
          aggregateCounts[field][counter] += row.facts[field][counter];
          integer(aggregateCounts[field][counter]);
        }
  }
  const workerRuns = data.requiredRuns.filter((key) => key.scenario === 'WORKER_CONSISTENCY');
  const workerRows = workerRuns.map((key) => observed.get(encodedRunKey(key)));
  if (
    new Set(workerRuns.map((key) => key.expectedEffectiveWorkers)).size < 2 ||
    workerRuns.some((key) => key.completionOrderId === null) ||
    new Set(workerRuns.map((key) => key.completionOrderId)).size < 2 ||
    workerRows.some(
      (row) =>
        !row ||
        !correct(row) ||
        !Object.hasOwn(row.artifactDigests, 'completion-order') ||
        !Object.hasOwn(row.artifactDigests, 'canonical'),
    ) ||
    new Set(workerRows.filter((row) => row !== undefined).map((row) => row.sourceDigest)).size !==
      1 ||
    new Set(
      workerRows.filter((row) => row !== undefined).map((row) => row.artifactDigests.canonical),
    ).size !== 1
  )
    add('WORKER_CONSISTENCY_UNPROVED', null);
  const incremental = data.requiredRuns.filter(
    (key) => key.scenario.startsWith('INCREMENTAL_') || key.scenario === 'TRANSITION',
  );
  const incrementalValue = ratio(
    incremental.filter((key) => {
      const row = observed.get(encodedRunKey(key));
      return row !== undefined && correct(row);
    }).length,
    incremental.length,
  );
  let stale: number | null = missingRuns.length ? null : 0;
  for (const row of data.observations) {
    if (row.staleBindings === null) stale = null;
    else if (stale !== null) {
      stale += row.staleBindings;
      integer(stale);
    }
  }
  const gate = (
    name: string,
    value: number | null,
    operator: Gate['operator'],
    threshold: number,
  ): Gate => ({
    name,
    value,
    nullReason: value === null ? 'Required denominator or observation is unavailable' : null,
    operator,
    threshold,
    status:
      value === null
        ? 'NOT_EVALUABLE'
        : (operator === '>=' ? value >= threshold : value === threshold)
          ? 'PASS'
          : 'FAIL',
  });
  const s = aggregateCounts.symbol,
    c = aggregateCounts.directCall;
  const gates = [
    gate('CriticalSymbolRecall', ratio(s.tp, s.tp + s.fn), '>=', 0.95),
    gate('CriticalDirectCallPrecision', ratio(c.tp, c.tp + c.fp), '>=', 0.95),
    gate('CriticalDirectCallRecall', ratio(c.tp, c.tp + c.fn), '>=', 0.9),
    gate('IncrementalCorrectness', incrementalValue, '==', 1),
    gate('StaleProviderBindings', stale, '==', 0),
  ];
  const telemetry: Record<string, Telemetry> = {};
  for (const scenario of scenarios) {
    const rows = data.observations.filter((row) => row.runKey.scenario === scenario);
    const samples = rows
      .filter((row) => row.timings.total.value !== null)
      .map((row) => ({
        runKey: row.runKey,
        status: row.status,
        valueMs: row.timings.total.value!,
      }));
    const values = samples.map((sample) => sample.valueMs).sort((a, b) => a - b);
    const length = values.length,
      middle = Math.floor(length / 2);
    const medianMs =
      length === 0
        ? null
        : length % 2
          ? values[middle]!
          : values[middle - 1]! / 2 + values[middle]! / 2;
    const total = values.reduce((sum, value) => sum + value, 0);
    check(Number.isFinite(total));
    const throughput = total === 0 ? null : (length / total) * 1000;
    check(throughput === null || Number.isFinite(throughput));
    telemetry[scenario] = {
      samples,
      sampleCount: length,
      medianMs,
      maximumObservedMs: length ? values[length - 1]! : null,
      throughput: { value: throughput, units: 'observed-trials/second' },
      peaks: rows.map((row) => ({ runKey: row.runKey, peak: row.peak })),
    };
  }
  return {
    ...data,
    kind: 'PHASE05_EVALUATION',
    aggregateCounts,
    gates,
    telemetry,
    missingRuns,
    failures,
    overall:
      failures.length === 0 && gates.every((gate) => gate.status === 'PASS') ? 'PASS' : 'FAIL',
  };
}
