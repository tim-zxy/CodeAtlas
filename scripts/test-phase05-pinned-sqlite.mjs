import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as helper from './helpers/phase05-evaluation-fixture.mjs';
import { applyAnalysisPatch, createQueryControl } from '../packages/application/dist/index.js';
import {
  openRepositoryIndexSession,
  RepositoryPatchStage,
  RepositoryCanonicalFactStore,
} from '../packages/storage/dist/index.js';
import { selectMergedGroup } from '../packages/providers/dist/fact-merger-selection.js';

const pinnedInputs = await helper.capturePhase05PinnedInputs({
  repositoryRoot: fileURLToPath(new URL('../', import.meta.url)),
});
const configuration = {
  configVersion: 1,
  source: { include: ['**/*.java'], exclude: [] },
  indexing: { nativeAnalyzer: { parseWorkers: 1 } },
  resourceBudget: { maxDurationMs: 10000, maxMemoryBytes: 16777216, maxEvents: 10000 },
  transportLimits: {
    maxStdinBytes: 1000000,
    maxLineBytes: 1000000,
    maxStdoutBytes: 10000000,
    maxEvents: 10000,
    maxStderrBytes: 1000000,
  },
};
const budget = { maxMetadataRows: 10000, maxResultBytes: 10000000, timeoutMs: 10000 };

