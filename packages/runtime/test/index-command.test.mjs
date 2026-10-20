import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import * as runtime from '../dist/index.js';
import { openRepositoryIndexSession } from '../../storage/dist/index.js';
const input = JSON.parse(
  await readFile(
    new URL('../../../fixtures/indexing/phase05-index-cli/inputs/requests.json', import.meta.url),
    'utf8',
  ),
);
function run() {
  assert.equal(typeof runtime.runIndexCommand, 'function', 'Missing Runtime indexing entry');
  return runtime.runIndexCommand;
}

for (const operation of ['FULL', 'INCREMENTAL'])
  test(`index runtime admission refuses ${operation} before missing paths are opened`, async (t) => {
    const invoke = run();
    const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-index-runtime-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const databasePath = path.join(directory, 'missing.sqlite');
    const request = {
      ...input.write,
      operation,
      initialize: operation === 'FULL',
      databasePath,
      repositoryRoot: path.join(directory, 'missing-root'),
      nativeExecutablePath: path.join(directory, 'missing-native'),
      configuration: input.configuration,
    };
    await assert.rejects(
      invoke(request),
      (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED' && e.effects.graphCommit === 'NOT_ATTEMPTED',
    );
    await assert.rejects(readFile(databasePath), { code: 'ENOENT' });
  });

test('index runtime cancellation precedes opener and admission', async () => {
  const stop = new AbortController();
  stop.abort();
  await assert.rejects(
    run()({ ...input.write, configuration: input.configuration }, { signal: stop.signal }),
    (e) => e.code === 'CANCELLED',
  );
});

test('index runtime malformed input cannot open a database', async () => {
  await assert.rejects(
    run()({ ...input.status, extra: true }),
    (e) => e.code === 'INVALID_REQUEST' && e.effects.graphCommit === 'NOT_ATTEMPTED',
  );
});

test('index runtime missing status database reports no write attempt and creates nothing', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-status-missing-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, 'missing.sqlite');
  await assert.rejects(run()({ ...input.status, databasePath }), (error) => {
    assert.equal(error.code, 'DATABASE_UNAVAILABLE');
    assert.deepEqual(error.effects, {
      databaseInitialized: false,
      sourceReconciled: false,
      graphCommit: 'NOT_ATTEMPTED',
    });
    return true;
  });
  await assert.rejects(readFile(databasePath), { code: 'ENOENT' });
});

test('index runtime status is read-only and needs no Native executable/profile', async (t) => {
  const invoke = run();
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-index-status-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repositoryRoot = path.join(directory, 'repo');
  await mkdir(repositoryRoot);
  const databasePath = path.join(directory, 'repository.sqlite');
  const session = await openRepositoryIndexSession(
    {
      databasePath,
      repositoryRoot: await realpath(repositoryRoot),
      repositoryId: 'fixture-repo',
      initialize: true,
      readOnly: false,
    },
    { async checkpoint() {}, reserveText() {}, chargeMetadataRow() {} },
  );
  session.close();
  const before = await readFile(databasePath);
  const result = await invoke({
    ...input.status,
    databasePath,
    budget: { maxMetadataRows: 20, maxResultBytes: 10000, timeoutMs: 5000 },
  });
  assert.equal(result.kind, 'INDEX_STATUS');
  assert.equal(result.status.freshness.state, 'NOT_INDEXED');
  assert.equal(result.status.freshness.worktree, 'NOT_OBSERVED');
  assert.deepEqual(await readFile(databasePath), before);
  const golden = JSON.parse(
    await readFile(
      new URL(
        '../../../fixtures/indexing/phase05-index-cli/expected/results.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ).unindexed;
  const exactBytes = Buffer.byteLength(JSON.stringify(golden), 'utf8');
  assert.deepEqual(
    await invoke({
      ...input.status,
      databasePath,
      budget: { maxMetadataRows: 20, maxResultBytes: exactBytes, timeoutMs: 5000 },
    }),
    golden,
  );
  await assert.rejects(
    invoke({
      ...input.status,
      databasePath,
      budget: { maxMetadataRows: 20, maxResultBytes: exactBytes - 1, timeoutMs: 5000 },
    }),
    (error) =>
      error.code === 'RESOURCE_LIMIT_EXCEEDED' && error.effects.graphCommit === 'NOT_ATTEMPTED',
  );
  assert.deepEqual(await readFile(databasePath), before);
  await assert.rejects(
    invoke({
      ...input.status,
      databasePath,
      budget: { maxMetadataRows: 20, maxResultBytes: 1, timeoutMs: 5000 },
    }),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
  assert.deepEqual(await readFile(databasePath), before);
});
