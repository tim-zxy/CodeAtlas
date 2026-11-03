import { types } from 'node:util';
import { EntityRefSchema, JsonValueSchema, parseIr, type EntityRef } from '@codeatlas/ir';

export type Phase1ExecutionKind =
  'PURE_CONTRACT' | 'RECORDED_REPLAY' | 'TEST_DOUBLE' | 'ACTUAL_PRODUCT' | 'ACTUAL_MODEL';
export type Phase1GateStatus = 'PASS' | 'FAIL' | 'NOT_EVALUABLE' | 'NOT_APPLICABLE';
type Metric = 'PRECISION' | 'RECALL';
type Operator = '>=' | '>' | '<=' | '<' | '==';
type Threshold = { obligationId: string; metric: Metric; operator: Operator; threshold: number };
export interface Phase1EvaluationInput {
  schemaVersion: 1;
  identity: {
    fixtureId: string;
    manifestDigest: string;
    inputDigest: string;
    expectedDigest: string;
    implementationDigest: string;
    configDigest: string;
    policyDigest: string;
    versions: Record<string, string | null>;
    unavailableReasons: Record<string, string>;
  };
  requiredObligations: {
    id: string;
    layer: 'L1' | 'L2' | 'L3' | 'L4';
    kind: 'ASSERTION' | 'RATIO';
    critical: boolean;
    executionKind: Phase1ExecutionKind;
    oracleDigest: string;
    metric: Metric | null;
    applicability: { applicable: boolean; decisionRef: string | null; reason: string | null };
  }[];
  observations: {
    obligationId: string;
    executionKind: Phase1ExecutionKind;
    oracleDigest: string;
    inputDigest: string;
    implementationDigest: string;
    basisRefs: EntityRef[];
    actualArtifact: { ref: string; digest: string } | null;
    status: 'PASS' | 'FAIL' | 'NOT_EVALUABLE';
    counts: { tp: number; fp: number; fn: number } | null;
    unavailableReason: string | null;
    timings: { durationMs: number | null; peakBytes: number | null; reason: string | null };
    warnings: string[];
  }[];
  baselineRef: {
    id: string;
    version: number;
    digest: string;
    inputDigest: string;
    expectedDigest: string;
    approval: { status: 'APPROVED' | 'PROPOSED'; ref: string | null };
    thresholds: Threshold[];
  } | null;
  limitations: string[];
}
export interface Phase1EvaluationGate {
  obligationId: string;
  status: Phase1GateStatus;
  observed: number | boolean | null;
  threshold: Threshold | null;
  reason: string | null;
}
export interface Phase1EvaluationReport {
  schema: 'codeatlas.phase1-evaluation';
  version: 1;
  payload: Phase1EvaluationInput & {
    gates: Phase1EvaluationGate[];
    overall: Phase1GateStatus;
    missing: string[];
    failed: string[];
    notEvaluable: string[];
    notApplicable: string[];
  };
}
export class Phase1EvaluationError extends Error {
  readonly code = 'PHASE1_EVALUATION_INPUT_INVALID' as const;
  constructor() {
    super('Invalid Phase1 evaluation input');
    this.name = 'Phase1EvaluationError';
  }
}
const executionKinds = [
  'PURE_CONTRACT',
  'RECORDED_REPLAY',
  'TEST_DOUBLE',
  'ACTUAL_PRODUCT',
  'ACTUAL_MODEL',
];
const versionKeys = [
  'product',
  'native',
  'grammar',
  'normalizer',
  'plugin',
  'workflow',
  'prompt',
  'modelPolicy',
  'model',
  'platform',
];
function check(value: unknown): asserts value {
  if (!value) throw new Phase1EvaluationError();
}
function plainData(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value !== 'object') {
    check(
      value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)),
    );
    return;
  }
  check(!types.isProxy(value) && !ancestors.has(value));
  const array = Array.isArray(value);
  check(
    array
      ? Object.getPrototypeOf(value) === Array.prototype
      : Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null,
  );
  const descriptors = Object.getOwnPropertyDescriptors(value);
  check(Reflect.ownKeys(value).every((key) => typeof key === 'string'));
  if (array) {
    check(Object.keys(descriptors).length === value.length + 1);
    for (let i = 0; i < value.length; i++) check(Object.hasOwn(descriptors, String(i)));
  }
  ancestors.add(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (array && key === 'length') continue;
    check(Object.hasOwn(descriptor, 'value') && descriptor.enumerable);
    plainData(descriptor.value, ancestors);
  }
  ancestors.delete(value);
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value));
  const object = value as Record<string, unknown>;
  check(
    Object.keys(object).length === keys.length && keys.every((key) => Object.hasOwn(object, key)),
  );
  return object;
}
function list(value: unknown): unknown[] {
  check(Array.isArray(value));
  return value;
}
function text(value: unknown): asserts value is string {
  check(typeof value === 'string' && value.length > 0 && value.trim() === value);
}
function nullableText(value: unknown): void {
  if (value !== null) text(value);
}
function digest(value: unknown): void {
  check(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value));
}
function choice(value: unknown, choices: readonly string[]): void {
  check(typeof value === 'string' && choices.includes(value));
}
function count(value: unknown): asserts value is number {
  check(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
}
function unique(values: readonly string[]): void {
  check(new Set(values).size === values.length);
}
function parseInput(value: unknown): Phase1EvaluationInput {
  plainData(value);
  // Reuse Common IR JSON safety; the descriptor pass above rejects accessors before invocation.
  parseIr(JsonValueSchema, value);
  const root = record(value, [
    'schemaVersion',
    'identity',
    'requiredObligations',
    'observations',
    'baselineRef',
    'limitations',
  ]);
  check(root.schemaVersion === 1);
  const identity = record(root.identity, [
    'fixtureId',
    'manifestDigest',
    'inputDigest',
    'expectedDigest',
    'implementationDigest',
    'configDigest',
    'policyDigest',
    'versions',
    'unavailableReasons',
  ]);
  text(identity.fixtureId);
  for (const key of [
    'manifestDigest',
    'inputDigest',
    'expectedDigest',
    'implementationDigest',
    'configDigest',
    'policyDigest',
  ])
    digest(identity[key]);
  const versions = record(identity.versions, versionKeys);
  for (const v of Object.values(versions)) nullableText(v);
  text(versions.product);
  text(versions.platform);
  const unavailableKeys = versionKeys.filter((key) => versions[key] === null);
  const reasons = record(identity.unavailableReasons, unavailableKeys);
  for (const reason of Object.values(reasons)) text(reason);
  const required = list(root.requiredObligations);
  check(required.length > 0);
  const ids: string[] = [];
  for (const item of required) {
    const o = record(item, [
      'id',
      'layer',
      'kind',
      'critical',
      'executionKind',
      'oracleDigest',
      'metric',
      'applicability',
    ]);
    text(o.id);
    ids.push(o.id);
    choice(o.layer, ['L1', 'L2', 'L3', 'L4']);
    choice(o.kind, ['ASSERTION', 'RATIO']);
    check(typeof o.critical === 'boolean');
    choice(o.executionKind, executionKinds);
    digest(o.oracleDigest);
    if (o.kind === 'RATIO') choice(o.metric, ['PRECISION', 'RECALL']);
    else check(o.metric === null);
    const a = record(o.applicability, ['applicable', 'decisionRef', 'reason']);
    check(typeof a.applicable === 'boolean');
    if (a.applicable) {
      check(a.decisionRef === null && a.reason === null);
    } else {
      text(a.decisionRef);
      text(a.reason);
    }
  }
  unique(ids);
  check(required.some((o) => (o as Record<string, unknown>).critical === true));
  const observedIds: string[] = [];
  for (const item of list(root.observations)) {
    const o = record(item, [
      'obligationId',
      'executionKind',
      'oracleDigest',
      'inputDigest',
      'implementationDigest',
      'basisRefs',
      'actualArtifact',
      'status',
      'counts',
      'unavailableReason',
      'timings',
      'warnings',
    ]);
    text(o.obligationId);
    check(ids.includes(o.obligationId));
    observedIds.push(o.obligationId);
    choice(o.executionKind, executionKinds);
    for (const key of ['oracleDigest', 'inputDigest', 'implementationDigest']) digest(o[key]);
    const refs = list(o.basisRefs);
    const refKeys = refs.map((ref) => {
      const r = EntityRefSchema.parse(ref);
      return JSON.stringify([r.kind, r.id, r.revisionId ?? null]);
    });
    unique(refKeys);
    if (o.actualArtifact !== null) {
      const a = record(o.actualArtifact, ['ref', 'digest']);
      text(a.ref);
      digest(a.digest);
    }
    choice(o.status, ['PASS', 'FAIL', 'NOT_EVALUABLE']);
    nullableText(o.unavailableReason);
    if (o.status === 'NOT_EVALUABLE') text(o.unavailableReason);
    if (o.status === 'PASS') check(o.unavailableReason === null);
    if (o.counts !== null) {
      const c = record(o.counts, ['tp', 'fp', 'fn']);
      count(c.tp);
      count(c.fp);
      count(c.fn);
      check(Number.isSafeInteger(c.tp + c.fp) && Number.isSafeInteger(c.tp + c.fn));
    }
    const t = record(o.timings, ['durationMs', 'peakBytes', 'reason']);
    for (const key of ['durationMs', 'peakBytes'])
      if (t[key] !== null)
        check(typeof t[key] === 'number' && Number.isFinite(t[key]) && (t[key] as number) >= 0);
    if (t.peakBytes !== null) count(t.peakBytes);
    nullableText(t.reason);
    if (t.durationMs === null || t.peakBytes === null) text(t.reason);
    for (const warning of list(o.warnings)) text(warning);
  }
  unique(observedIds);
  if (root.baselineRef !== null) {
    const b = record(root.baselineRef, [
      'id',
      'version',
      'digest',
      'inputDigest',
      'expectedDigest',
      'approval',
      'thresholds',
    ]);
    text(b.id);
    count(b.version);
    check(b.version > 0);
    for (const k of ['digest', 'inputDigest', 'expectedDigest']) digest(b[k]);
    const a = record(b.approval, ['status', 'ref']);
    choice(a.status, ['APPROVED', 'PROPOSED']);
    nullableText(a.ref);
    if (a.status === 'APPROVED') text(a.ref);
    const thresholdIds: string[] = [];
    for (const item of list(b.thresholds)) {
      const t = record(item, ['obligationId', 'metric', 'operator', 'threshold']);
      text(t.obligationId);
      check(ids.includes(t.obligationId));
      thresholdIds.push(t.obligationId);
      choice(t.metric, ['PRECISION', 'RECALL']);
      choice(t.operator, ['>=', '>', '<=', '<', '==']);
      check(typeof t.threshold === 'number' && t.threshold >= 0 && t.threshold <= 1);
    }
    unique(thresholdIds);
  }
  for (const limitation of list(root.limitations)) text(limitation);
  return JSON.parse(JSON.stringify(value)) as Phase1EvaluationInput;
}
function compare(value: number, threshold: Threshold): boolean {
  switch (threshold.operator) {
    case '>=':
      return value >= threshold.threshold;
    case '>':
      return value > threshold.threshold;
    case '<=':
      return value <= threshold.threshold;
    case '<':
      return value < threshold.threshold;
    case '==':
      return value === threshold.threshold;
  }
}
export function evaluatePhase1Report(value: unknown): Phase1EvaluationReport {
  let input: Phase1EvaluationInput;
  try {
    input = parseInput(value);
  } catch {
    throw new Phase1EvaluationError();
  }
  const observations = new Map(input.observations.map((o) => [o.obligationId, o]));
  const missing: string[] = [];
  const gates: Phase1EvaluationGate[] = input.requiredObligations.map((o) => {
    const observation = observations.get(o.id);
    const gate: Phase1EvaluationGate = {
      obligationId: o.id,
      status: 'NOT_EVALUABLE',
      observed: null,
      threshold: null,
      reason: null,
    };
    const unavailable = (reason: string) => ({ ...gate, reason });
    if (!o.applicability.applicable) {
      check(observation === undefined);
      return { ...gate, status: 'NOT_APPLICABLE', reason: o.applicability.reason };
    }
    if (!observation) {
      missing.push(o.id);
      return unavailable('MISSING_OBSERVATION');
    }
    if (observation.executionKind !== o.executionKind)
      return unavailable('EXECUTION_KIND_MISMATCH');
    if (
      observation.oracleDigest !== o.oracleDigest ||
      observation.inputDigest !== input.identity.inputDigest ||
      observation.implementationDigest !== input.identity.implementationDigest
    )
      return unavailable('OBSERVATION_IDENTITY_MISMATCH');
    if (
      (o.executionKind === 'ACTUAL_PRODUCT' || o.executionKind === 'ACTUAL_MODEL') &&
      (observation.actualArtifact === null || observation.basisRefs.length === 0)
    )
      return unavailable('ACTUAL_EVIDENCE_MISSING');
    if (observation.status === 'FAIL')
      return { ...gate, status: 'FAIL', observed: false, reason: observation.unavailableReason };
    if (observation.status === 'NOT_EVALUABLE') return unavailable(observation.unavailableReason!);
    if (o.kind === 'ASSERTION') {
      check(observation.counts === null);
      return { ...gate, status: 'PASS', observed: true };
    }
    const c = observation.counts;
    if (c === null) return unavailable('COUNTS_UNAVAILABLE');
    const denominator = o.metric === 'PRECISION' ? c.tp + c.fp : c.tp + c.fn;
    if (denominator === 0)
      return unavailable(o.metric === 'PRECISION' ? 'NO_PREDICTIONS' : 'NO_EXPECTED_FACTS');
    gate.observed = c.tp / denominator;
    const b = input.baselineRef;
    if (b === null || b.approval.status !== 'APPROVED')
      return { ...gate, reason: 'BASELINE_NOT_APPROVED' };
    if (
      b.inputDigest !== input.identity.inputDigest ||
      b.expectedDigest !== input.identity.expectedDigest
    )
      return { ...gate, reason: 'BASELINE_IDENTITY_MISMATCH' };
    const threshold = b.thresholds.find((t) => t.obligationId === o.id && t.metric === o.metric);
    if (!threshold) return { ...gate, reason: 'BASELINE_THRESHOLD_MISSING' };
    return { ...gate, threshold, status: compare(gate.observed, threshold) ? 'PASS' : 'FAIL' };
  });
  const failed = gates.filter((g) => g.status === 'FAIL').map((g) => g.obligationId);
  const notEvaluable = gates.filter((g) => g.status === 'NOT_EVALUABLE').map((g) => g.obligationId);
  const notApplicable = gates
    .filter((g) => g.status === 'NOT_APPLICABLE')
    .map((g) => g.obligationId);
  const overall: Phase1GateStatus = failed.length
    ? 'FAIL'
    : notEvaluable.length
      ? 'NOT_EVALUABLE'
      : notApplicable.length === gates.length
        ? 'NOT_APPLICABLE'
        : 'PASS';
  return {
    schema: 'codeatlas.phase1-evaluation',
    version: 1,
    payload: { ...input, gates, overall, missing, failed, notEvaluable, notApplicable },
  };
}
