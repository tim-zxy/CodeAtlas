import { types } from 'node:util';
import { PHASE05_CASE_POLICY, type Phase05CasePolicy } from './phase05-case-policy.js';
import type {
  Phase05Observation,
  Phase05ReportIdentity,
  Phase05ReportV1,
} from './phase05-report.js';
import type { FactCounts } from './metric-engine.js';

export type Phase05LayeredRunKey = Phase05CasePolicy & {
  repetition: number;
  requestedWorkers: 'AUTO' | number | null;
  expectedEffectiveWorkers: number | null;
};
export type Phase05LayeredObservation = Omit<Phase05Observation, 'runKey' | 'status'> & {
  runKey: Phase05LayeredRunKey;
  status: 'PASSED' | 'FAILED' | 'NOT_RUN';
  nativeOutcome: 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | null;
  workerUnavailableReason:
    | 'NOT_APPLICABLE_RECORDED_PROVIDER'
    | 'PUBLIC_REFUSAL_HAS_NO_WORKER_RESULT'
    | 'NO_QUALIFIED_NATIVE_RESULT'
    | null;
  componentChecks: Record<string, boolean | null> | null;
};
export type Phase05LayeredReportInputV2 = {
  schemaVersion: 2;
  identity: Phase05ReportIdentity;
  requiredRuns: Phase05LayeredRunKey[];
  observations: Phase05LayeredObservation[];
};
type Failure = { code: string; runKey: Phase05LayeredRunKey | null; message: string };
type Telemetry = {
  executionKind: Phase05CasePolicy['executionKind'];
  scenario: Phase05CasePolicy['scenario'];
  scope: 'SUCCESSFUL_NATIVE_INDEX' | 'NATIVE_FAILURE_PATH' | 'COMPONENT_REPLAY';
  samples: {
    runKey: Phase05LayeredRunKey;
    status: Phase05LayeredObservation['status'];
    valueMs: number;
  }[];
  sampleCount: number;
  medianMs: number | null;
  maximumObservedMs: number | null;
  throughput: { value: number | null; units: 'observed-trials/second' };
  peaks: { runKey: Phase05LayeredRunKey; peak: Phase05Observation['peak'] }[];
};
export type Phase05LayeredReportV2 = Phase05LayeredReportInputV2 & {
  kind: 'PHASE05_EVALUATION';
  aggregateCounts: { symbol: FactCounts; directCall: FactCounts };
  gates: Phase05ReportV1['gates'];
  telemetry: Record<string, Telemetry>;
  missingRuns: Phase05LayeredRunKey[];
  failures: Failure[];
  overall: 'PASS' | 'FAIL';
};

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
];
const normalizationChecks = [
  'pairGolden',
  'persistedGolden',
  'supportCandidates',
  'sourceActivation',
  'coverage',
  'reopenedImages',
  'receipts',
];
const mergeChecks = [
  'fullGolden',
  'oneGolden',
  'zeroGolden',
  'reverseOrder',
  'supportCandidates',
  'evidenceHistory',
  'sourceActivation',
  'coverage',
  'reopenedImages',
  'rejectedPatchRecovery',
  'receipts',
];
const metadataChecks = [
  'sourceMetadataTransition',
  'originalRelations',
  'fullRefreshAgreement',
  'nativeStateCoactivation',
  'activeSupportHistory',
  'restart',
  'rawOperations',
  'receipts',
];

