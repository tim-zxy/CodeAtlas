import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as evaluation from '../dist/index.js';
const root = new URL('../../../fixtures/phase1/report-contract/', import.meta.url);
const vector = JSON.parse(await readFile(new URL('inputs/vectors.json', root), 'utf8'));
const expected = JSON.parse(await readFile(new URL('expected/report.json', root), 'utf8'));
const fresh = () => structuredClone(vector);
function evaluate(input) {
  assert.equal(
    typeof evaluation.evaluatePhase1Report,
    'function',
    'Missing Phase1 report evaluator',
  );
  return evaluation.evaluatePhase1Report(input);
}
function rejects(change) {
  const x = fresh();
  change(x);
  assert.throws(
    () => evaluate(x),
    (e) => e.code === 'PHASE1_EVALUATION_INPUT_INVALID',
  );
}
function ratio() {
  const x = fresh();
  x.requiredObligations[0].kind = 'RATIO';
  x.requiredObligations[0].metric = 'RECALL';
  x.observations[0].counts = { tp: 3, fp: 1, fn: 1 };
  return x;
}
function baseline(x, threshold = 0.75) {
  x.baselineRef = {
    id: 'synthetic-baseline',
    version: 1,
    digest: '8'.repeat(64),
    inputDigest: x.identity.inputDigest,
    expectedDigest: x.identity.expectedDigest,
    approval: { status: 'APPROVED', ref: 'fixture-only-approval' },
    thresholds: [{ obligationId: 'strict-structure', metric: 'RECALL', operator: '>=', threshold }],
  };
  return x;
}
test('independent literal report is exact and input unchanged', () => {
  const x = fresh();
  assert.deepEqual(evaluate(x), expected);
  assert.deepEqual(x, vector);
});
test('missing-required-obligation-is-not-pass', () => {
  const x = fresh();
  x.observations = [];
  const r = evaluate(x).payload;
  assert.equal(r.overall, 'NOT_EVALUABLE');
  assert.deepEqual(r.missing, ['strict-structure']);
});
test('empty-critical-inventory-is-invalid', () => rejects((x) => (x.requiredObligations = [])));
test('no declared critical obligation is invalid', () =>
  rejects((x) => (x.requiredObligations[0].critical = false)));
test('test-double-cannot-satisfy-actual-model', () => {
  const x = fresh();
  x.requiredObligations[0].executionKind = 'ACTUAL_MODEL';
  x.observations[0].executionKind = 'TEST_DOUBLE';
  assert.equal(evaluate(x).payload.gates[0].reason, 'EXECUTION_KIND_MISMATCH');
});
test('unapproved-baseline-is-not-evaluable', () => {
  const x = baseline(ratio());
  x.baselineRef.approval.status = 'PROPOSED';
  assert.equal(evaluate(x).payload.overall, 'NOT_EVALUABLE');
});
test('missing ratio baseline cannot pass', () =>
  assert.equal(evaluate(ratio()).payload.overall, 'NOT_EVALUABLE'));
test('synthetic approved ratio uses counts and exact threshold', () => {
  const r = evaluate(baseline(ratio())).payload;
  assert.equal(r.gates[0].observed, 0.75);
  assert.equal(r.overall, 'PASS');
});
test('ratio below synthetic threshold fails', () =>
  assert.equal(evaluate(baseline(ratio(), 0.8)).payload.overall, 'FAIL'));
