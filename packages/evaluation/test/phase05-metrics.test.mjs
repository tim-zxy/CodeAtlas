import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as evaluation from '../dist/index.js';

const vectors = JSON.parse(
  await readFile(
    new URL(
      '../../../fixtures/evaluation/phase05-code-intelligence/inputs/source-binding.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const bindings = JSON.parse(
  await readFile(
    new URL(
      '../../../fixtures/evaluation/phase05-code-intelligence/expected/source-binding.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const metrics = JSON.parse(
  await readFile(
    new URL(
      '../../../fixtures/evaluation/phase05-code-intelligence/inputs/metric-vectors.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const goldenMetrics = JSON.parse(
  await readFile(
    new URL(
      '../../../fixtures/evaluation/phase05-code-intelligence/expected/metric-vectors.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
function evaluate(input) {
  assert.equal(typeof evaluation.evaluatePhase05Facts, 'function', 'Missing scoped fact metrics');
  return evaluation.evaluatePhase05Facts(input);
}
const metricInput = () => structuredClone(metrics[0].input);
test('phase05 scoped facts use independent wrong-target golden', () => {
  const input = metricInput();
  const before = structuredClone(input);
  const result = evaluate(input);
  assert.deepEqual(result.symbol, goldenMetrics['wrong-direct-target'].symbol);
  assert.deepEqual(result.directCall, goldenMetrics['wrong-direct-target'].directCall);
  assert.deepEqual(input, before);
  assert.deepEqual(result.criticalFailures, [
    { type: 'EDGE', factKey: 'call-key', classification: 'CHANGED' },
  ]);
});
test('phase05 scoped facts count extra resolved direct calls as false positives', () => {
  const input = metricInput();
  input.actual.edges = [
    structuredClone(input.expected.edges[0]),
    { ...structuredClone(input.expected.edges[0]), id: 'extra-call', factKey: 'extra-call-key' },
  ];
  assert.deepEqual(evaluate(input).directCall, { tp: 1, fp: 1, fn: 0, precision: 0.5, recall: 1 });
});

test('phase05 scoped facts keep comparator identity matching without rewriting payloads', () => {
  const input = metricInput();
  input.actual.nodes[0].id = 'actual-symbol';
  input.actual.edges[0].id = 'actual-call';
  input.actual.edges[0].source.id = 'actual-symbol';
  input.actual.edges[0].target.target.id = 'actual-symbol';
  const result = evaluate(input);
  assert.deepEqual(result.directCall, { tp: 1, fp: 0, fn: 0, precision: 1, recall: 1 });
  assert.deepEqual(result.symbol, { tp: 1, fp: 0, fn: 0, recall: 1 });
  assert.deepEqual(result.criticalFailures, []);
});

test('phase05 scoped facts count correct but undeclared resolved calls as predictions', () => {
  const input = metricInput();
  input.expected.edges.push({
    ...structuredClone(input.expected.edges[0]),
    id: 'noncritical-call',
    factKey: 'noncritical-key',
  });
  input.actual = structuredClone(input.expected);
  const result = evaluate(input);
  assert.deepEqual(result.directCall, { tp: 1, fp: 1, fn: 0, precision: 0.5, recall: 1 });
});

for (const field of ['revisionId', 'source', 'confidence'])
  test(`phase05 scoped facts retain changed call ${field}`, () => {
    const input = metricInput();
    input.actual = structuredClone(input.expected);
    input.actual.edges[0][field] =
      field === 'revisionId'
        ? 'other-revision'
        : field === 'source'
          ? { factType: 'NODE', id: 'other-symbol' }
          : { score: 0.5, method: 'fixture', reasons: [] };
    assert.deepEqual(evaluate(input).directCall, { tp: 0, fp: 1, fn: 1, precision: 0, recall: 0 });
  });

test('phase05 scoped facts refuse a declared critical call that is not expected resolved', () => {
  const input = metricInput();
  input.expected.edges[0].target = {
    state: 'UNRESOLVED',
    resolution: 'UNSUPPORTED',
    originalHint: 'run',
    candidates: [],
  };
  assert.throws(() => evaluate(input), /Invalid Phase0.5 critical scope/);
});

test('phase05 scoped facts refuse duplicated graph facts even outside critical scope', () => {
  const input = metricInput();
  input.criticalSymbols = [];
  input.criticalDirectCalls = [];
  input.actual.edges.push(structuredClone(input.actual.edges[0]));
  assert.throws(
    () => evaluate(input),
    (error) => error.code === 'DUPLICATE_ID',
  );
});
test('phase05 scoped facts count a missing critical symbol', () => {
  const input = metricInput();
  input.actual = { nodes: [], edges: [] };
  const result = evaluate(input);
  assert.deepEqual(result.symbol, { tp: 0, fp: 0, fn: 1, recall: 0 });
  assert.deepEqual(result.directCall, { tp: 0, fp: 0, fn: 1, precision: null, recall: 0 });
});
test('phase05 scoped facts leave empty denominators null', () => {
  const result = evaluate({
    expected: { nodes: [], edges: [] },
    actual: { nodes: [], edges: [] },
    criticalSymbols: [],
    criticalDirectCalls: [],
  });
  assert.deepEqual(result.symbol, { tp: 0, fp: 0, fn: 0, recall: null });
  assert.deepEqual(result.directCall, { tp: 0, fp: 0, fn: 0, precision: null, recall: null });
});
for (const resolution of ['UNRESOLVED', 'AMBIGUOUS', 'UNSUPPORTED'])
  test(`phase05 scoped facts retain missing resolved prediction for ${resolution}`, () => {
    const input = metricInput();
    input.actual.edges[0].target = {
      state: 'UNRESOLVED',
      resolution,
      originalHint: 'run',
      candidates:
        resolution === 'AMBIGUOUS'
          ? [
              { factType: 'NODE', id: 'symbol' },
              { factType: 'NODE', id: 'other-symbol' },
            ]
          : [],
    };
    assert.deepEqual(evaluate(input).directCall, {
      tp: 0,
      fp: 0,
      fn: 1,
      precision: null,
      recall: 0,
    });
  });
for (const field of ['criticalSymbols', 'criticalDirectCalls']) {
  for (const defect of ['duplicate', 'unknown', 'wrong-kind'])
    test(`phase05 scoped facts refuse ${field} ${defect}`, () => {
      const input = metricInput();
      if (defect === 'duplicate') input[field].push(input[field][0]);
      else if (defect === 'unknown') input[field] = ['unknown'];
      else if (field === 'criticalSymbols')
        ((input.expected.nodes[0] = { ...input.expected.nodes[0], kind: 'MODULE' }),
          delete input.expected.nodes[0].symbolKind);
      else input.expected.edges[0].kind = 'REFERENCE';
      assert.throws(() => evaluate(input), /Invalid Phase0.5 critical scope/);
    });
}
test('phase05 scoped facts validate even unscoped malformed graph facts', () => {
  assert.equal(typeof evaluation.evaluatePhase05Facts, 'function');
  const input = metricInput();
  input.criticalSymbols = [];
  input.criticalDirectCalls = [];
  input.actual.nodes[0].unexpected = true;
  assert.throws(() => evaluate(input));
});
const bind = (...args) => {
  assert.equal(
    typeof evaluation.bindPhase05SourceIdentity,
    'function',
    'Missing Phase0.5 Source binding',
  );
  return evaluation.bindPhase05SourceIdentity(...args);
};
test('phase05 Source binding aligns only opaque file IDs after exact inventory proof', () => {
  const before = structuredClone(vectors);
  assert.deepEqual([...bind(vectors.expected, vectors.actual)], bindings);
  assert.deepEqual(vectors, before);
  assert.deepEqual([...bind([], [])], []);
});

test('phase05 Source binding matches reordered inventories rather than array positions', () => {
  const left = [
    ...vectors.expected,
    { ...vectors.expected[0], id: 'expected-other', path: 'src/Other.java' },
  ];
  const right = [
    { ...vectors.actual[0], id: 'actual-other', path: 'src/Other.java' },
    ...vectors.actual,
  ];
  assert.deepEqual([...bind(left, right)], [...bindings, ['expected-other', 'actual-other']]);
});

test('phase05 Source binding refuses matching duplicated inventories, not only size mismatches', () => {
  for (const defect of ['id', 'path']) {
    const input = structuredClone(vectors);
    for (const side of ['expected', 'actual']) {
      input[side].push({
        ...input[side][0],
        ...(defect === 'id' ? { path: 'src/Other.java' } : { id: side + '-other' }),
      });
    }
    assert.throws(() => bind(input.expected, input.actual), /Source inventory mismatch/);
  }
});
for (const [field, value] of [
  ['repositoryId', 'another-repo'],
  ['revisionId', 'another-revision'],
  ['path', 'src/Other.java'],
  ['contentFingerprint', 'sha256:' + '2'.repeat(64)],
  ['languageHint', null],
  ['sensitivity', 'PUBLIC'],
  ['classification', { role: 'TEST', provenance: 'AUTHORED', contentKind: 'TEXT' }],
])
  test(`phase05 Source binding refuses changed ${field}`, () => {
    const actual = structuredClone(vectors.actual);
    actual[0][field] = value;
    assert.throws(() => bind(vectors.expected, actual), /Source inventory mismatch/);
  });
for (const side of ['expected', 'actual']) {
  for (const defect of ['duplicate-path', 'duplicate-id', 'missing', 'extra']) {
    test(`phase05 Source binding refuses ${side} ${defect}`, () => {
      const input = structuredClone(vectors);
      if (defect === 'missing') input[side] = [];
      else {
        const duplicate = { ...input[side][0] };
        if (defect === 'duplicate-path') duplicate.id += '-other';
        if (defect === 'duplicate-id' || defect === 'extra') duplicate.path = 'src/Other.java';
        if (defect === 'extra') duplicate.id += '-other';
        input[side].push(duplicate);
      }
      assert.throws(() => bind(input.expected, input.actual), /Source inventory mismatch/);
    });
  }
}