async function controls(t, fixtureId) {
  const root = await mkdtemp(path.join(tmpdir(), 'phase05-pinned-sqlite-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { directory: path.join(root, 'owned'), pinnedInputs, fixtureId, configuration };
}

// Omitting Apply, losing a surviving Provider, retaining last-support facts,
// or validating a result-derived oracle must fail these literal original checks.
test('recorded normalization persists eight unique nodes and all fifteen original support candidates', async (t) => {
  assert.equal(typeof helper.runPhase05PinnedSqliteContract, 'function');
  const input = await controls(t, 'canonical-normalization');
  const result = await helper.runPhase05PinnedSqliteContract(input);
  assert.equal(result.evidenceScope, 'RECORDED_PROVIDER_SQLITE_CONTRACT_ONLY');
  assert.equal(result.matches, true);
  assert.deepEqual(result.closure, {
    transactionClosed: true,
    tempClosed: true,
    connectionClosed: true,
  });
  assert.deepEqual(
    result.phases.map((phase) => [
      phase.role,
      phase.counts.nodes,
      phase.counts.edges,
      phase.counts.activeSupports,
    ]),
    [['full', 8, 5, 15]],
  );
  const image = await helper.readPhase05PublishedState({
    databasePath: path.join(input.directory, 'full.sqlite'),
    repositoryId: 'repo-fixture',
    repositoryRoot: input.directory,
    budget,
  });
  assert.equal(image.coverage.baseline, 'MISSING'); // no fabricated v3/R010 baseline
  assert.equal(image.coverage.observations.length, 2);
  assert.deepEqual(image.supports.snapshots[0].capabilities, [
    { name: 'SYMBOL', support: 'SUPPORTED', coverage: 'COMPLETE' },
  ]);
  assert.equal(image.supports.sourceFiles.length, 2);
  const packageNode = image.supports.facts.nodes.find((node) => node.kind === 'PACKAGE');
  assert.equal(packageNode.sourceRange.sourceFileId, 'file-A.java');
  assert.equal(packageNode.confidence.method, 'fact-merger-min-v1');
  assert.equal(image.supports.candidates.length, 15);
  assert.equal(image.supports.snapshots.length, 1);
});

test('recorded merge uses real Apply and preserves original two, one and zero support IDs after reopen', async (t) => {
  assert.equal(typeof helper.runPhase05PinnedSqliteContract, 'function');
  const input = await controls(t, 'two-provider-same-call');
  const result = await helper.runPhase05PinnedSqliteContract(input);
  assert.equal(result.matches, true);
  assert.deepEqual(result.closure, {
    transactionClosed: true,
    tempClosed: true,
    connectionClosed: true,
  });
  assert.deepEqual(
    result.phases.map((phase) => [
      phase.role,
      phase.counts.nodes,
      phase.counts.edges,
      phase.counts.activeSupports,
    ]),
    [
      ['full', 2, 1, 6],
      ['one', 2, 1, 3],
      ['zero', 0, 0, 0],
    ],
  );
  const golden = JSON.parse(
    pinnedInputs.readFile('two-provider-same-call', 'expected/lifetimes.json'),
  );
  for (const role of ['full', 'one', 'zero']) {
    const image = await helper.readPhase05PublishedState({
      databasePath: path.join(input.directory, `${role}.sqlite`),
      repositoryId: 'repo-fixture',
      repositoryRoot: input.directory,
      budget,
    });
    assert.deepEqual(image.supports.facts.nodes.map((node) => node.id).sort(), golden[role].nodes);
    assert.deepEqual(image.supports.facts.edges.map((edge) => edge.id).sort(), golden[role].edges);
    assert.deepEqual(
      image.supports.evidence
        .filter((row) => row.status === 'ACTIVE')
        .map((row) => row.id)
        .sort(),
      golden[role].evidence,
    );
    assert.deepEqual(
      image.supports.bindings.map((row) => row.evidenceId).sort(),
      golden[role].bindings,
    );
    assert.deepEqual(
      image.supports.facts.edges.map((edge) => edge.confidence),
      golden[role].confidence,
    );
    assert.equal(image.supports.evidence.length, 6); // retired history is not erased
    assert.equal(image.coverage.baseline, 'MISSING');
  }
});

test('recorded SQLite contract refuses an existing owned destination without changing its bytes', async (t) => {
  assert.equal(typeof helper.runPhase05PinnedSqliteContract, 'function');
  const input = await controls(t, 'canonical-normalization');
  await helper.runPhase05PinnedSqliteContract(input);
  const filename = path.join(input.directory, 'working.sqlite');
  const before = await readFile(filename);
  await assert.rejects(helper.runPhase05PinnedSqliteContract(input));
  assert.deepEqual(await readFile(filename), before);
});

test('recorded merge carries its own failed Apply and reopened retention evidence', async (t) => {
  const input = await controls(t, 'two-provider-same-call');
  const result = await helper.runPhase05PinnedSqliteContract(input);
  assert.ok(
    Array.isArray(result.rejectedPatches),
    'Missing per-invocation rejected patch evidence',
  );
  assert.deepEqual(
    result.rejectedPatches.map((row) => [row.kind, row.errorCode]),
    [
      ['DANGLING_NODE_REMOVAL', 'INVALID_PATCH'],
      ['STALE_BASE', 'BASE_REVISION_MISMATCH'],
    ],
  );
  for (const row of result.rejectedPatches) {
    assert.match(row.beforeImageDigest, /^[a-f0-9]{64}$/);
    assert.equal(row.afterImageDigest, row.beforeImageDigest);
    assert.deepEqual(row.closure, {
      transactionClosed: true,
      tempClosed: true,
      connectionClosed: true,
    });
  }
  assert.equal(result.matches, true);
});

test('recorded SQLite contract refuses forged pinned readers before creating output', async (t) => {
  assert.equal(typeof helper.runPhase05PinnedSqliteContract, 'function');
  const input = await controls(t, 'canonical-normalization');
  await assert.rejects(
    helper.runPhase05PinnedSqliteContract({ ...input, pinnedInputs: { ...pinnedInputs } }),
  );
  await assert.rejects(readFile(path.join(input.directory, 'working.sqlite')), { code: 'ENOENT' });
});

for (const staleBase of [false, true])
  test(`recorded one-support state survives ${staleBase ? 'stale-base refusal' : 'dangling-node retirement rollback'} after reopen`, async (t) => {
    const input = await controls(t, 'two-provider-same-call');
    await helper.runPhase05PinnedSqliteContract(input);
    const databasePath = path.join(input.directory, 'one.sqlite');
    const read = () =>
      helper.readPhase05PublishedState({
        databasePath,
        repositoryId: 'repo-fixture',
        repositoryRoot: input.directory,
        budget,
      });
    const before = await read();
    const session = await openRepositoryIndexSession(
      {
        databasePath,
        repositoryId: 'repo-fixture',
        repositoryRoot: input.directory,
        initialize: false,
        readOnly: false,
      },
      createQueryControl({ ...budget, maxNodes: 10000, maxEdges: 10000 }),
    );
    const stage = new RepositoryPatchStage(
      session.database,
      (group) => selectMergedGroup(group).fact,
    );
    try {
      const snapshot = {
        ...before.supports.snapshots.find((row) => row.providerId === 'alpha'),
        id: 'fixture-node-only-removal',
      };
      await stage.accept({
        type: 'REMOVE_NODE',
        payload: { factType: 'NODE', providerId: 'alpha', providerFactId: 'method-run' },
      });
      stage.confirmSucceeded({
        type: 'REFRESH_COMPLETED',
        payload: {
          repositoryId: snapshot.repositoryId,
          revisionId: snapshot.requestedRevisionId,
          revisionFingerprint: snapshot.requestedRevisionFingerprint,
          providerSnapshotId: snapshot.id,
          outcome: 'SUCCEEDED',
          counts: {
            sourceFiles: 0,
            upsertedNodes: 0,
            removedNodes: 1,
            upsertedEdges: 0,
            removedEdges: 0,
            coverage: 0,
            diagnostics: 0,
          },
        },
      });
      await assert.rejects(
        applyAnalysisPatch(
          {
            repositoryId: snapshot.repositoryId,
            baseRevisionId: snapshot.requestedRevisionId,
            baseContentFingerprint: staleBase
              ? 'wrong-base'
              : snapshot.requestedRevisionFingerprint,
            targetRevisionId: snapshot.requestedRevisionId,
            targetContentFingerprint: snapshot.requestedRevisionFingerprint,
          },
          {
            observeAndStage: async () => ({ outcome: 'SUCCEEDED', snapshot, stage }),
            factStore: new RepositoryCanonicalFactStore(session.database),
          },
        ),
        (error) => error.code === (staleBase ? 'BASE_REVISION_MISMATCH' : 'INVALID_PATCH'),
      );
      assert.equal(session.database.isTransaction, false);
    } finally {
      stage.close();
      assert.equal(
        session.database
          .prepare("SELECT count(*) AS n FROM sqlite_temp_schema WHERE name NOT LIKE 'sqlite_%'")
          .get().n,
        0,
      );
      session.close();
      assert.equal(session.database.isOpen, false);
    }
    assert.deepEqual(await read(), before);
  });
