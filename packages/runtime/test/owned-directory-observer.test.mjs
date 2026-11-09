import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lstat, realpath, writeFile, rename, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { createOwnedDirectoryObserver as create } from '../dist/owned-directory-observer.js';
const scope = () => ({
  workspaceId: 'owned-observer-workspace',
  repositoryIds: ['owned-observer-repository'],
});
const control = (signal = new AbortController().signal, patch = {}) => ({
  maxItems: 1000,
  maxDepth: 10,
  deadlineEpochMs: Date.now() + 60000,
  signal,
  ...patch,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const turn = () => new Promise((r) => setImmediate(r));
// Intercepts construction in this isolated test process while retaining the real OS watcher.
async function withNativeWatch(attach, run) {
  const original = fs.watch;
  fs.watch = (...args) => {
    const handle = Reflect.apply(original, fs, args);
    attach(handle);
    return handle;
  };
  syncBuiltinESMExports();
  try {
    return await run();
  } finally {
    fs.watch = original;
    syncBuiltinESMExports();
  }
}
const cleanup = (t) => (observer) => {
  t.after(() => observer.close().catch(() => undefined));
  return observer;
};
test(
  'factory creates exclusive fresh own directories and exposes no adoption or filename API',
  { timeout: 10000 },
  async (t) => {
    const one = cleanup(t)(await create(scope(), () => {}, control())),
      two = cleanup(t)(await create(scope(), () => {}, control()));
    assert.notEqual(one.directory, two.directory);
    for (const observer of [one, two]) {
      assert.equal(dirname(resolve(observer.directory)), await realpath(tmpdir()));
      assert.ok(basename(observer.directory).startsWith('codeatlas-owned-observer-'));
      const stat = await lstat(observer.directory);
      assert.equal(stat.isDirectory(), true);
      assert.equal(stat.isSymbolicLink(), false);
      assert.deepEqual(Object.keys(observer).sort(), ['close', 'directory', 'signal']);
      assert.equal(observer.signal.aborted, false);
      await observer.close();
      assert.equal(observer.signal.aborted, true);
    }
  },
);
test(
  'real create rename and delete notifications use only CHANGE/OVERFLOW on the fresh owned directory',
  { timeout: 10000 },
  async (t) => {
    let pending;
    const events = [];
    const observer = cleanup(t)(
      await create(
        scope(),
        (event) => {
          events.push(event);
          pending?.resolve(event);
        },
        control(),
      ),
    );
    const a = join(observer.directory, 'owned-a.fixture'),
      b = join(observer.directory, 'owned-b.fixture');
    for (const action of [
      () => writeFile(a, 'owned observer fixture\n', { flag: 'wx' }),
      () => rename(a, b),
      () => unlink(b),
    ]) {
      pending = deferred();
      await action();
      const event = await pending.promise;
      assert.ok(event === 'CHANGE' || event === 'OVERFLOW');
      pending = undefined;
    }
    assert.ok(events.includes('CHANGE'));
    await observer.close();
  },
);
test(
  'normal abort closes confirmed native handle and queued/later callbacks cannot deliver',
  { timeout: 10000 },
  async (t) => {
    const abort = new AbortController();
    let count = 0;
    const observer = cleanup(t)(
      await create(
        scope(),
        () => {
          count++;
        },
        control(abort.signal),
      ),
    );
    const writing = writeFile(join(observer.directory, 'owned-pending.fixture'), 'owned\n', {
      flag: 'wx',
    });
    abort.abort();
    assert.equal(observer.signal.aborted, true);
    await writing;
    const closing = observer.close();
    assert.equal(closing, observer.close());
    await closing;
    const after = count;
    await writeFile(join(observer.directory, 'owned-after-close.fixture'), 'owned\n', {
      flag: 'wx',
    });
    await turn();
    assert.equal(count, after);
  },
);
test(
  'reentrant provider-abort listener receives the same close owner and real confirmation',
  { timeout: 10000 },
  async (t) => {
    let confirmed = false,
      reentrant;
    await withNativeWatch(
      (watcher) =>
        watcher.once('close', () => {
          confirmed = true;
        }),
      async () => {
        const observer = cleanup(t)(await create(scope(), () => {}, control()));
        observer.signal.addEventListener(
          'abort',
          () => {
            reentrant = observer.close();
          },
          { once: true },
        );
        const closing = observer.close();
        assert.equal(reentrant, closing);
        await closing;
        assert.equal(confirmed, true);
      },
    );
  },
);
test(
  'controlled absent/unknown native notifications conservatively overflow without retaining names',
  { timeout: 10000 },
  async (t) => {
    let watcher;
    await withNativeWatch(
      (handle) => {
        watcher = handle;
      },
      async () => {
        const events = [],
          observer = cleanup(t)(
            await create(
              scope(),
              (event) => {
                events.push(event);
              },
              control(),
            ),
          );
        watcher.emit('change', 'rename', null);
        watcher.emit('change', 'unknown', 'owned.fixture');
        watcher.emit('change', 'change', 'nested/name');
        watcher.emit('change', 'change', 'owned.fixture');
        assert.deepEqual(events, ['OVERFLOW', 'OVERFLOW', 'OVERFLOW', 'CHANGE']);
        await observer.close();
      },
    );
  },
);
test(
  'listener throw aborts immediately, poisons cleanup and prevents future delivery',
  { timeout: 10000 },
  async (t) => {
    let count = 0;
    const observer = cleanup(t)(
      await create(
        scope(),
        () => {
          count++;
          throw Error('SECRET listener');
        },
        control(),
      ),
    );
    const aborted = deferred();
    observer.signal.addEventListener('abort', () => aborted.resolve(), { once: true });
    await writeFile(join(observer.directory, 'owned-throw.fixture'), 'owned\n', { flag: 'wx' });
    await aborted.promise;
    assert.equal(observer.signal.aborted, true);
    const closing = observer.close();
    await assert.rejects(
      closing,
      (error) =>
        error.code === 'OBSERVER_CLEANUP_UNKNOWN' &&
        error.cleanupState === 'UNKNOWN' &&
        !error.message.includes('SECRET'),
    );
    assert.equal(closing, observer.close());
    await writeFile(join(observer.directory, 'owned-later.fixture'), 'owned\n', { flag: 'wx' });
    await turn();
    assert.equal(count, 1);
  },
);
test(
  'ordinary callbacks returning a native rejected Promise or thenable fail without delaying event authority',
  { timeout: 10000 },
  async (t) => {
    for (const returns of [
      () => Promise.reject(Error('SECRET rejection')),
      () => {
        const result = Promise.reject(Error('SECRET rejection'));
        Object.defineProperty(result, 'catch', {
          get() {
            assert.fail('overridden catch must not execute');
          },
        });
        return result;
      },
      () => ({
        then() {
          assert.fail('arbitrary thenable must not execute');
        },
      }),
    ]) {
      let watcher;
      await withNativeWatch(
        (handle) => {
          watcher = handle;
        },
        async () => {
          const observer = cleanup(t)(await create(scope(), () => returns(), control()));
          watcher.emit('change', 'rename', 'owned.fixture');
          assert.equal(observer.signal.aborted, true);
          await assert.rejects(observer.close(), {
            code: 'OBSERVER_CLEANUP_UNKNOWN',
            cleanupState: 'UNKNOWN',
          });
          await turn();
        },
      );
    }
  },
);
test(
  'real watcher errors and unexpected native close abort and preserve UNKNOWN',
  { timeout: 10000 },
  async (t) => {
    for (const event of ['error', 'close']) {
      let watcher,
        confirmed = false;
      await withNativeWatch(
        (handle) => {
          watcher = handle;
          watcher.once('close', () => {
            confirmed = true;
          });
        },
        async () => {
          const observer = cleanup(t)(await create(scope(), () => {}, control())),
            aborted = deferred();
          observer.signal.addEventListener('abort', () => aborted.resolve(), { once: true });
          if (event === 'error') {
            watcher.emit('error', Error('SECRET provider'));
            assert.equal(observer.signal.aborted, true);
          } else watcher.close();
          await aborted.promise;
          await assert.rejects(observer.close(), {
            code: 'OBSERVER_CLEANUP_UNKNOWN',
            cleanupState: 'UNKNOWN',
          });
          assert.equal(confirmed, true);
        },
      );
    }
  },
);
test(
  'abort during actual synchronous native attachment closes the late-owned watcher before create rejects',
  { timeout: 10000 },
  async () => {
    const abort = new AbortController();
    let confirmed = false,
      opened = 0;
    await withNativeWatch(
      (handle) => {
        opened++;
        handle.once('close', () => {
          confirmed = true;
        });
        abort.abort();
      },
      async () => {
        await assert.rejects(
          create(scope(), () => {}, control(abort.signal)),
          { code: 'CANCELLED' },
        );
        assert.equal(opened, 1);
        assert.equal(confirmed, true);
      },
    );
  },
);
test('strict descriptors and bounded controls refuse getters/proxies/async listeners/paths before allocation', async () => {
  let touched = 0;
  const accessor = scope();
  Object.defineProperty(accessor, 'repositoryIds', {
    enumerable: true,
    get() {
      touched++;
      return ['r'];
    },
  });
  await assert.rejects(
    create(accessor, () => {}, control()),
    { code: 'INVALID_INPUT' },
  );
  assert.equal(touched, 0);
  for (const bad of [
    new Proxy(scope(), {}),
    { ...scope(), directory: 'not-adopted' },
    { ...scope(), repositoryIds: [] },
    { ...scope(), repositoryIds: ['r', 'r'] },
  ])
    await assert.rejects(
      create(bad, () => {}, control()),
      { code: 'INVALID_INPUT' },
    );
  for (const bad of [
    control(undefined, { maxItems: 0 }),
    control(undefined, { maxDepth: -0 }),
    control(undefined, { deadlineEpochMs: Number.NaN }),
    control(undefined, { signal: new Proxy(new AbortController().signal, {}) }),
    { ...control(), extra: true },
  ])
    await assert.rejects(
      create(scope(), () => {}, bad),
      { code: 'INVALID_INPUT' },
    );
  await assert.rejects(
    create(scope(), async () => {}, control()),
    { code: 'INVALID_INPUT' },
  );
  await assert.rejects(create(scope(), new Proxy(() => {}, {}), control()), {
    code: 'INVALID_INPUT',
  });
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    create(scope(), () => {}, control(aborted.signal)),
    { code: 'CANCELLED' },
  );
  await assert.rejects(
    create(scope(), () => {}, control(undefined, { deadlineEpochMs: Date.now() - 1 })),
    { code: 'DEADLINE' },
  );
});
