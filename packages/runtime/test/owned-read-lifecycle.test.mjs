import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnedReadLifecycle as create } from '../dist/owned-read-lifecycle.js';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const turn = () => new Promise((resolve) => setImmediate(resolve));
function fixture(patch = {}) {
  const calls = [],
    controls = [],
    scopes = [],
    seen = { watch: 0, close: 0 };
  let listener;
  const options = {
    mode: 'MCP_STDIO',
    workspaceId: 'owned-workspace',
    repositoryIds: ['repo:z', 'repo:a'],
    maxItems: 10000,
    maxDepth: 10,
    requestTimeoutMs: 60000,
    async reconcile(reason, scope, control) {
      calls.push(reason);
      controls.push(control);
      scopes.push(scope);
    },
    async watch(emit, scope, control) {
      seen.watch++;
      listener = emit;
      scopes.push(scope);
      controls.push(control);
      return {
        close() {
          seen.close++;
        },
      };
    },
    ...patch,
  };
  const lifecycle = create(options);
  return { options, lifecycle, calls, controls, scopes, seen, emit: (event) => listener(event) };
}
test('private lifecycle supports ONE_SHOT startup reconciliation without opening watch', async () => {
  let watched = 0;
  const f = fixture({
    mode: 'ONE_SHOT',
    async watch() {
      watched++;
      throw Error('must not watch');
    },
  });
  const first = f.lifecycle.start();
  assert.equal(first, f.lifecycle.start());
  await first;
  assert.deepEqual(f.calls, ['STARTUP']);
  assert.equal(watched, 0);
  assert.deepEqual(f.lifecycle.getState(), {
    phase: 'READY',
    uncertain: false,
    dirty: false,
    generation: 0,
  });
  const closing = f.lifecycle.close();
  assert.equal(closing, f.lifecycle.close());
  const result = await closing;
  assert.deepEqual(result, { cleanupState: 'SETTLED' });
  assert.equal(await f.lifecycle.completion, result);
  assert.equal(f.lifecycle.getState().phase, 'CLOSED');
  await assert.rejects(f.lifecycle.start(), { code: 'LIFECYCLE_CLOSED' });
});
test('startup reconcile precedes watch and post-attach pass closes the startup gap before READY', async () => {
  const startup = deferred(),
    startupEntered = deferred(),
    attached = deferred(),
    watchEntered = deferred(),
    post = deferred(),
    postEntered = deferred(),
    calls = [];
  let emit,
    watchCount = 0,
    closeCount = 0;
  const f = fixture({
    async reconcile(reason) {
      calls.push(reason);
      if (reason === 'STARTUP') {
        startupEntered.resolve();
        await startup.promise;
      }
      if (reason === 'POST_ATTACH') {
        postEntered.resolve();
        await post.promise;
      }
    },
    async watch(listener) {
      watchCount++;
      emit = listener;
      watchEntered.resolve();
      await attached.promise;
      return {
        close() {
          closeCount++;
        },
      };
    },
  });
  const pending = f.lifecycle.start();
  await startupEntered.promise;
  assert.equal(watchCount, 0);
  assert.equal(f.lifecycle.getState().phase, 'STARTING');
  startup.resolve();
  await watchEntered.promise;
  emit('CHANGE');
  assert.equal(f.lifecycle.getState().generation, 1);
  assert.equal(f.lifecycle.getState().dirty, true);
  attached.resolve();
  await postEntered.promise;
  assert.deepEqual(calls, ['STARTUP', 'POST_ATTACH']);
  assert.notEqual(f.lifecycle.getState().phase, 'READY');
  post.resolve();
  await pending;
  assert.deepEqual(calls, ['STARTUP', 'POST_ATTACH', 'CHANGE']);
  assert.equal(f.lifecycle.getState().phase, 'READY');
  assert.equal(f.lifecycle.getState().dirty, false);
  await f.lifecycle.close();
  assert.equal(closeCount, 1);
});
test('events coalesce by severity and every event increments generation while reconciliations serialize', async () => {
  const gate = deferred(),
    entered = deferred(),
    next = deferred(),
    calls = [];
  let active = 0,
    maximum = 0;
  const f = fixture({
    async reconcile(reason) {
      calls.push(reason);
      active++;
      maximum = Math.max(maximum, active);
      try {
        if (reason === 'OVERFLOW') {
          entered.resolve();
          await gate.promise;
        }
        if (reason === 'CHANGE') next.resolve();
      } finally {
        active--;
      }
    },
  });
  await f.lifecycle.start();
  f.emit('CHANGE');
  f.emit('OVERFLOW');
  f.emit('CHANGE');
  assert.deepEqual(f.lifecycle.getState(), {
    phase: 'UNCERTAIN',
    uncertain: true,
    dirty: true,
    generation: 3,
  });
  await entered.promise;
  assert.equal(f.lifecycle.getState().dirty, false);
  f.emit('CHANGE');
  assert.equal(f.lifecycle.getState().generation, 4);
  assert.equal(f.lifecycle.getState().dirty, true);
  gate.resolve();
  await next.promise;
  await turn();
  assert.deepEqual(calls, ['STARTUP', 'POST_ATTACH', 'OVERFLOW', 'CHANGE']);
  assert.equal(maximum, 1);
  assert.deepEqual(f.lifecycle.getState(), {
    phase: 'READY',
    uncertain: false,
    dirty: false,
    generation: 4,
  });
  await f.lifecycle.close();
});
test('overflow failure fails closed without a retry-to-green or further accepted events', async () => {
  const calls = [];
  const f = fixture({
    async reconcile(reason) {
      calls.push(reason);
      if (reason === 'OVERFLOW') throw Error('SECRET reconcile');
    },
  });
  await f.lifecycle.start();
  f.emit('OVERFLOW');
  assert.equal(f.lifecycle.getState().uncertain, true);
  assert.deepEqual(await f.lifecycle.completion, { cleanupState: 'UNKNOWN' });
  assert.equal(f.lifecycle.getState().phase, 'FAILED');
  assert.equal(f.lifecycle.getState().uncertain, true);
  f.emit('CHANGE');
  assert.equal(f.lifecycle.getState().generation, 1);
  assert.deepEqual(calls, ['STARTUP', 'POST_ATTACH', 'OVERFLOW']);
  assert.equal(f.seen.close, 1);
  await assert.rejects(f.lifecycle.start(), { code: 'LIFECYCLE_CLOSED' });
  assert.deepEqual(await f.lifecycle.close(), { cleanupState: 'UNKNOWN' });
});
test('close aborts immediately and joins an ignoring startup reconciliation', async () => {
  const entered = deferred(),
    release = deferred();
  let signal;
  const f = fixture({
    async reconcile(reason, scope, c) {
      signal = c.signal;
      entered.resolve();
      await release.promise;
    },
  });
  const starting = f.lifecycle.start();
  const rejected = assert.rejects(starting, { code: 'LIFECYCLE_CLOSED' });
  await entered.promise;
  let settled = false;
  const closing = f.lifecycle.close();
  closing.then(() => (settled = true));
  assert.equal(signal.aborted, true);
  await turn();
  assert.equal(settled, false);
  assert.equal(f.seen.watch, 0);
  release.resolve();
  await rejected;
  assert.deepEqual(await closing, { cleanupState: 'SETTLED' });
  assert.equal(f.lifecycle.getState().phase, 'CLOSED');
});
test('close joins watcher acquisition and closes a late handle once before settlement', async () => {
  const entered = deferred(),
    release = deferred();
  let signal,
    closed = 0;
  const f = fixture({
    async watch(listener, scope, c) {
      signal = c.signal;
      entered.resolve();
      await release.promise;
      return {
        close() {
          closed++;
        },
      };
    },
  });
  const starting = f.lifecycle.start();
  const rejected = assert.rejects(starting, { code: 'LIFECYCLE_CLOSED' });
  await entered.promise;
  let settled = false;
  const closing = f.lifecycle.close();
  closing.then(() => (settled = true));
  assert.equal(signal.aborted, true);
  await turn();
  assert.equal(settled, false);
  assert.equal(closed, 0);
  release.resolve();
  await rejected;
  assert.deepEqual(await closing, { cleanupState: 'SETTLED' });
  assert.equal(closed, 1);
  assert.deepEqual(f.calls, ['STARTUP']);
  await f.lifecycle.close();
  assert.equal(closed, 1);
});
test('reentrant close during watch acquisition joins the late handle without post-attach work', async () => {
  let lifecycle,
    closing,
    closed = 0;
  const f = fixture({
    async watch(listener, scope, c) {
      closing = lifecycle.close();
      assert.equal(c.signal.aborted, true);
      return {
        close() {
          closed++;
        },
      };
    },
  });
  lifecycle = f.lifecycle;
  await assert.rejects(lifecycle.start(), { code: 'LIFECYCLE_CLOSED' });
  assert.deepEqual(await closing, { cleanupState: 'SETTLED' });
  assert.equal(closed, 1);
  assert.deepEqual(f.calls, ['STARTUP']);
});
test('abort-rejected reconciliation and failed watcher cleanup preserve UNKNOWN', async () => {
  const entered = deferred();
  const f = fixture({
    async reconcile(reason, scope, c) {
      entered.resolve();
      await new Promise((resolve, reject) =>
        c.signal.addEventListener('abort', () => reject(Error('SECRET aborted effect')), {
          once: true,
        }),
      );
    },
  });
  const rejected = assert.rejects(f.lifecycle.start(), { code: 'RECONCILIATION_FAILED' });
  await entered.promise;
  assert.deepEqual(await f.lifecycle.close(), { cleanupState: 'UNKNOWN' });
  await rejected;
  const g = fixture({
    async watch() {
      return {
        close() {
          throw Error('SECRET cleanup');
        },
      };
    },
  });
  await g.lifecycle.start();
  assert.deepEqual(await g.lifecycle.close(), { cleanupState: 'UNKNOWN' });
  assert.deepEqual(await g.lifecycle.completion, { cleanupState: 'UNKNOWN' });
  assert.equal(g.lifecycle.getState().phase, 'FAILED');
});
test('watch acquisition failure refuses startup and preserves UNKNOWN without retry', async () => {
  const f = fixture({
    async watch() {
      throw Error('SECRET watch');
    },
  });
  await assert.rejects(f.lifecycle.start(), { code: 'WATCH_FAILED' });
  assert.deepEqual(await f.lifecycle.completion, { cleanupState: 'UNKNOWN' });
  assert.deepEqual(f.calls, ['STARTUP']);
  assert.equal(f.lifecycle.getState().phase, 'FAILED');
});
test('strict constructor rejects accessors/proxies/invalid scopes and captures all host policy before callbacks', async () => {
  const f = fixture();
  let touched = 0;
  const getter = { ...f.options };
  Object.defineProperty(getter, 'reconcile', {
    enumerable: true,
    get() {
      touched++;
      return async () => {};
    },
  });
  assert.throws(() => create(getter), { code: 'INVALID_OPTIONS' });
  assert.throws(() => create(new Proxy(f.options, {})), { code: 'INVALID_OPTIONS' });
  assert.equal(touched, 0);
  for (const patch of [
    { mode: 'DAEMON' },
    { workspaceId: ' ' },
    { repositoryIds: [] },
    { repositoryIds: ['r', 'r'] },
    { repositoryIds: new Proxy(['r'], {}) },
    { maxItems: 0 },
    { maxItems: 1 },
    { maxDepth: -0 },
    { requestTimeoutMs: 0 },
    { reconcile: new Proxy(async () => {}, {}) },
    { extra: true },
    { watch: undefined },
  ])
    assert.throws(() => create({ ...f.options, ...patch }), { code: 'INVALID_OPTIONS' });
  f.options.workspaceId = 'other';
  f.options.repositoryIds.push('other');
  f.options.maxItems = 0;
  f.options.requestTimeoutMs = 1;
  f.options.reconcile = async () => {
    throw Error('must remain captured');
  };
  f.options.watch = async () => {
    throw Error('must remain captured');
  };
  const before = Date.now();
  await f.lifecycle.start();
  for (const s of f.scopes) {
    assert.deepEqual(s, { workspaceId: 'owned-workspace', repositoryIds: ['repo:a', 'repo:z'] });
    assert.ok(Object.isFrozen(s));
    assert.ok(Object.isFrozen(s.repositoryIds));
  }
  for (const c of f.controls) {
    assert.equal(c.maxItems, 10000);
    assert.equal(c.maxDepth, 10);
    assert.ok(c.deadlineEpochMs >= before + 60000);
    assert.ok(Object.isFrozen(c));
  }
  await f.lifecycle.close();
});
test('non-Promise callback results refuse without invoking arbitrary thenables', async () => {
  let touched = 0;
  const f = fixture({
    mode: 'ONE_SHOT',
    reconcile() {
      return {
        then() {
          touched++;
        },
      };
    },
  });
  await assert.rejects(f.lifecycle.start(), { code: 'RECONCILIATION_FAILED' });
  assert.equal(touched, 0);
  assert.deepEqual(await f.lifecycle.completion, { cleanupState: 'UNKNOWN' });
  const g = fixture({
    async watch() {
      const handle = {};
      Object.defineProperty(handle, 'close', {
        enumerable: true,
        get() {
          touched++;
          return () => {};
        },
      });
      return handle;
    },
  });
  await assert.rejects(g.lifecycle.start(), { code: 'WATCH_FAILED' });
  assert.equal(touched, 0);
  assert.deepEqual(await g.lifecycle.completion, { cleanupState: 'UNKNOWN' });
});
test('callback deadline is checked after awaited startup without timer-based sleeps', async () => {
  const originalNow = Date.now;
  let now = 1000;
  const entered = deferred(),
    release = deferred();
  Date.now = () => now;
  try {
    const f = fixture({
      mode: 'ONE_SHOT',
      requestTimeoutMs: 10,
      async reconcile(reason, scope, c) {
        assert.equal(c.deadlineEpochMs, 1010);
        entered.resolve();
        await release.promise;
      },
    });
    const rejected = assert.rejects(f.lifecycle.start(), { code: 'RECONCILIATION_FAILED' });
    await entered.promise;
    now = 1011;
    release.resolve();
    await rejected;
    assert.deepEqual(await f.lifecycle.completion, { cleanupState: 'UNKNOWN' });
  } finally {
    Date.now = originalNow;
  }
});
test('reentrant close during ONE_SHOT startup joins its registered callback', async () => {
  let lifecycle, closing;
  const f = fixture({
    mode: 'ONE_SHOT',
    async reconcile() {
      closing = lifecycle.close();
    },
  });
  lifecycle = f.lifecycle;
  await assert.rejects(lifecycle.start(), { code: 'LIFECYCLE_CLOSED' });
  assert.deepEqual(await closing, { cleanupState: 'SETTLED' });
  assert.equal(f.seen.watch, 0);
});

