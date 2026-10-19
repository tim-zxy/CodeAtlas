import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as app from '../dist/index.js';
import { materialize } from '../../source/test/helpers.mjs';

async function fixture(t) {
  assert.equal(typeof app.executeIndexWrite, 'function', 'Missing index source command');
  const base = await mkdtemp(path.join(tmpdir(), 'codeatlas-index-source-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const setup = JSON.parse(
    await readFile(
      new URL('../../../fixtures/source/restart-reconciliation/setup.json', import.meta.url),
      'utf8',
    ),
  );
  const root = await realpath(await materialize(setup, base));
  const input = JSON.parse(
    await readFile(
      new URL('../../../fixtures/indexing/phase05-index-cli/inputs/requests.json', import.meta.url),
      'utf8',
    ),
  );
  const request = { ...input.write, repositoryRoot: root, configuration: input.configuration };
  let state = null,
    indexed = null;
  const calls = [];
  const repository = {
    initialized: true,
    sourceState: {
      load() {
        return structuredClone(state);
      },
      findCommitRevisionId() {
        return null;
      },
      replace(expected, next) {
        assert.deepEqual(expected, state, 'Source optimistic precondition');
        state = structuredClone(next);
      },
    },
    async analyze(next) {
      indexed = structuredClone(next.revision);
      return {
        timings: {
          scanMs: null,
          transportMs: 1,
          normalizeMs: 0,
          mergeMs: 0,
          dbApplyMs: 1,
          dbLockMs: 0,
          totalMs: 2,
          unavailableReasons: { scanMs: 'Application owns observation' },
        },
        workers: { requested: 'AUTO', effectiveCount: 1 },
      };
    },
    async readStatus() {
      return {
        source: state.revision,
        indexed: {
          revisionId: indexed?.id ?? null,
          contentFingerprint: indexed?.contentFingerprint ?? null,
        },
        freshness: {
          basis: 'PERSISTED_SOURCE',
          worktree: 'NOT_OBSERVED',
          state:
            indexed === null
              ? 'NOT_INDEXED'
              : indexed.contentFingerprint === state.revision.contentFingerprint
                ? 'CURRENT'
                : 'STALE',
        },
        baseline: { state: 'PRESENT_UNVERIFIED' },
        coverage: { scope: 'PERSISTED_NATIVE_SNAPSHOT', snapshotId: null, capabilities: [] },
      };
    },
  };
  const ports = {
    async captureSourceBase() {
      calls.push('capture');
      return structuredClone(state);
    },
    async withRepository(observed, action) {
      calls.push('open');
      assert.equal(observed, root);
      return action(repository);
    },
  };
  return { base, root, request, repository, ports, calls, state: () => state };
}

test('index source sequencing unit ports preserve real Git Source IDs across commands', async (t) => {
  const f = await fixture(t);
  const first = await app.executeIndexWrite(f.request, f.ports);
  assert.equal(first.graphCommitted, true);
  assert.equal(first.status.freshness.worktree, 'NOT_OBSERVED');
  const prior = structuredClone(f.state());
  f.repository.initialized = false;
  const second = await app.executeIndexWrite({ ...f.request, initialize: false }, f.ports);
  assert.deepEqual(f.state(), prior);
  assert.equal(second.databaseInitialized, false);
  assert.deepEqual(f.calls, ['capture', 'open', 'capture', 'open']);
});

test('index source sequencing observes add modify delete and retains unaffected file identity', async (t) => {
  const f = await fixture(t);
  await app.executeIndexWrite(f.request, f.ports);
  const before = structuredClone(f.state());
  await writeFile(path.join(f.root, 'src/Add.java'), 'class Added {}\n');
  await writeFile(path.join(f.root, 'src/Keep.java'), 'class Changed {}\n');
  await rm(path.join(f.root, 'src/Remove.java'));
  f.repository.initialized = false;
  await app.executeIndexWrite(
    { ...f.request, operation: 'INCREMENTAL', initialize: false },
    f.ports,
  );
  const after = f.state();
  assert.equal(after.revision.id, before.revision.id);
  assert.notEqual(after.revision.contentFingerprint, before.revision.contentFingerprint);
  assert.equal(
    after.files.find((file) => file.path === 'src/Keep.java').id,
    before.files.find((file) => file.path === 'src/Keep.java').id,
  );
  assert.notEqual(
    after.files.find((file) => file.path === 'src/Keep.java').contentFingerprint,
    before.files.find((file) => file.path === 'src/Keep.java').contentFingerprint,
  );
  assert.ok(after.files.some((file) => file.path === 'src/Add.java'));
  assert.ok(!after.files.some((file) => file.path === 'src/Remove.java'));
  assert.equal(after.files.length, before.files.length);
  assert.deepEqual(f.calls, ['capture', 'open', 'capture', 'open']);
});

test('index source sequencing refuses a nested starting path before registration', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    app.executeIndexWrite({ ...f.request, repositoryRoot: path.join(f.root, 'src') }, f.ports),
    (e) => e.code === 'REPOSITORY_MISMATCH',
  );
  assert.equal(f.state(), null);
  assert.deepEqual(f.calls, ['capture']);
});

test('index source sequencing cancellation before observation has no source effects', async (t) => {
  const f = await fixture(t);
  const stop = new AbortController();
  stop.abort();
  await assert.rejects(
    app.executeIndexWrite(f.request, f.ports, stop.signal),
    (e) => e.code === 'CANCELLED',
  );
  assert.equal(f.state(), null);
  assert.deepEqual(f.calls, []);
});

test('index source sequencing keeps reconciliation distinct from failed analysis', async (t) => {
  const f = await fixture(t);
  await app.executeIndexWrite(f.request, f.ports);
  const old = structuredClone(f.state());
  await writeFile(path.join(f.root, 'src/Keep.java'), 'class Changed {}\n');
  f.repository.initialized = false;
  f.repository.analyze = async () => {
    throw new Error('secret raw SQL');
  };
  await assert.rejects(app.executeIndexWrite({ ...f.request, initialize: false }, f.ports), (e) => {
    assert.equal(e.code, 'ANALYSIS_FAILED');
    assert.equal(e.effects.sourceReconciled, true);
    assert.equal(e.effects.graphCommit, 'UNKNOWN');
    assert.ok(!e.message.includes('secret'));
    return true;
  });
  assert.equal(f.state().revision.id, old.revision.id);
  assert.notEqual(f.state().revision.contentFingerprint, old.revision.contentFingerprint);
});

test('index source sequencing does not reload a captured competing Source state', async (t) => {
  const f = await fixture(t);
  await app.executeIndexWrite(f.request, f.ports);
  const captured = structuredClone(f.state());
  f.ports.captureSourceBase = async () => captured;
  f.ports.withRepository = async (_, action) => {
    const next = structuredClone(captured);
    next.revision.contentFingerprint = 'sha256:' + '2'.repeat(64);
    f.repository.sourceState.replace(captured, next);
    return action(f.repository);
  };
  await assert.rejects(
    app.executeIndexWrite({ ...f.request, initialize: false }, f.ports),
    (e) => e.code === 'SOURCE_FAILED',
  );
  assert.equal(f.state().revision.contentFingerprint, 'sha256:' + '2'.repeat(64));
});
