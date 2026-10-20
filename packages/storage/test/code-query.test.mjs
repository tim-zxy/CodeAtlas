import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import * as storage from '../dist/index.js';
import { createQueryControl } from '../../application/dist/index.js';
import { applyAnalysisPatch } from '../../application/dist/index.js';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { withCodeQueryDatabase } from './helpers/code-query-fixture.mjs';

const budget = {
  maxNodes: 100,
  maxEdges: 100,
  maxMetadataRows: 10000,
  maxResultBytes: 1000000,
  timeoutMs: 10000,
};
function opener() {
  assert.equal(
    typeof storage.openRepositoryCodeQuery,
    'function',
    'Missing read-only Storage query',
  );
  return storage.openRepositoryCodeQuery;
}
async function collect(iterator) {
  const rows = [];
  for await (const row of iterator) rows.push(row);
  return rows;
}
async function withSession(t, scenario, body) {
  const open = opener();
  await withCodeQueryDatabase(t, scenario, async (seed) => {
    const session = await open(seed.databasePath, seed.repositoryId, createQueryControl(budget));
    try {
      await body(session, seed);
    } finally {
      session.close();
    }
  });
}
test('reads exact symbol, overloads and resolved-only incoming relationships', async (t) => {
  await withSession(t, 'current', async (session, seed) => {
    const node = await session.readNode(seed.symbolIds.root);
    assert.equal(node.name, 'root');
    assert.deepEqual(node.confidence, { score: 1, method: 'fixture-observation', reasons: [] });
    assert.equal(await session.readNode('wrong-id'), null);
    assert.deepEqual(
      (await collect(session.findNodes('run', 'exact'))).map((node) => node.id),
      ['query-node-run-0', 'query-node-run-1'],
    );
    assert.deepEqual(
      (await collect(session.findNodes('RUN', 'exact'))).map((node) => node.id),
      [],
    );
    assert.deepEqual(
      (await collect(session.findNodes('%', 'prefix'))).map((node) => node.id),
      [],
    );
    assert.deepEqual(
      (await collect(session.readEdges(seed.symbolIds.root, 'INCOMING', null))).map(
        (edge) => edge.id,
      ),
      ['query-edge-05', 'query-edge-08'],
    );
    assert.deepEqual(
      await collect(session.readEdges(seed.symbolIds['run-0'], 'INCOMING', 'CALL')),
      [],
    );
    assert.equal(await session.hasOutgoingCall(seed.symbolIds.isolated), false);
    assert.equal(await session.hasOutgoingCall(seed.symbolIds.root), true);
  });
});
test('preserves all edge kinds and ordered ambiguous candidates', async (t) => {
  await withSession(t, 'current', async (session, seed) => {
    const rootEdges = await collect(session.readEdges(seed.symbolIds.root, 'OUTGOING', null));
    assert.deepEqual(
      rootEdges.find((edge) => edge.id === 'query-edge-06').target.candidates.map((ref) => ref.id),
      ['query-node-run-1', 'query-node-run-0'],
    );
    const override = await collect(session.readEdges(seed.symbolIds['run-1'], 'OUTGOING', null));
    assert.equal(override[0].kind, 'OVERRIDE');
    assert.deepEqual(
      (await collect(session.readEdges(seed.symbolIds.type, 'OUTGOING', null))).map(
        (edge) => edge.kind,
      ),
      ['IMPORT', 'INHERITANCE'],
    );
  });
});
test('exposes support snapshots, source refs and qualitative coverage only', async (t) => {
  await withSession(t, 'current', async (session, seed) => {
    const metadata = await collect(
      session.readMetadata({ factType: 'NODE', id: seed.symbolIds.root }),
    );
    assert.equal(metadata.filter((row) => row.kind === 'SUPPORT').length, 1);
    assert.equal(metadata.find((row) => row.kind === 'SOURCE').sourceFile.path, 'QueryGraph.java');
    assert.ok(
      metadata.some(
        (row) =>
          row.kind === 'COVERAGE' && row.capability === 'CALL' && row.fileCoverage === 'COMPLETE',
      ),
    );
    assert.deepEqual(session.context.freshness, {
      state: 'CURRENT',
      basis: 'PERSISTED_SOURCE',
      worktreeObservation: 'NOT_OBSERVED',
    });
  });
});
test('old active support retains snapshot fingerprint after second Provider patch', async (t) => {
  await withSession(t, 'multi-provider', async (session, seed) => {
    const metadata = await collect(
      session.readMetadata({ factType: 'NODE', id: seed.symbolIds.root }),
    );
    assert.deepEqual(
      metadata
        .filter((row) => row.kind === 'SUPPORT')
        .map((row) => row.snapshot.requestedRevisionFingerprint),
      ['query-fingerprint-1', 'query-fingerprint-2'],
    );
    assert.equal(
      (await session.readNode(seed.symbolIds.root)).confidence.method,
      'fact-merger-min-v1',
    );
  });
});
test('stale persisted source is not promoted by the same WORKTREE ID', async (t) => {
  await withSession(t, 'stale', async (session) =>
    assert.equal(session.context.freshness.state, 'STALE'),
  );
});
for (const [scenario, repositoryId, code] of [
  ['not-indexed', 'query-repository', 'NOT_INDEXED'],
  ['current', 'other-repository', 'REPOSITORY_NOT_FOUND'],
]) {
  test(`refuses ${code} instead of empty success`, async (t) => {
    const open = opener();
    await withCodeQueryDatabase(t, scenario, async ({ databasePath }) => {
      await assert.rejects(
        open(databasePath, repositoryId, createQueryControl(budget)),
        (error) => error.code === code,
      );
    });
  });
}
test('missing database is not created', async (t) => {
  const open = opener();
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId }) => {
    const missing = databasePath + '.missing';
    await assert.rejects(
      open(missing, repositoryId, createQueryControl(budget)),
      (error) => error.code === 'DATABASE_UNAVAILABLE',
    );
    await assert.rejects(access(missing));
  });
});
test('large persisted JSON refuses before materialization and graph state survives', async (t) => {
  const open = opener();
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId, symbolIds }) => {
    const writer = new DatabaseSync(databasePath);
    // Explicitly owned negative-control copy, not a canonical publication workflow.
    writer
      .prepare('UPDATE canonical_nodes SET confidence_reasons_json=? WHERE id=?')
      .run(JSON.stringify(['😀'.repeat(1000)]), symbolIds.root);
    writer.close();
    const session = await open(
      databasePath,
      repositoryId,
      createQueryControl({ ...budget, maxResultBytes: 500 }),
    );
    try {
      await assert.rejects(
        session.readNode(symbolIds.root),
        (error) => error.code === 'QUERY_BUDGET_EXCEEDED',
      );
    } finally {
      session.close();
    }
    const db = new DatabaseSync(databasePath, { readOnly: true });
    try {
      assert.equal(
        JSON.parse(
          db
            .prepare('SELECT confidence_reasons_json FROM canonical_nodes WHERE id=?')
            .get(symbolIds.root).confidence_reasons_json,
        )[0].length,
        2000,
      );
    } finally {
      db.close();
    }
  });
});
test('metadata overflow never produces a partial metadata collection', async (t) => {
  const open = opener();
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId, symbolIds }) => {
    const session = await open(
      databasePath,
      repositoryId,
      createQueryControl({ ...budget, maxMetadataRows: 1 }),
    );
    try {
      await assert.rejects(
        collect(session.readMetadata({ factType: 'NODE', id: symbolIds.root })),
        (error) => error.code === 'QUERY_BUDGET_EXCEEDED',
      );
    } finally {
      session.close();
    }
  });
});
test('query leaves existing database bytes unchanged in settled DELETE mode', async (t) => {
  const open = opener();
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId, symbolIds }) => {
    const before = await readFile(databasePath);
    const session = await open(databasePath, repositoryId, createQueryControl(budget));
    await session.readNode(symbolIds.root);
    await collect(session.readMetadata({ factType: 'NODE', id: symbolIds.root }));
    session.close();
    session.close();
    assert.deepEqual(await readFile(databasePath), before);
  });
});
for (const [version, code] of [
  [7, 'DATABASE_UPGRADE_REQUIRED'],
  [999, 'DATABASE_TOO_NEW'],
]) {
  test(`refuses database version ${version} without implicit upgrade`, async (t) => {
    const open = opener();
    await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId }) => {
      const db = new DatabaseSync(databasePath);
      db.exec(`PRAGMA user_version=${version}`);
      db.close();
      await assert.rejects(
        open(databasePath, repositoryId, createQueryControl(budget)),
        (error) => error.code === code,
      );
      const check = new DatabaseSync(databasePath, { readOnly: true });
      try {
        assert.equal(check.prepare('PRAGMA user_version').get().user_version, version);
      } finally {
        check.close();
      }
    });
  });
}
test('legacy null fingerprint is UNKNOWN, never current', async (t) => {
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId, symbolIds }) => {
    const db = new DatabaseSync(databasePath);
    // Owned migrated-legacy state characterization, not valid publication.
    db.exec('UPDATE repository_state SET indexed_content_fingerprint=NULL');
    db.close();
    const session = await opener()(databasePath, repositoryId, createQueryControl(budget));
    try {
      assert.equal(session.context.freshness.state, 'UNKNOWN');
      assert.equal((await session.readNode(symbolIds.root)).name, 'root');
    } finally {
      session.close();
    }
  });
});
test('missing graph columns are rejected despite matching user_version', async (t) => {
  const open = opener();
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId }) => {
    const db = new DatabaseSync(databasePath);
    db.exec('DROP TABLE analysis_coverage');
    db.close();
    await assert.rejects(
      open(databasePath, repositoryId, createQueryControl(budget)),
      (error) => error.code === 'QUERY_DATA_INVALID',
    );
  });
});
test('spoofed workspace database is rejected before repository reads', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-query-kind-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'workspace.sqlite');
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE workspace(id TEXT); PRAGMA user_version=10');
  db.close();
  await assert.rejects(
    opener()(path, 'repo', createQueryControl(budget)),
    (error) => error.code === 'DATABASE_KIND_MISMATCH',
  );
});
test('existing symlink locator selects the existing file and creates nothing else', async (t) => {
  const open = opener();
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId, symbolIds }) => {
    const alias = databasePath + '.alias';
    const windows = process.platform === 'win32';
    await symlink(
      windows ? dirname(databasePath) : databasePath,
      alias,
      windows ? 'junction' : 'file',
    );
    const session = await open(
      windows ? join(alias, basename(databasePath)) : alias,
      repositoryId,
      createQueryControl(budget),
    );
    try {
      assert.equal((await session.readNode(symbolIds.root)).name, 'root');
    } finally {
      session.close();
    }
  });
});
test('cancelled read refuses after opener and closed session cannot resume', async (t) => {
  const open = opener();
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId, symbolIds }) => {
    const controller = new AbortController();
    const session = await open(
      databasePath,
      repositoryId,
      createQueryControl(budget, controller.signal),
    );
    controller.abort();
    await assert.rejects(
      session.readNode(symbolIds.root),
      (error) => error.code === 'QUERY_CANCELLED',
    );
    session.close();
    await assert.rejects(
      session.readNode(symbolIds.root),
      (error) => error.code === 'QUERY_DATA_INVALID',
    );
  });
});
test('WAL activation between yielded reads remains one old snapshot', async (t) => {
  const open = opener();
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId, symbolIds }) => {
    const writer = new DatabaseSync(databasePath);
    writer.exec('PRAGMA journal_mode=WAL');
    const session = await open(databasePath, repositoryId, createQueryControl(budget));
    try {
      assert.equal((await session.readNode(symbolIds.root)).name, 'root');
      const source = new storage.RepositorySourceStateStore(writer);
      const previous = source.load(repositoryId);
      source.replace(previous, {
        ...previous,
        revision: { ...previous.revision, contentFingerprint: 'query-wal-new' },
      });
      const stage = new storage.RepositoryPatchStage(writer, (group) => group[0].canonical);
      try {
        const snapshot = {
          id: 'query-wal-snapshot',
          repositoryId,
          providerId: 'query-provider-a',
          providerVersion: 'fixture-v1',
          runtimeVersion: 'fixture-v1',
          requestedRevisionId: previous.revision.id,
          requestedRevisionFingerprint: 'query-wal-new',
          startedAt: '2026-10-13T00:01:00.000Z',
          completedAt: '2026-10-13T00:01:01.000Z',
          capabilities: [],
          diagnostics: [],
          outcome: 'SUCCEEDED',
        };
        stage.confirmSucceeded({
          type: 'REFRESH_COMPLETED',
          payload: {
            repositoryId,
            revisionId: previous.revision.id,
            revisionFingerprint: 'query-wal-new',
            providerSnapshotId: snapshot.id,
            outcome: 'SUCCEEDED',
            counts: {
              sourceFiles: 0,
              upsertedNodes: 0,
              removedNodes: 0,
              upsertedEdges: 0,
              removedEdges: 0,
              coverage: 0,
              diagnostics: 0,
            },
          },
        });
        await applyAnalysisPatch(
          {
            repositoryId,
            baseRevisionId: previous.revision.id,
            baseContentFingerprint: 'query-fingerprint-1',
            targetRevisionId: previous.revision.id,
            targetContentFingerprint: 'query-wal-new',
          },
          {
            observeAndStage: async () => ({ snapshot, stage, outcome: 'SUCCEEDED' }),
            factStore: new storage.RepositoryCanonicalFactStore(writer),
          },
        );
      } finally {
        stage.close();
      }
      assert.equal(session.context.indexedContentFingerprint, 'query-fingerprint-1');
      const metadata = await collect(
        session.readMetadata({ factType: 'NODE', id: symbolIds.root }),
      );
      assert.equal(
        metadata.find((row) => row.kind === 'SUPPORT').snapshot.requestedRevisionFingerprint,
        'query-fingerprint-1',
      );
    } finally {
      session.close();
      writer.close();
    }
    const reopened = await open(databasePath, repositoryId, createQueryControl(budget));
    try {
      assert.equal(reopened.context.indexedContentFingerprint, 'query-wal-new');
    } finally {
      reopened.close();
    }
  });
});
test('unexpected large BLOB is refused before any row reaches the reader', async (t) => {
  const open = opener();
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId, symbolIds }) => {
    const db = new DatabaseSync(databasePath);
    db.exec(
      'PRAGMA foreign_keys=OFF; ALTER TABLE canonical_nodes RENAME TO corrupt_original_nodes',
    );
    db.exec('CREATE TABLE canonical_nodes AS SELECT * FROM corrupt_original_nodes');
    db.prepare('UPDATE canonical_nodes SET confidence_reasons_json=? WHERE id=?').run(
      Buffer.alloc(100000, 65),
      symbolIds.root,
    );
    db.close();
    const control = createQueryControl({ ...budget, maxResultBytes: 1000 });
    let largestAdmitted = 0;
    const observed = {
      ...control,
      reserveText(bytes) {
        largestAdmitted = Math.max(largestAdmitted, bytes);
        control.reserveText(bytes);
      },
    };
    const originalPrepare = DatabaseSync.prototype.prepare;
    let transferredBlob = false;
    DatabaseSync.prototype.prepare = function (...args) {
      const statement = Reflect.apply(originalPrepare, this, args);
      const originalGet = statement.get;
      statement.get = function (...bindings) {
        const row = Reflect.apply(originalGet, this, bindings);
        if (
          row &&
          Object.values(row).some(
            (value) => value instanceof Uint8Array && value.byteLength >= 100000,
          )
        )
          transferredBlob = true;
        return row;
      };
      return statement;
    };
    let session;
    try {
      session = await open(databasePath, repositoryId, observed);
      await assert.rejects(
        session.readNode(symbolIds.root),
        (error) => error.code === 'QUERY_DATA_INVALID',
      );
    } finally {
      session?.close();
      DatabaseSync.prototype.prepare = originalPrepare;
    }
    assert.equal(transferredBlob, false, 'Invalid BLOB must not cross the SQL-to-JS boundary');
    assert.ok(largestAdmitted < 1000);
  });
});
