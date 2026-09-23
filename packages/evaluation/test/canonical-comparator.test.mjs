import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CanonicalComparatorError } from '../dist/comparator-error.js';
import { matchFacts, validateFactSet } from '../dist/comparator-match.js';

const confidence = { score: 1, method: 'fixture', reasons: [] };
const node = (id, factKey, name = 'A') => ({
  id,
  factKey,
  repositoryId: 'repo',
  revisionId: 'rev',
  kind: 'SYMBOL',
  symbolKind: 'METHOD',
  name,
  qualifiedName: null,
  sourceRange: null,
  confidence,
});
const ref = (id) => ({ factType: 'NODE', id });
const edge = (id, factKey) => ({
  id,
  factKey,
  repositoryId: 'repo',
  revisionId: 'rev',
  kind: 'CALL',
  source: ref('source'),
  target: { state: 'RESOLVED', resolution: 'EXACT', target: ref('target') },
  sourceRange: null,
  confidence,
});

function expectError(call, code, fieldPath) {
  assert.throws(call, (error) => {
    assert.ok(error instanceof CanonicalComparatorError);
    assert.equal(error.code, code);
    assert.equal(error.fieldPath, fieldPath);
    return true;
  });
}

test('FactKey pairing takes priority over the ID fallback', () => {
  const result = matchFacts(
    [node('e1', 'key-a'), node('e2', 'key-b')],
    [node('e2', 'key-a'), node('a2', 'key-b')],
  );
  assert.deepEqual(
    result.pairs.map(({ expected, actual, basis }) => [expected.factKey, actual.factKey, basis]),
    [
      ['key-a', 'key-a', 'FACT_KEY'],
      ['key-b', 'key-b', 'FACT_KEY'],
    ],
  );
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.extra, []);
});

test('ID fallback pairs remaining facts without guessing by name', () => {
  const result = matchFacts(
    [node('same', 'old-key'), node('missing', 'missing-key')],
    [node('same', 'new-key'), node('extra', 'extra-key')],
  );
  assert.deepEqual(
    result.pairs.map(({ basis }) => basis),
    ['ID'],
  );
  assert.deepEqual(
    result.missing.map(({ id }) => id),
    ['missing'],
  );
  assert.deepEqual(
    result.extra.map(({ id }) => id),
    ['extra'],
  );
});

test('node and edge cannot reuse a Canonical ID on one side', () => {
  expectError(
    () =>
      validateFactSet(
        { nodes: [node('same', 'node-key')], edges: [edge('same', 'edge-key')] },
        'actual',
      ),
    'DUPLICATE_ID',
    'actual.edges[0].id',
  );
});

test('duplicate node and edge FactKeys are rejected separately', () => {
  expectError(
    () => validateFactSet({ nodes: [node('a', 'key'), node('b', 'key')], edges: [] }, 'actual'),
    'DUPLICATE_FACT_KEY',
    'actual.nodes[1].factKey',
  );
  expectError(
    () => validateFactSet({ nodes: [], edges: [edge('a', 'key'), edge('b', 'key')] }, 'expected'),
    'DUPLICATE_FACT_KEY',
    'expected.edges[1].factKey',
  );
});

test('invalid IR and collection shapes carry the input field path', () => {
  expectError(
    () =>
      validateFactSet({ nodes: [{ ...node('a', 'key'), kind: 'UNKNOWN' }], edges: [] }, 'expected'),
    'INPUT_INVALID',
    'expected.nodes[0].kind',
  );
  expectError(
    () => validateFactSet({ nodes: {}, edges: [] }, 'actual'),
    'INPUT_INVALID',
    'actual.nodes',
  );
  expectError(
    () => validateFactSet({ nodes: [], edges: [], extra: true }, 'actual'),
    'INPUT_INVALID',
    'actual.extra',
  );
});

test('empty collections are valid and parsed facts do not alias input', () => {
  assert.deepEqual(validateFactSet({ nodes: [], edges: [] }, 'expected'), { nodes: [], edges: [] });
  const input = { nodes: [node('a', 'key')], edges: [] };
  const output = validateFactSet(input, 'actual');
  assert.deepEqual(output, input);
  assert.notStrictEqual(output, input);
  assert.notStrictEqual(output.nodes[0], input.nodes[0]);
  assert.notStrictEqual(output.nodes[0].confidence, input.nodes[0].confidence);
});