test('zero denominator remains null', () => {
  const x = baseline(ratio());
  x.observations[0].counts = { tp: 0, fp: 0, fn: 0 };
  const r = evaluate(x).payload;
  assert.equal(r.overall, 'NOT_EVALUABLE');
  assert.equal(r.gates[0].observed, null);
  assert.equal(r.gates[0].reason, 'NO_EXPECTED_FACTS');
});
test('precision uses prediction denominator', () => {
  const x = ratio();
  x.requiredObligations[0].metric = 'PRECISION';
  baseline(x);
  x.baselineRef.thresholds[0].metric = 'PRECISION';
  x.observations[0].counts = { tp: 0, fp: 0, fn: 2 };
  assert.equal(evaluate(x).payload.gates[0].reason, 'NO_PREDICTIONS');
});
test('changed oracle cannot reuse baseline', () => {
  const x = baseline(ratio());
  x.baselineRef.expectedDigest = '9'.repeat(64);
  assert.equal(evaluate(x).payload.gates[0].reason, 'BASELINE_IDENTITY_MISMATCH');
});
test('observed input build and oracle identities must match', () => {
  for (const key of ['inputDigest', 'implementationDigest', 'oracleDigest']) {
    const x = fresh();
    x.observations[0][key] = '9'.repeat(64);
    assert.equal(evaluate(x).payload.overall, 'NOT_EVALUABLE');
  }
});
test('observed failure cannot hide behind missing baseline', () => {
  const x = ratio();
  x.observations[0].status = 'FAIL';
  assert.equal(evaluate(x).payload.overall, 'FAIL');
});
test('conditional exclusion is explicit not a pass', () => {
  const x = fresh();
  x.requiredObligations[0].applicability = {
    applicable: false,
    decisionRef: 'decision:disabled',
    reason: 'DISABLED',
  };
  x.observations = [];
  assert.equal(evaluate(x).payload.overall, 'NOT_APPLICABLE');
});
test('undeclared exclusion invalid', () =>
  rejects((x) => {
    x.requiredObligations[0].applicability.applicable = false;
    x.observations = [];
  }));
test('duplicate extra obligations and observations invalid', () => {
  rejects((x) => x.observations.push(structuredClone(x.observations[0])));
  rejects((x) => x.requiredObligations.push(structuredClone(x.requiredObligations[0])));
  rejects((x) => (x.observations[0].obligationId = 'extra'));
});
test('strict keys sparse arrays and unsafe sums refused', () => {
  rejects((x) => (x.rawSecret = 'NEVER_ECHO'));
  rejects((x) => delete x.observations[0]);
  const x = baseline(ratio());
  x.observations[0].counts.tp = Number.MAX_SAFE_INTEGER;
  assert.throws(
    () => evaluate(x),
    (e) => e.code === 'PHASE1_EVALUATION_INPUT_INVALID',
  );
});
test('actual evidence requires artifact and basis', () => {
  const x = fresh();
  x.requiredObligations[0].executionKind = x.observations[0].executionKind = 'ACTUAL_PRODUCT';
  assert.notEqual(evaluate(x).payload.overall, 'PASS');
  x.observations[0].basisRefs = [{ kind: 'COMPILATION_INPUT_SNAPSHOT', id: 'snapshot:one' }];
  assert.equal(evaluate(x).payload.overall, 'PASS');
  x.observations[0].actualArtifact = null;
  assert.notEqual(evaluate(x).payload.overall, 'PASS');
});
test('accessors refused before invocation and diagnostic redacted', () => {
  const x = fresh();
  let invoked = false;
  Object.defineProperty(x, 'rawSecret', {
    enumerable: true,
    get() {
      invoked = true;
      throw Error('SECRET');
    },
  });
  assert.throws(
    () => evaluate(x),
    (e) => e.code === 'PHASE1_EVALUATION_INPUT_INVALID' && !e.message.includes('SECRET'),
  );
  assert.equal(invoked, false);
});
test('subclass arrays and cycles invalid', () => {
  const x = fresh();
  x.observations = new (class extends Array {})();
  assert.throws(
    () => evaluate(x),
    (e) => e.code === 'PHASE1_EVALUATION_INPUT_INVALID',
  );
  rejects((x) => x.limitations.push(x));
});
test('Fixture discoverable by unchanged registry', async () => {
  const [f] = await evaluation.discoverFixtures(fileURLToPath(root));
  assert.equal(f.manifest.id, 'p1-report-contract-v1');
  assert.deepEqual(Object.keys(f.manifest.qualityGates), []);
});
