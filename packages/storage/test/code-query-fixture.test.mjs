import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { discoverFixtures } from '../../evaluation/dist/index.js';

const helper = await import('./helpers/code-query-fixture.mjs').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
test('query Fixture is discoverable through the existing strict registry', async () => {
  const fixtures = await discoverFixtures(
    fileURLToPath(new URL('../../../fixtures/queries/code-query/', import.meta.url)),
  );
  assert.equal(fixtures.length, 1);
  assert.equal(fixtures[0].manifest.id, 'p05-code-query-cli-v1');
  assert.equal(fixtures[0].manifest.phase, '0.5');
  assert.equal(fixtures[0].manifest.category, 'code-intelligence');
});
test('query inputs and independent goldens retain their declared raw-byte hashes', async () => {
  const root = new URL('../../../fixtures/queries/code-query/', import.meta.url);
  const hashes = JSON.parse(await readFile(new URL('expected/hashes.json', root), 'utf8'));
  assert.equal(Object.keys(hashes).length, 6);
  for (const [path, hash] of Object.entries(hashes)) {
    assert.equal(
      createHash('sha256')
        .update(await readFile(new URL(path, root)))
        .digest('hex'),
      hash,
      path,
    );
  }
});

test('independent query fixture activates Canonical facts through Application and Store', async (t) => {
  assert.equal(
    typeof helper.withCodeQueryDatabase,
    'function',
    'Missing validated query fixture lifecycle',
  );
  await helper.withCodeQueryDatabase(t, 'current', async ({ databasePath }) => {
    const expected = JSON.parse(
      await readFile(
        new URL('../../../fixtures/queries/code-query/expected/graph.json', import.meta.url),
        'utf8',
      ),
    );
    const db = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const nodes = db
        .prepare('SELECT id, kind, name FROM canonical_nodes ORDER BY id')
        .all()
        .map((row) => ({ ...row }));
      const edges = db
        .prepare(
          'SELECT id, kind, source_node_id, target_state, resolution, target_node_id FROM canonical_edges ORDER BY id',
        )
        .all()
        .map((row) => ({ ...row }));
      assert.deepEqual(nodes, expected.nodes);
      assert.deepEqual(edges, expected.edges);
      assert.equal(
        db.prepare('SELECT indexed_content_fingerprint FROM repository_state').get()
          .indexed_content_fingerprint,
        'query-fingerprint-1',
      );
      assert.equal(
        db.prepare("SELECT count(*) AS n FROM evidence WHERE status='ACTIVE'").get().n,
        20,
      );
    } finally {
      db.close();
    }
  });
});
test('second Provider is added by validated patch and preserves old support provenance', async (t) => {
  assert.equal(
    typeof helper.withCodeQueryDatabase,
    'function',
    'Missing validated query fixture lifecycle',
  );
  await helper.withCodeQueryDatabase(t, 'multi-provider', async ({ databasePath }) => {
    const db = new DatabaseSync(databasePath, { readOnly: true });
    try {
      assert.equal(
        db.prepare("SELECT count(*) AS n FROM evidence WHERE status='ACTIVE'").get().n,
        40,
      );
      assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 2);
      assert.equal(
        db.prepare('SELECT indexed_content_fingerprint FROM repository_state').get()
          .indexed_content_fingerprint,
        'query-fingerprint-2',
      );
      const rows = db
        .prepare('SELECT requested_revision_fingerprint FROM provider_snapshots ORDER BY id')
        .all();
      assert.deepEqual(
        rows.map((row) => row.requested_revision_fingerprint),
        ['query-fingerprint-1', 'query-fingerprint-2'],
      );
    } finally {
      db.close();
    }
  });
});
