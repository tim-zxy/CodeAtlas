import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CanonicalComparatorError } from '../dist/comparator-error.js';
import { matchFacts, validateFactSet } from '../dist/comparator-match.js';
import { compareCanonicalFacts, discoverFixtures } from '../dist/index.js';

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

test('sparse node and edge arrays report their missing slot on either side', () => {
  for (const side of ['expected', 'actual']) {
    for (const collection of ['nodes', 'edges']) {
      const input = {
        expected: facts(),
        actual: facts(),
      };
      input[side] = { ...input[side], [collection]: new Array(1) };
      expectError(() => compareCanonicalFacts(input), 'INPUT_INVALID', `${side}.${collection}[0]`);
    }
  }
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

const resolved = (id, resolution = 'EXACT') => ({
  state: 'RESOLVED',
  resolution,
  target: ref(id),
});
const unresolved = (candidateIds = [], resolution = 'UNRESOLVED') => ({
  state: 'UNRESOLVED',
  resolution,
  originalHint: 'B',
  candidates: candidateIds.map(ref),
});
const callEdge = (id, factKey, source, target) => ({
  ...edge(id, factKey),
  source: ref(source),
  target,
});
const facts = (nodes = [], edges = []) => ({ nodes, edges });

test('equal FactKeys with different opaque IDs are unchanged pairs', () => {
  const result = compareCanonicalFacts({
    expected: facts([node('e', 'key')]),
    actual: facts([node('a', 'key')]),
  });
  assert.deepEqual(result.entries, [
    {
      factType: 'NODE',
      expected: { id: 'e', factKey: 'key' },
      actual: { id: 'a', factKey: 'key' },
      matchBasis: 'FACT_KEY',
      classification: null,
      differences: [],
    },
  ]);
});

test('ID fallback reports changed FactKey as one semantic difference', () => {
  const result = compareCanonicalFacts({
    expected: facts([node('same', 'old-key')]),
    actual: facts([node('same', 'new-key')]),
  });
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].matchBasis, 'ID');
  assert.deepEqual(result.entries[0].differences, [
    { kind: 'SEMANTIC_DIFFERENCE', path: 'factKey', expected: 'old-key', actual: 'new-key' },
  ]);
});

test('unpaired expected and actual nodes are missing and extra', () => {
  const result = compareCanonicalFacts({
    expected: facts([node('e', 'key-a')]),
    actual: facts([node('a', 'key-b')]),
  });
  assert.deepEqual(
    result.entries.map(({ classification }) => classification),
    ['MISSING', 'EXTRA'],
  );
  assert.deepEqual(
    result.entries.map(({ matchBasis }) => matchBasis),
    [null, null],
  );
});

test('node name and confidence leaf changes are semantic', () => {
  const result = compareCanonicalFacts({
    expected: facts([node('e', 'key')]),
    actual: facts([{ ...node('a', 'key', 'Changed'), confidence: { ...confidence, score: 0.5 } }]),
  });
  assert.deepEqual(result.entries[0].differences, [
    { kind: 'SEMANTIC_DIFFERENCE', path: 'confidence.score', expected: 1, actual: 0.5 },
    { kind: 'SEMANTIC_DIFFERENCE', path: 'name', expected: 'A', actual: 'Changed' },
  ]);
});

test('paired node IDs normalize edge references without changing resolution', () => {
  const expected = facts(
    [node('e-a', 'a'), node('e-b', 'b')],
    [callEdge('e-edge', 'call', 'e-a', resolved('e-b'))],
  );
  const actual = facts(
    [node('a-a', 'a'), node('a-b', 'b')],
    [callEdge('a-edge', 'call', 'a-a', resolved('a-b'))],
  );
  assert.ok(
    compareCanonicalFacts({ expected, actual }).entries.every(
      (entry) => entry.classification === null && entry.differences.length === 0,
    ),
  );
});

test('paired node identity takes precedence when literal IDs are swapped', () => {
  const expectedNodes = [node('1', 'a'), node('2', 'b')];
  const actualNodes = [node('2', 'a'), node('1', 'b')];
  const resolvedResult = compareCanonicalFacts({
    expected: facts(expectedNodes, [callEdge('e', 'call', '1', resolved('2'))]),
    actual: facts(actualNodes, [callEdge('a', 'call', '1', resolved('2'))]),
  });
  assert.deepEqual(
    resolvedResult.entries
      .find(({ factType }) => factType === 'EDGE')
      .differences.map(({ path }) => path),
    ['source.id', 'target.target.id'],
  );

  const candidateResult = compareCanonicalFacts({
    expected: facts(expectedNodes, [
      callEdge('e', 'call', '1', unresolved(['2', '1'], 'AMBIGUOUS')),
    ]),
    actual: facts(actualNodes, [callEdge('a', 'call', '1', unresolved(['2', '1'], 'AMBIGUOUS'))]),
  });
  assert.deepEqual(
    candidateResult.entries
      .find(({ factType }) => factType === 'EDGE')
      .differences.map(({ path }) => path),
    ['source.id', 'target.candidates[0].id', 'target.candidates[1].id'],
  );
});

