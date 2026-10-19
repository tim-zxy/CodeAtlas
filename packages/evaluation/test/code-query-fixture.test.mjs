import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { discoverFixtures } from '../dist/index.js';
import { runCodeQuery } from '../../runtime/dist/index.js';
import { withCodeQueryDatabase } from '../../storage/test/helpers/code-query-fixture.mjs';

test('registered query Fixture independently evaluates public Runtime trace', async (t) => {
  const root = new URL('../../../fixtures/queries/code-query/', import.meta.url);
  const fixtures = await discoverFixtures(fileURLToPath(root));
  assert.equal(fixtures[0].manifest.id, 'p05-code-query-cli-v1');
  const expected = JSON.parse(await readFile(fixtures[0].expected.results, 'utf8'));
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId, symbolIds }) => {
    const envelope = await runCodeQuery({
      databasePath,
      query: {
        operation: 'CODE_TRACE',
        repositoryId,
        symbolId: symbolIds.root,
        maxDepth: 5,
        budget: {
          maxNodes: 100,
          maxEdges: 100,
          maxMetadataRows: 10000,
          maxResultBytes: 1000000,
          timeoutMs: 10000,
        },
      },
    });
    assert.deepEqual(
      envelope.payload.nodes.map(({ node, depth }) => ({ id: node.id, depth })),
      expected.traceRootNodes,
    );
    assert.deepEqual(
      envelope.payload.edges.map((edge) => edge.id),
      expected.traceRootEdges,
    );
    assert.ok(
      envelope.payload.refs.evidence.length >=
        envelope.payload.nodes.length + envelope.payload.edges.length,
    );
  });
});