test('unsafe deadline sum refuses before invoking a host callback', async () => {
  const f = fixture({ mode: 'ONE_SHOT', requestTimeoutMs: Number.MAX_SAFE_INTEGER });
  await assert.rejects(f.lifecycle.start(), { code: 'RECONCILIATION_FAILED' });
  assert.deepEqual(f.calls, []);
  assert.deepEqual(await f.lifecycle.completion, { cleanupState: 'UNKNOWN' });
});
test('owned abort signal permits reentrant close while retaining one cleanup owner and joined settlement', async () => {
  const entered = deferred(),
    release = deferred();
  let disposed = 0,
    reentrant;
  const f = fixture({
    async watch() {
      return {
        async close() {
          disposed++;
          entered.resolve();
          await release.promise;
        },
      };
    },
  });
  await f.lifecycle.start();
  f.lifecycle.signal.addEventListener(
    'abort',
    () => {
      reentrant = f.lifecycle.close();
    },
    { once: true },
  );
  let settled = false;
  const closing = f.lifecycle.close();
  closing.then(() => (settled = true));
  assert.equal(f.lifecycle.signal.aborted, true);
  assert.equal(reentrant, closing);
  await entered.promise;
  await turn();
  assert.equal(settled, false);
  assert.equal(disposed, 1);
  release.resolve();
  assert.deepEqual(await closing, { cleanupState: 'SETTLED' });
  assert.equal(await f.lifecycle.completion, await closing);
  assert.equal(disposed, 1);
});