test('a dangling expected ID is not equal to an actual paired-node ID', () => {
  const result = compareCanonicalFacts({
    expected: facts([node('old', 'a')], [callEdge('e', 'call', 'new', resolved('new'))]),
    actual: facts([node('new', 'a')], [callEdge('a', 'call', 'new', resolved('new'))]),
  });
  assert.deepEqual(
    result.entries.find(({ factType }) => factType === 'EDGE').differences.map(({ path }) => path),
    ['source.id', 'target.target.id'],
  );
});

test('target state, level, and candidate order are resolution differences', () => {
  const changedState = compareCanonicalFacts({
    expected: facts([], [callEdge('e', 'call', 'source', resolved('target'))]),
    actual: facts([], [callEdge('a', 'call', 'source', unresolved())]),
  });
  assert.deepEqual(
    changedState.entries[0].differences.map(({ path }) => path),
    ['target.resolution', 'target.state'],
  );
  const changedLevel = compareCanonicalFacts({
    expected: facts([], [callEdge('e', 'call', 'source', resolved('target'))]),
    actual: facts([], [callEdge('a', 'call', 'source', resolved('target', 'HEURISTIC'))]),
  });
  assert.deepEqual(
    changedLevel.entries[0].differences.map(({ path }) => path),
    ['target.resolution'],
  );
  const reordered = compareCanonicalFacts({
    expected: facts([], [callEdge('e', 'call', 'source', unresolved(['x', 'y'], 'AMBIGUOUS'))]),
    actual: facts([], [callEdge('a', 'call', 'source', unresolved(['y', 'x'], 'AMBIGUOUS'))]),
  });
  assert.deepEqual(
    reordered.entries[0].differences.map(({ path }) => path),
    ['target.candidates[0].id', 'target.candidates[1].id'],
  );
});

test('one edge can carry semantic and resolution differences without a second pair', () => {
  const result = compareCanonicalFacts({
    expected: facts([], [callEdge('e', 'call', 'first', resolved('target'))]),
    actual: facts([], [callEdge('a', 'call', 'second', unresolved())]),
  });
  assert.equal(result.entries.length, 1);
  assert.deepEqual(
    result.entries[0].differences.map(({ kind }) => kind),
    ['SEMANTIC_DIFFERENCE', 'RESOLUTION_DIFFERENCE', 'RESOLUTION_DIFFERENCE'],
  );
  assert.equal(result.entries[0].differences[0].path, 'source.id');
});

test('different dangling references differ while identical dangling references match', () => {
  const expected = facts([], [callEdge('e', 'call', 'dangling', resolved('dangling'))]);
  const same = facts([], [callEdge('a', 'call', 'dangling', resolved('dangling'))]);
  const changed = facts([], [callEdge('a', 'call', 'other', resolved('other'))]);
  assert.deepEqual(compareCanonicalFacts({ expected, actual: same }).entries[0].differences, []);
  assert.deepEqual(
    compareCanonicalFacts({ expected, actual: changed }).entries[0].differences.map(
      ({ path }) => path,
    ),
    ['source.id', 'target.target.id'],
  );
});

test('permutations produce byte-identical results and do not mutate inputs', () => {
  const expected = facts(
    [node('e-z', 'z'), node('e-a', 'a')],
    [callEdge('e2', 'edge-z', 'e-z', resolved('e-a'))],
  );
  const actual = facts(
    [node('a-x', 'x'), node('a-a', 'a')],
    [callEdge('a2', 'edge-z', 'a-x', resolved('a-a'))],
  );
  const before = JSON.stringify({ expected, actual });
  const first = JSON.stringify(compareCanonicalFacts({ expected, actual }));
  const second = JSON.stringify(
    compareCanonicalFacts({
      expected: facts([...expected.nodes].reverse(), [...expected.edges].reverse()),
      actual: facts([...actual.nodes].reverse(), [...actual.edges].reverse()),
    }),
  );
  assert.equal(second, first);
  assert.equal(JSON.stringify({ expected, actual }), before);
});

test('declared comparator Fixture proves all four Phase 0 classes', async () => {
  const root = fileURLToPath(new URL('../../../fixtures/evaluation/', import.meta.url));
  const fixtures = await discoverFixtures(root);
  const fixture = fixtures.find(({ manifest }) => manifest.id === 'p0-canonical-comparator-v1');
  assert.ok(fixture, 'p0-canonical-comparator-v1 must be registered');
  const expected = JSON.parse(await readFile(fixture.expected.canonical, 'utf8'));
  const actual = JSON.parse(await readFile(fixture.inputs.actual, 'utf8'));
  const result = compareCanonicalFacts({ expected, actual });
  const classifications = result.entries.flatMap((entry) => [
    ...(entry.classification === null ? [] : [entry.classification]),
    ...entry.differences.map(({ kind }) => kind),
  ]);
  assert.deepEqual([...new Set(classifications)].sort(), [
    'EXTRA',
    'MISSING',
    'RESOLUTION_DIFFERENCE',
    'SEMANTIC_DIFFERENCE',
  ]);
  assert.deepEqual(
    result.entries.map(({ expected, actual, classification, differences }) => [
      expected?.factKey ?? null,
      actual?.factKey ?? null,
      classification,
      differences.map(({ path }) => path),
    ]),
    [
      ['key-a', 'key-a', null, ['name']],
      ['key-b', null, 'MISSING', []],
      [null, 'key-c', 'EXTRA', []],
      ['key-call', 'key-call', null, ['target.resolution', 'target.state']],
    ],
  );
});
