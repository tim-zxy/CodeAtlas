import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  runOwnedManagedMcpHost,
  acquireAndRunOwnedManagedMcpHost,
  OwnedMcpAcquisitionFailure,
} from '../dist/owned-managed-host.js';
const settled = { cleanupState: 'SETTLED' };
const unknown = { cleanupState: 'UNKNOWN' };
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

test('embedding owner waits for server settlement before its registered cleanup', async () => {
  const gate = deferred(),
    calls = [];
  const done = runOwnedManagedMcpHost(
    {
      start: async () => calls.push('start'),
      completion: Promise.resolve(settled),
      close: async () => {
        calls.push('close');
        await gate.promise;
        calls.push('joined');
        return settled;
      },
    },
    () => {
      calls.push('owner');
      return settled;
    },
    new AbortController().signal,
  );
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(calls, ['start', 'close']);
  gate.resolve();
  assert.deepEqual(await done, { exitCode: 0, cleanupState: 'SETTLED' });
  assert.deepEqual(calls, ['start', 'close', 'joined', 'owner']);
});
test('embedding owner preserves startup failure while closing registered resources', async () => {
  let closes = 0,
    owners = 0;
  const result = await runOwnedManagedMcpHost(
    {
      start: async () => {
        throw Error('private');
      },
      completion: new Promise(() => {}),
      close: async () => {
        closes++;
        return settled;
      },
    },
    () => {
      owners++;
      return settled;
    },
    new AbortController().signal,
  );
  assert.deepEqual(result, { exitCode: 2, cleanupState: 'SETTLED' });
  assert.equal(closes, 1);
  assert.equal(owners, 1);
});
test('embedding owner cancels during startup without prematurely closing its resources', async () => {
  const controller = new AbortController(),
    entered = deferred(),
    start = deferred(),
    joined = deferred();
  let closes = 0,
    owners = 0;
  const done = runOwnedManagedMcpHost(
    {
      start: () => {
        entered.resolve();
        return start.promise;
      },
      completion: joined.promise,
      close: async () => {
        closes++;
        await start.promise;
        joined.resolve(settled);
        return settled;
      },
    },
    () => {
      owners++;
      return settled;
    },
    controller.signal,
  );
  await entered.promise;
  controller.abort();
  await new Promise((r) => setImmediate(r));
  assert.equal(closes, 1);
  assert.equal(owners, 0);
  start.resolve();
  assert.deepEqual(await done, { exitCode: 2, cleanupState: 'SETTLED' });
  assert.equal(owners, 1);
});
test('already cancelled embedding owner never starts the server', async () => {
  const c = new AbortController();
  c.abort();
  let starts = 0,
    owners = 0;
  const result = await runOwnedManagedMcpHost(
    {
      start: async () => {
        starts++;
      },
      completion: new Promise(() => {}),
      close: async () => settled,
    },
    () => {
      owners++;
      return settled;
    },
    c.signal,
  );
  assert.deepEqual(result, { exitCode: 2, cleanupState: 'SETTLED' });
  assert.equal(starts, 0);
  assert.equal(owners, 1);
});
for (const mode of ['unknown', 'rejected'])
  test('unconfirmed server close retains owner resources: ' + mode, async () => {
    let owners = 0;
    const result = await runOwnedManagedMcpHost(
      {
        start: async () => {},
        completion: Promise.resolve(unknown),
        close: async () => {
          if (mode === 'rejected') throw Error('private');
          return unknown;
        },
      },
      () => {
        owners++;
        return settled;
      },
      new AbortController().signal,
    );
    assert.deepEqual(result, { exitCode: 2, cleanupState: 'UNKNOWN' });
    assert.equal(owners, 0);
  });
for (const mode of ['unknown', 'rejected'])
  test('registered owner failure remains UNKNOWN without retry: ' + mode, async () => {
    let owners = 0;
    const result = await runOwnedManagedMcpHost(
      { start: async () => {}, completion: Promise.resolve(settled), close: async () => settled },
      () => {
        owners++;
        if (mode === 'rejected') throw Error('private');
        return unknown;
      },
      new AbortController().signal,
    );
    assert.deepEqual(result, { exitCode: 2, cleanupState: 'UNKNOWN' });
    assert.equal(owners, 1);
  });

