import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as runtime from '../dist/index.js';
import { withCodeQueryDatabase } from '../../storage/test/helpers/code-query-fixture.mjs';
const budget = {
  maxNodes: 100,
  maxEdges: 100,
  maxMetadataRows: 10000,
  maxResultBytes: 1000000,
  timeoutMs: 10000,
};
function run() {
  assert.equal(typeof runtime.runCodeQuery, 'function', 'Missing public Runtime query');
  return runtime.runCodeQuery;
}
test('Runtime exposes a complete read-only symbol use case', async (t) => {
  const query = run();
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId, symbolIds }) => {
    const result = await query({
      databasePath,
      query: { operation: 'UNDERSTAND', repositoryId, symbolId: symbolIds.root, budget },
    });
    assert.equal(result.schema, 'code-query-result');
    assert.equal(result.payload.symbol.name, 'root');
    assert.deepEqual(result.payload.freshness, {
      state: 'CURRENT',
      basis: 'PERSISTED_SOURCE',
      worktreeObservation: 'NOT_OBSERVED',
    });
  });
});
test('Runtime rejects invalid input before any database selection', async () => {
  await assert.rejects(
    run()({ databasePath: 'does-not-exist', query: {} }),
    (error) => error.code === 'INVALID_QUERY',
  );
});
test('Runtime maps missing graph to typed error and keeps last valid graph readable', async (t) => {
  const query = run();
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId, symbolIds }) => {
    await assert.rejects(
      query({
        databasePath,
        query: { operation: 'GET_SYMBOL', repositoryId, symbolId: 'missing', budget },
      }),
      (error) => error.code === 'SYMBOL_NOT_FOUND',
    );
    const result = await query({
      databasePath,
      query: { operation: 'GET_SYMBOL', repositoryId, symbolId: symbolIds.root, budget },
    });
    assert.equal(result.payload.symbol.id, symbolIds.root);
  });
});
test('Runtime cancellation refuses before database open', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    run()(
      {
        databasePath: 'does-not-exist',
        query: { operation: 'SEARCH', repositoryId: 'repo', name: 'run', match: 'exact', budget },
      },
      { signal: controller.signal },
    ),
    (error) => error.code === 'QUERY_CANCELLED',
  );
});
for (const corruption of ['missing-evidence', 'cross-context-evidence']) {
  test(`selected fact refuses ${corruption} even with another valid support`, async (t) => {
    const query = run();
    await withCodeQueryDatabase(
      t,
      'multi-provider',
      async ({ databasePath, repositoryId, symbolIds }) => {
        const { DatabaseSync } = await import('node:sqlite');
        const db = new DatabaseSync(databasePath);
        db.exec('PRAGMA foreign_keys=OFF');
        const evidence = db
          .prepare(
            'SELECT evidence_id FROM fact_evidence WHERE canonical_fact_id=? ORDER BY evidence_id LIMIT 1',
          )
          .get(symbolIds.root).evidence_id;
        if (corruption === 'missing-evidence')
          db.prepare('DELETE FROM evidence WHERE id=?').run(evidence);
        else
          db.prepare('UPDATE evidence SET repository_id=? WHERE id=?').run(
            'other-repository',
            evidence,
          );
        db.close();
        await assert.rejects(
          query({
            databasePath,
            query: { operation: 'GET_SYMBOL', repositoryId, symbolId: symbolIds.root, budget },
          }),
          (error) => error.code === 'QUERY_DATA_INVALID',
        );
      },
    );
  });
}
