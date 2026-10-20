import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as api from '../dist/index.js';
import { openRepositoryCodeQuery } from '../../storage/dist/index.js';
import { withCodeQueryDatabase } from '../../storage/test/helpers/code-query-fixture.mjs';

const expected = JSON.parse(
  await readFile(
    new URL('../../../fixtures/queries/code-query/expected/results.json', import.meta.url),
    'utf8',
  ),
);
const budget = {
  maxNodes: 100,
  maxEdges: 100,
  maxMetadataRows: 10000,
  maxResultBytes: 1000000,
  timeoutMs: 10000,
};
async function run(t, query, scenario = 'current') {
  assert.equal(typeof api.executeCodeQuery, 'function', 'Missing public Application code queries');
  let result;
  await withCodeQueryDatabase(t, scenario, async (seed) => {
    const request = { repositoryId: seed.repositoryId, budget, ...query };
    const control = api.createQueryControl(request.budget);
    const port = await openRepositoryCodeQuery(seed.databasePath, seed.repositoryId, control);
    try {
      result = await api.executeCodeQuery(request, port, control);
    } finally {
      port.close();
    }
  });
  return result.payload;
}
test('symbol search preserves overloads without picking a target', async (t) => {
  const result = await run(t, { operation: 'SEARCH', name: 'run', match: 'exact' });
  assert.deepEqual(
    result.symbols.map((node) => node.id),
    expected.searchRun,
  );
  assert.deepEqual(
    result.warnings.filter((code) => expected.alwaysWarnings.includes(code)),
    expected.alwaysWarnings,
  );
});
test('understand returns exact incoming/outgoing and unchanged stored confidence', async (t) => {
  const result = await run(t, { operation: 'UNDERSTAND', symbolId: 'query-node-root' });
  assert.deepEqual(
    result.incoming.map((edge) => edge.id),
    expected.understandRootIncoming,
  );
  assert.deepEqual(
    result.outgoing.map((edge) => edge.id),
    expected.understandRootOutgoing,
  );
  assert.deepEqual(result.symbol.confidence, expected.singleSupportConfidence);
  assert.deepEqual(
    result.outgoing
      .find((edge) => edge.id === 'query-edge-06')
      .target.candidates.map((ref) => ref.id),
    expected.ambiguousCandidates,
  );
});
test('trace returns a bounded BFS graph, not execution order', async (t) => {
  const result = await run(t, {
    operation: 'CODE_TRACE',
    symbolId: 'query-node-root',
    maxDepth: 5,
  });
  assert.deepEqual(
    result.nodes.map(({ node, depth }) => ({ id: node.id, depth })),
    expected.traceRootNodes,
  );
  assert.deepEqual(
    result.edges.map((edge) => edge.id),
    expected.traceRootEdges,
  );
  assert.deepEqual(result.truncation, []);
  assert.ok(result.warnings.includes('INCOMPLETE_RESOLUTION'));
});
for (const [symbolId, truncation] of [
  ['query-node-root', ['DEPTH_LIMIT']],
  ['query-node-isolated', []],
]) {
  test(`depth zero reports actual omitted calls only for ${symbolId}`, async (t) => {
    const result = await run(t, { operation: 'CODE_TRACE', symbolId, maxDepth: 0 });
    assert.equal(result.nodes.length, 1);
    assert.deepEqual(result.edges, []);
    assert.deepEqual(result.truncation, truncation);
  });
}
test('node limit omits edge needing a target outside the returned graph', async (t) => {
  const result = await run(t, {
    operation: 'CODE_TRACE',
    symbolId: 'query-node-root',
    maxDepth: 5,
    budget: { ...budget, maxNodes: 2 },
  });
  assert.deepEqual(
    result.nodes.map(({ node }) => node.id),
    ['query-node-root', 'query-node-left'],
  );
  assert.deepEqual(
    result.edges.map((edge) => edge.id),
    ['query-edge-01'],
  );
  assert.deepEqual(result.truncation, ['NODE_LIMIT']);
});
test('edge limit is shared across BFS expansion', async (t) => {
  const result = await run(t, {
    operation: 'CODE_TRACE',
    symbolId: 'query-node-root',
    maxDepth: 5,
    budget: { ...budget, maxEdges: 2 },
  });
  assert.deepEqual(
    result.edges.map((edge) => edge.id),
    ['query-edge-01', 'query-edge-02'],
  );
  assert.deepEqual(result.truncation, ['EDGE_LIMIT']);
});
test('shared relation budget counts self-edge once', async (t) => {
  const result = await run(t, {
    operation: 'UNDERSTAND',
    symbolId: 'query-node-root',
    budget: { ...budget, maxEdges: 7 },
  });
  assert.deepEqual(
    result.incoming.map((edge) => edge.id),
    expected.understandRootIncoming,
  );
  assert.deepEqual(
    result.outgoing.map((edge) => edge.id),
    expected.understandRootOutgoing,
  );
  assert.deepEqual(result.truncation, []);
});
test('relation truncation preserves incoming-before-outgoing policy', async (t) => {
  const result = await run(t, {
    operation: 'UNDERSTAND',
    symbolId: 'query-node-root',
    budget: { ...budget, maxEdges: 1 },
  });
  assert.deepEqual(
    result.incoming.map((edge) => edge.id),
    ['query-edge-05'],
  );
  assert.deepEqual(result.outgoing, []);
  assert.deepEqual(result.truncation, ['INCOMING_LIMIT', 'OUTGOING_LIMIT']);
});
test('stale source is readable with scoped warning, not implicitly refreshed', async (t) => {
  const result = await run(t, { operation: 'GET_SYMBOL', symbolId: 'query-node-root' }, 'stale');
  assert.equal(result.freshness.state, 'STALE');
  assert.ok(result.warnings.includes('SOURCE_STALE'));
  assert.equal(result.indexedContentFingerprint, 'query-fingerprint-1');
});
test('two Provider supports retain old coverage without promoting the partial Provider', async (t) => {
  const result = await run(
    t,
    { operation: 'GET_SYMBOL', symbolId: 'query-node-root' },
    'multi-provider',
  );
  assert.equal(result.refs.evidence.length, 2);
  assert.deepEqual(result.symbol.confidence, expected.twoSupportConfidence);
  assert.ok(result.warnings.includes('PARTIAL_COVERAGE'));
  assert.ok(result.warnings.includes('COVERAGE_OBSERVATION_OLDER_THAN_ACTIVE'));
});
test('unknown symbol is a typed error, not empty success', async (t) => {
  await assert.rejects(
    run(t, { operation: 'GET_SYMBOL', symbolId: 'unknown' }),
    (error) => error.code === 'SYMBOL_NOT_FOUND',
  );
});
test('empty literal search still reports unknown coverage', async (t) => {
  const result = await run(t, { operation: 'SEARCH', name: 'absent', match: 'exact' });
  assert.deepEqual(result.symbols, []);
  assert.ok(result.warnings.includes('COVERAGE_UNKNOWN'));
});
