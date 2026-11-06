import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../packages/runtime/test/helpers/native-refresh-transport-replay.mjs');
test('preparation cleanup closes every owned resource and preserves the first failure', () => {
  const calls = [],
    diagnostics = [],
    first = Error('first'),
    last = Error('last');
  const outcome = api.closeRefreshPreparationResources(
    [
      {
        close() {
          calls.push('one');
          throw first;
        },
      },
      {
        close() {
          calls.push('two');
        },
      },
      {
        close() {
          calls.push('three');
          throw last;
        },
      },
    ],
    diagnostics,
  );
  assert.deepEqual(calls, ['one', 'two', 'three']);
  assert.equal(outcome.failed, true);
  assert.equal(outcome.error, first);
  assert.deepEqual(diagnostics, ['Error: first', 'Error: last']);
});
test('falsy cleanup failures stay failures; success remains explicit', () => {
  for (const error of [undefined, null, false, 0, '']) {
    let second = false;
    const outcome = api.closeRefreshPreparationResources(
      [
        {
          close() {
            throw error;
          },
        },
        {
          close() {
            second = true;
          },
        },
      ],
      [],
    );
    assert.equal(outcome.failed, true);
    assert.equal(outcome.error, error);
    assert.equal(second, true);
  }
  const calls = [];
  assert.deepEqual(
    api.closeRefreshPreparationResources(
      [
        {
          close() {
            calls.push('closed');
          },
        },
      ],
      [],
    ),
    { failed: false, error: undefined },
  );
  assert.deepEqual(calls, ['closed']);
});

test('diagnostic formatting failure cannot prevent later owned resources from closing', () => {
  const original = {
      toString() {
        throw Error('format');
      },
    },
    diagnostics = [];
  let later = false;
  const outcome = api.closeRefreshPreparationResources(
    [
      {
        close() {
          throw original;
        },
      },
      {
        close() {
          later = true;
        },
      },
    ],
    diagnostics,
  );
  assert.equal(later, true);
  assert.equal(outcome.failed, true);
  assert.equal(outcome.error, original);
  assert.deepEqual(diagnostics, ['UNPRINTABLE_CLEANUP_FAILURE']);
});

test('actual preparation failure persistence keeps unprintable primary and retained diagnostics', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-preparation-failure-'));
  t.after(() => {
    assert.equal(path.resolve(path.dirname(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('codeatlas-preparation-failure-'));
    return rm(root, { recursive: true, force: true });
  });
  let stackReads = 0;
  const original = {
    get stack() {
      stackReads++;
      throw Error('stack');
    },
    toString() {
      throw Error('format');
    },
  };
  await assert.rejects(
    () =>
      api.failRefreshPreparation(
        root,
        original,
        ['fixture-b', 'fixture-a', 'fixture-b'],
        ['close-failed'],
      ),
    (e) => e === original,
  );
  const receipt = JSON.parse(await readFile(path.join(root, 'preparation-failure.json'), 'utf8'));
  assert.equal(receipt.failure, 'UNPRINTABLE_PREPARATION_FAILURE');
  assert.deepEqual(receipt.retainedFixturePaths, ['fixture-a', 'fixture-b']);
  assert.deepEqual(receipt.cleanupFailures, ['close-failed']);
  assert.equal(stackReads, 0);
});

test('command failure artifact preserves nullish/unprintable preparation throws before any worker', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'codeatlas-preparation-failure-'));
  t.after(() => {
    assert.equal(path.resolve(path.dirname(base)), path.resolve(tmpdir()));
    assert.ok(path.basename(base).startsWith('codeatlas-preparation-failure-'));
    return rm(base, { recursive: true, force: true });
  });
  const opaque = {
    get message() {
      throw Error('message');
    },
    get stack() {
      throw Error('stack');
    },
    toString() {
      throw Error('format');
    },
  };
  for (const [i, original] of [undefined, null, opaque].entries()) {
    const output = path.join(base, String(i));
    let failed = 0;
    const control = {
      checkpoint(boundary) {
        if (boundary === 'CORPUS_BEGIN') throw original;
      },
      fail() {
        failed++;
      },
    };
    await assert.rejects(
      () => api.runRefreshTransportCommand(['bench', output], undefined, control),
      (e) => e === original,
    );
    const receipt = JSON.parse(await readFile(path.join(output, 'command-failure.json'), 'utf8'));
    assert.equal(typeof receipt.failure, 'string');
    assert.equal(failed, 1);
  }
});