function check(value: unknown): asserts value {
  if (!value) throw new Error('Invalid Phase0.5 layered report input');
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
function choice(value: unknown, choices: readonly unknown[]) {
  check(choices.includes(value));
}
function ratio(tp: number, denominator: number): number | null {
  integer(denominator);
  return denominator === 0 ? null : tp / denominator;
}
// Keep v1 byte/validator behavior intact; inspect v2's data boundary independently.
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
      for (let i = 0; i < value.length; i++) {
        const d = Object.getOwnPropertyDescriptor(value, String(i));
        check(d?.enumerable && Object.hasOwn(d, 'value'));
        visit(d.value);
      }
    } else {
      record(value);
      for (const key of Reflect.ownKeys(value)) {
        const d = Object.getOwnPropertyDescriptor(value, key)!;
        check(typeof key === 'string' && d.enumerable && Object.hasOwn(d, 'value'));
        visit(d.value);
      }
    }
    active.delete(value);
  };
  visit(input);
  return structuredClone(input);
}
function policyKey(
  key: Pick<Phase05CasePolicy, 'fixtureId' | 'scenario' | 'completionOrderId'>,
): string {
  return JSON.stringify([key.fixtureId, key.scenario, key.completionOrderId]);
}
function encoded(key: Phase05LayeredRunKey): string {
  return JSON.stringify([
    policyKey(key),
    key.repetition,
    key.requestedWorkers,
    key.expectedEffectiveWorkers,
    key.executionKind,
    key.expectedOutcome,
  ]);
}
function runKey(value: unknown): asserts value is Phase05LayeredRunKey {
  const key = record(value, [
    'fixtureId',
    'scenario',
    'completionOrderId',
    'executionKind',
    'expectedOutcome',
    'repetition',
    'requestedWorkers',
    'expectedEffectiveWorkers',
  ]);
  text(key.fixtureId);
  text(key.scenario);
  if (key.completionOrderId !== null) text(key.completionOrderId);
  const policy = PHASE05_CASE_POLICY.find(
    (item) => policyKey(item) === policyKey(key as unknown as Phase05LayeredRunKey),
  );
  check(
    policy &&
      key.executionKind === policy.executionKind &&
      key.expectedOutcome === policy.expectedOutcome,
  );
  integer(key.repetition, 1);
  if (policy.executionKind === 'RECORDED_PROVIDER_SQLITE')
    check(key.requestedWorkers === null && key.expectedEffectiveWorkers === null);
  else {
    if (key.requestedWorkers !== 'AUTO') integer(key.requestedWorkers, 1);
    integer(key.expectedEffectiveWorkers, 1);
  }
}
function metrics(value: unknown) {
  const row = record(value, ['symbol', 'directCall', 'comparison', 'criticalFailures']);
  for (const name of ['symbol', 'directCall']) {
    const c = record(
      row[name],
      name === 'symbol' ? ['tp', 'fp', 'fn', 'recall'] : ['tp', 'fp', 'fn', 'recall', 'precision'],
    );
    integer(c.tp);
    integer(c.fp);
    integer(c.fn);
    check(c.recall === ratio(c.tp, c.tp + c.fn));
    if (name === 'directCall') check(c.precision === ratio(c.tp, c.tp + c.fp));
  }
  const comparison = record(row.comparison, ['entries']);
  check(Array.isArray(comparison.entries));
  for (const value of comparison.entries) {
    const e = record(value, [
      'factType',
      'expected',
      'actual',
      'matchBasis',
      'classification',
      'differences',
    ]);
    choice(e.factType, ['NODE', 'EDGE']);
    choice(e.classification, [null, 'MISSING', 'EXTRA']);
    choice(e.matchBasis, [null, 'FACT_KEY', 'ID']);
    for (const side of ['expected', 'actual'])
      if (e[side] !== null) {
        const id = record(e[side], ['id', 'factKey']);
        text(id.id);
        text(id.factKey);
      }
    check(Array.isArray(e.differences));
    for (const value of e.differences) {
      const d = record(value);
      check(Object.keys(d).every((key) => ['kind', 'path', 'expected', 'actual'].includes(key)));
      choice(d.kind, ['SEMANTIC_DIFFERENCE', 'RESOLUTION_DIFFERENCE']);
      text(d.path);
    }
    if (e.classification === 'MISSING')
      check(
        e.expected !== null &&
          e.actual === null &&
          e.matchBasis === null &&
          e.differences.length === 0,
      );
    else if (e.classification === 'EXTRA')
      check(
        e.expected === null &&
          e.actual !== null &&
          e.matchBasis === null &&
          e.differences.length === 0,
      );
    else check(e.expected !== null && e.actual !== null && e.matchBasis !== null);
  }
  check(Array.isArray(row.criticalFailures));
  for (const value of row.criticalFailures) {
    const f = record(value, ['type', 'factKey', 'classification']);
    choice(f.type, ['NODE', 'EDGE']);
    text(f.factKey);
    choice(f.classification, ['MISSING', 'CHANGED']);
  }
}
function measurement(value: unknown, peak = false) {
  const m = record(
    value,
    peak
      ? ['value', 'unavailableReason', 'units', 'method', 'scope']
      : ['value', 'unavailableReason'],
  );
  if (m.value === null) text(m.unavailableReason);
  else {
    check(
      typeof m.value === 'number' &&
        Number.isFinite(m.value) &&
        m.value >= 0 &&
        m.unavailableReason === null,
    );
    if (peak) integer(m.value);
  }
  if (peak) {
    check(m.units === 'bytes');
    text(m.method);
    text(m.scope);
  }
}
function parse(input: unknown): Phase05LayeredReportInputV2 {
  const data = record(snapshot(input), [
    'schemaVersion',
    'identity',
    'requiredRuns',
    'observations',
  ]);
  check(data.schemaVersion === 2);
  const identity = record(data.identity, [
    'implementationDigest',
    'nativeExecutableSha256',
    'fixtureDigest',
    'configDigest',
    'corpusDigest',
    'environment',
  ]);
  for (const [name, value] of Object.entries(identity)) if (name !== 'environment') sha(value);
  for (const value of Object.values(
    record(identity.environment, ['node', 'v8', 'platform', 'arch']),
  ))
    text(value);
  check(
    Array.isArray(data.requiredRuns) &&
      data.requiredRuns.length > 0 &&
      Array.isArray(data.observations),
  );
  const required = new Set<string>(),
    repetitions = new Map<number, Set<string>>();
  for (const key of data.requiredRuns) {
    runKey(key);
    const id = encoded(key);
    check(!required.has(id));
    required.add(id);
    const group = repetitions.get(key.repetition) ?? new Set<string>();
    const semantic = policyKey(key);
    check(!group.has(semantic));
    group.add(semantic);
    repetitions.set(key.repetition, group);
  }
  const numbers = [...repetitions.keys()].sort((a, b) => a - b);
  check(
    numbers.every(
      (n, index) => n === index + 1 && repetitions.get(n)!.size === PHASE05_CASE_POLICY.length,
    ),
  );
  const observed = new Set<string>();
  for (const value of data.observations) {
    const row = record(value, [
      'runKey',
      'status',
      'effectiveWorkers',
      'nativeOutcome',
      'workerUnavailableReason',
      'componentChecks',
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
    const key = row.runKey,
      id = encoded(key);
    check(required.has(id) && !observed.has(id));
    observed.add(id);
    choice(row.status, ['PASSED', 'FAILED', 'NOT_RUN']);
    choice(row.nativeOutcome, ['SUCCEEDED', 'PARTIAL', 'FAILED', null]);
    choice(row.workerUnavailableReason, [
      'NOT_APPLICABLE_RECORDED_PROVIDER',
      'PUBLIC_REFUSAL_HAS_NO_WORKER_RESULT',
      'NO_QUALIFIED_NATIVE_RESULT',
      null,
    ]);
    if (row.effectiveWorkers !== null) {
      integer(row.effectiveWorkers, 1);
      check(row.workerUnavailableReason === null);
    } else check(row.workerUnavailableReason !== null);
    sha(row.sourceDigest);
    const digests = record(row.artifactDigests),
      names = Object.keys(digests);
    check(names.every((name, index) => index === 0 || names[index - 1]! < name));
    for (const [name, digest] of Object.entries(digests)) {
      text(name);
      sha(digest);
    }
    if (row.facts !== null) metrics(row.facts);
    for (const name of ['graphEqual', 'coverageEqual', 'supportEqual'])
      choice(row[name], [true, false, null]);
    if (row.staleBindings !== null) integer(row.staleBindings);
    const closure = record(row.closure, ['transactionClosed', 'tempClosed', 'childClosed']);
    for (const field of Object.values(closure)) choice(field, [true, false, null]);
    const recorded = key.executionKind === 'RECORDED_PROVIDER_SQLITE';
    if (recorded)
      check(
        row.nativeOutcome === null &&
          row.facts === null &&
          row.effectiveWorkers === null &&
          row.workerUnavailableReason === 'NOT_APPLICABLE_RECORDED_PROVIDER' &&
          closure.childClosed === null,
      );
    else check(row.workerUnavailableReason !== 'NOT_APPLICABLE_RECORDED_PROVIDER');
    if (row.workerUnavailableReason === 'PUBLIC_REFUSAL_HAS_NO_WORKER_RESULT')
      check(key.expectedOutcome === 'PARTIAL_RETAINED');
    if (key.executionKind === 'NATIVE_INDEX') check(row.componentChecks === null);
    else {
      const fields = recorded
        ? key.fixtureId === 'canonical-normalization'
          ? normalizationChecks
          : mergeChecks
        : metadataChecks;
      for (const field of Object.values(record(row.componentChecks, fields)))
        choice(field, [true, false, null]);
    }
    for (const value of Object.values(record(row.timings, stages))) measurement(value);
    measurement(row.peak, true);
    if (row.failure !== null) {
      const failure = record(row.failure, ['code', 'message']);
      check(typeof failure.code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(failure.code));
      check(failure.message === 'Trial did not complete; inspect controlled evidence.');
    }
    check(row.status !== 'PASSED' || row.failure === null);
  }
  return data as unknown as Phase05LayeredReportInputV2;
}

export function evaluatePhase05LayeredReport(
  input: Phase05LayeredReportInputV2,
): Phase05LayeredReportV2 {
  const data = parse(input),
    failures: Failure[] = [];
  const add = (code: string, runKey: Phase05LayeredRunKey | null) =>
    failures.push({
      code,
      runKey,
      message:
        'Required Phase0.5 evaluation evidence is missing or does not satisfy its declared check.',
    });
  const observed = new Map(data.observations.map((row) => [encoded(row.runKey), row]));
  const missingRuns = data.requiredRuns.filter((key) => !observed.has(encoded(key)));
  for (const key of missingRuns) add('REQUIRED_RUN_MISSING', key);
  const aggregateCounts = { symbol: { tp: 0, fp: 0, fn: 0 }, directCall: { tp: 0, fp: 0, fn: 0 } };
  const qualified = new Set<string>();
  for (const row of data.observations) {
    const start = failures.length,
      key = row.runKey;
    const recorded = key.executionKind === 'RECORDED_PROVIDER_SQLITE',
      partial = key.expectedOutcome === 'PARTIAL_RETAINED';
    if (row.status !== 'PASSED') add('RUN_NOT_PASSED', key);
    if ([row.graphEqual, row.coverageEqual, row.supportEqual].some((value) => value !== true))
      add('RUN_CHECK_UNPROVED', key);
    if (row.staleBindings !== 0) add('STALE_BINDINGS_UNPROVED', key);
    if (
      row.closure.transactionClosed !== true ||
      row.closure.tempClosed !== true ||
      (!recorded && row.closure.childClosed !== true)
    )
      add('RESOURCE_CLOSURE_UNPROVED', key);
    if (!recorded && row.nativeOutcome !== (partial ? 'PARTIAL' : 'SUCCEEDED'))
      add('NATIVE_OUTCOME_UNPROVED', key);
    if (
      !recorded &&
      (partial
        ? row.effectiveWorkers === null
          ? row.workerUnavailableReason !== 'PUBLIC_REFUSAL_HAS_NO_WORKER_RESULT'
          : row.effectiveWorkers !== key.expectedEffectiveWorkers
        : row.effectiveWorkers !== key.expectedEffectiveWorkers)
    )
      add('WORKER_COUNT_MISMATCH', key);
    if (!Object.hasOwn(row.artifactDigests, 'receipt')) add('RECEIPT_UNPROVED', key);
    if (row.componentChecks && Object.values(row.componentChecks).some((value) => value !== true))
      add('COMPONENT_CHECK_UNPROVED', key);
    if (
      row.facts &&
      (row.facts.criticalFailures.length ||
        row.facts.comparison.entries.some(
          (entry) => entry.classification !== null || entry.differences.length,
        ))
    )
      add('RUN_GRAPH_MISMATCH', key);
    if (key.scenario === 'GOLDEN' && key.executionKind === 'NATIVE_INDEX') {
      if (row.facts === null) add('FACT_METRICS_UNPROVED', key);
      else if (row.status === 'PASSED' && row.nativeOutcome === 'SUCCEEDED')
        for (const field of ['symbol', 'directCall'] as const)
          for (const counter of ['tp', 'fp', 'fn'] as const) {
            aggregateCounts[field][counter] += row.facts[field][counter];
            integer(aggregateCounts[field][counter]);
          }
    }
    if (
      (key.scenario === 'COLD' ||
        key.scenario.startsWith('INCREMENTAL_') ||
        key.scenario === 'WORKER_CONSISTENCY') &&
      row.timings.total.value === null
    )
      add('TOTAL_TIMING_UNPROVED', key);
    if (failures.length === start) qualified.add(encoded(key));
  }
  for (const repetition of new Set(data.requiredRuns.map((key) => key.repetition))) {
    const keys = data.requiredRuns.filter(
      (key) => key.repetition === repetition && key.scenario === 'WORKER_CONSISTENCY',
    );
    const rows = keys.map((key) => observed.get(encoded(key)));
    if (
      new Set(keys.map((key) => key.expectedEffectiveWorkers)).size !== 2 ||
      rows.some(
        (row) =>
          !row ||
          !qualified.has(encoded(row.runKey)) ||
          !row.artifactDigests['completion-order'] ||
          !row.artifactDigests.canonical,
      ) ||
      new Set(rows.map((row) => row?.sourceDigest)).size !== 1 ||
      new Set(rows.map((row) => row?.artifactDigests.canonical)).size !== 1 ||
      new Set(rows.map((row) => row?.artifactDigests['completion-order'])).size !== 2
    )
      add('WORKER_CONSISTENCY_UNPROVED', null);
  }
  const incremental = data.requiredRuns.filter(
    (key) => key.scenario.startsWith('INCREMENTAL_') || key.scenario === 'TRANSITION',
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
    operator: '>=' | '==',
    threshold: number,
  ): Phase05ReportV1['gates'][number] => ({
    name,
    value,
    operator,
    threshold,
    nullReason: value === null ? 'Required denominator or observation is unavailable' : null,
    status:
      value === null
        ? 'NOT_EVALUABLE'
        : (operator === '>=' ? value >= threshold : value === threshold)
          ? 'PASS'
          : 'FAIL',
  });
  const s = aggregateCounts.symbol,
    c = aggregateCounts.directCall;
  // Do not turn a missing original scope into a smaller, apparently perfect
  // accuracy denominator. Retain observed raw counts, but withhold the gates.
  const accuracyReady = data.requiredRuns
    .filter((key) => key.scenario === 'GOLDEN' && key.executionKind === 'NATIVE_INDEX')
    .every((key) => {
      const row = observed.get(encoded(key));
      return row?.status === 'PASSED' && row.nativeOutcome === 'SUCCEEDED' && row.facts !== null;
    });
  const gates = [
    gate('CriticalSymbolRecall', accuracyReady ? ratio(s.tp, s.tp + s.fn) : null, '>=', 0.95),
    gate(
      'CriticalDirectCallPrecision',
      accuracyReady ? ratio(c.tp, c.tp + c.fp) : null,
      '>=',
      0.95,
    ),
    gate('CriticalDirectCallRecall', accuracyReady ? ratio(c.tp, c.tp + c.fn) : null, '>=', 0.9),
    gate(
      'IncrementalCorrectness',
      ratio(incremental.filter((key) => qualified.has(encoded(key))).length, incremental.length),
      '==',
      1,
    ),
    gate('StaleProviderBindings', stale, '==', 0),
  ];
  const telemetry: Record<string, Telemetry> = {};
  const groups = new Map<
    string,
    { rows: Phase05LayeredObservation[]; scope: Telemetry['scope'] }
  >();
  for (const row of data.observations) {
    const scope: Telemetry['scope'] =
      row.runKey.executionKind !== 'NATIVE_INDEX'
        ? 'COMPONENT_REPLAY'
        : row.nativeOutcome === 'SUCCEEDED' && qualified.has(encoded(row.runKey))
          ? 'SUCCESSFUL_NATIVE_INDEX'
          : 'NATIVE_FAILURE_PATH';
    const key = `${row.runKey.executionKind}/${row.runKey.scenario}/${scope}`;
    const group = groups.get(key) ?? { rows: [], scope };
    group.rows.push(row);
    groups.set(key, group);
  }
  for (const [key, { rows, scope }] of groups) {
    const samples = rows
      .filter((row) => row.timings.total.value !== null)
      .map((row) => ({
        runKey: row.runKey,
        status: row.status,
        valueMs: row.timings.total.value!,
      }));
    const values = samples.map((sample) => sample.valueMs).sort((a, b) => a - b),
      count = values.length,
      middle = Math.floor(count / 2);
    const total = values.reduce((sum, value) => sum + value, 0);
    check(Number.isFinite(total));
    const throughput = total === 0 ? null : (count / total) * 1000;
    check(throughput === null || Number.isFinite(throughput));
    telemetry[key] = {
      executionKind: rows[0]!.runKey.executionKind,
      scenario: rows[0]!.runKey.scenario,
      scope,
      samples,
      sampleCount: count,
      medianMs: !count
        ? null
        : count % 2
          ? values[middle]!
          : values[middle - 1]! / 2 + values[middle]! / 2,
      maximumObservedMs: count ? values[count - 1]! : null,
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