test('acquisition producer rolls back its partial database before the registered Store is released', async () => {
  const store = new DatabaseSync(':memory:');
  let partial;
  const calls = [];
  const result = await acquireAndRunOwnedManagedMcpHost(
    async () => {
      partial = new DatabaseSync(':memory:');
      partial.exec('CREATE TABLE owned(value TEXT)');
      try {
        throw Error('controlled setup failure');
      } finally {
        partial.close();
        calls.push('producer-closed');
        throw new OwnedMcpAcquisitionFailure('SETTLED');
      }
    },
    () => {
      assert.equal(partial.isOpen, false);
      store.close();
      calls.push('store-closed');
      return settled;
    },
    new AbortController().signal,
  );
  assert.deepEqual(result, { exitCode: 2, cleanupState: 'SETTLED' });
  assert.equal(store.isOpen, false);
  assert.deepEqual(calls, ['producer-closed', 'store-closed']);
});
test('acquisition cancellation joins a late server, closes it without startup, then releases its owner', async () => {
  const c = new AbortController(),
    entered = deferred(),
    late = deferred(),
    closed = deferred();
  let starts = 0,
    closes = 0,
    owners = 0;
  const done = acquireAndRunOwnedManagedMcpHost(
    async (signal) => {
      assert.equal(signal, c.signal);
      entered.resolve();
      await late.promise;
      return {
        start: async () => {
          starts++;
        },
        completion: new Promise(() => {}),
        close: async () => {
          closes++;
          await closed.promise;
          return settled;
        },
      };
    },
    () => {
      owners++;
      return settled;
    },
    c.signal,
  );
  await entered.promise;
  c.abort();
  await new Promise((r) => setImmediate(r));
  assert.equal(owners, 0);
  assert.equal(closes, 0);
  late.resolve();
  await new Promise((r) => setImmediate(r));
  assert.equal(starts, 0);
  assert.equal(closes, 1);
  assert.equal(owners, 0);
  closed.resolve();
  assert.deepEqual(await done, { exitCode: 2, cleanupState: 'SETTLED' });
  assert.equal(owners, 1);
});
test('pre-cancelled acquisition does not call producer and settles already registered ownership once', async () => {
  const c = new AbortController();
  c.abort();
  let acquired = 0,
    owners = 0;
  const result = await acquireAndRunOwnedManagedMcpHost(
    async () => {
      acquired++;
      throw Error();
    },
    () => {
      owners++;
      return settled;
    },
    c.signal,
  );
  assert.deepEqual(result, { exitCode: 2, cleanupState: 'SETTLED' });
  assert.equal(acquired, 0);
  assert.equal(owners, 1);
});
for (const mode of ['unknown', 'unconfirmed'])
  test('unconfirmed producer rollback retains registered resources: ' + mode, async () => {
    let owners = 0;
    const result = await acquireAndRunOwnedManagedMcpHost(
      async () => {
        throw mode === 'unknown'
          ? new OwnedMcpAcquisitionFailure('UNKNOWN')
          : Error('unconfirmed rollback');
      },
      () => {
        owners++;
        return settled;
      },
      new AbortController().signal,
    );
    assert.deepEqual(result, { exitCode: 2, cleanupState: 'UNKNOWN' });
    assert.equal(owners, 0);
  });
test('acquisition refuses an arbitrary thenable without invoking it or releasing unconfirmed resources', async () => {
  let then = 0,
    owners = 0;
  const result = await acquireAndRunOwnedManagedMcpHost(
    () =>
      Object.defineProperty({}, 'then', {
        get() {
          then++;
          throw Error();
        },
      }),
    () => {
      owners++;
      return settled;
    },
    new AbortController().signal,
  );
  assert.deepEqual(result, { exitCode: 2, cleanupState: 'UNKNOWN' });
  assert.equal(then, 0);
  assert.equal(owners, 0);
});
for (const mode of ['unknown', 'rejected'])
  test(
    'confirmed producer rollback does not hide registered cleanup failure: ' + mode,
    async () => {
      let owners = 0;
      const result = await acquireAndRunOwnedManagedMcpHost(
        async () => {
          throw new OwnedMcpAcquisitionFailure('SETTLED');
        },
        () => {
          owners++;
          if (mode === 'rejected') throw Error();
          return unknown;
        },
        new AbortController().signal,
      );
      assert.deepEqual(result, { exitCode: 2, cleanupState: 'UNKNOWN' });
      assert.equal(owners, 1);
    },
  );
