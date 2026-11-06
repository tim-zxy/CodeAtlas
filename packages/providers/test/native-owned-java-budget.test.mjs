import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import owner, { executeNativeRequest } from '../dist/native-client.js';
import { beginMixedSourceAccount } from '../../storage/dist/analysis/mixed-source-account.js';
import { withMixedNativeTransportBudget } from '../../runtime/dist/mixed-native-transport-budget.js';
const base = JSON.parse(
  await fs.readFile(
    new URL('../../../fixtures/ipc/protocol-v2/valid/request.jsonl', import.meta.url),
    'utf8',
  ),
);
const recorded = await fs.readFile(
  new URL('../../../fixtures/ipc/protocol-v2/valid/events.jsonl', import.meta.url),
);
const ledger = (limits = {}) => ({
  limits: { maxSerializedBytes: 1024 * 1024, maxItems: 100000, maxDepth: 64, ...limits },
  budget: { serializedBytes: 0, items: 0 },
});
async function fixture(t, mode = 'single') {
  const original = cp.spawn,
    events = [];
  let calls = 0;
  cp.spawn = () => {
    calls++;
    events.push('spawn');
    const child = new EventEmitter();
    let closed = false;
    Object.assign(child, {
      pid: 12345,
      exitCode: null,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    const close = (code = 0, signal = null) => {
      if (closed) return;
      closed = true;
      child.exitCode = code;
      child.stdout.end();
      child.stderr.end();
      events.push('close');
      child.emit('exit', code, signal);
      child.emit('close', code, signal);
    };
    child.kill = () => {
      queueMicrotask(() => close(null, 'SIGTERM'));
      return true;
    };
    child.stdin = new Writable({
      write(_chunk, _encoding, cb) {
        cb();
      },
      final(cb) {
        cb();
        queueMicrotask(async () => {
          let bytes = mode === 'corrupt' ? Buffer.from('invalid\n') : recorded;
          if (mode === 'checksum') {
            const lines = recorded.toString().trim().split('\n'),
              last = JSON.parse(lines.pop());
            last.payload.integrityChecksum = 'sha256:' + '0'.repeat(64);
            bytes = Buffer.from([...lines, JSON.stringify(last)].join('\n') + '\n');
          }
          if (mode === 'fragmented')
            for (let i = 0; i < bytes.length && !closed; i += 32) {
              child.stdout.write(bytes.subarray(i, i + 32));
              await new Promise(setImmediate);
            }
          else child.stdout.write(bytes);
          if (!closed) {
            child.stdout.end();
            child.stderr.end();
            setImmediate(() => close());
          }
        });
      },
    });
    queueMicrotask(() => child.emit('spawn'));
    return child;
  };
  syncBuiltinESMExports();
  t.after(() => {
    cp.spawn = original;
    syncBuiltinESMExports();
  });
  const request = () => {
    const r = structuredClone(base);
    r.payload.deadlineEpochMs = Date.now() + 5000;
    return r;
  };
  const lifecycle = {
    async beforeSpawn(plan) {
      events.push('gate');
      assert.equal(owner.readOwnedNativeLaunchPlan(plan).role, 'V2');
      owner.claimOwnedNativeLaunchPlan(plan);
    },
    async beforeInput() {
      events.push('input');
    },
    async afterClose() {
      assert.ok(events.includes('close'));
      events.push('after');
    },
    async dispose() {
      events.push('dispose');
    },
  };
  return {
    events,
    calls: () => calls,
    run: (b) =>
      owner.executeOwnedJavaRequest(
        request(),
        { executablePath: process.execPath, timeoutMs: 2000 },
        lifecycle,
        b,
      ),
    publicRun: (extra = {}) =>
      executeNativeRequest(request(), {
        executablePath: process.execPath,
        timeoutMs: 2000,
        ...extra,
      }),
  };
}
test('private Java response shares original counters and preserves legacy result', async (t) => {
  const f = await fixture(t),
    b = ledger(),
    legacy = await f.run(),
    value = await f.run(b);
  assert.deepEqual(value.events, legacy.events);
  assert.deepEqual(value.terminal, legacy.terminal);
  assert.equal(value.stderr, legacy.stderr);
  assert.deepEqual(Object.keys(value), Object.keys(legacy));
  assert.ok(b.budget.serializedBytes > recorded.length);
  assert.ok(b.budget.items > 0);
  assert.equal(f.calls(), 2);
  assert.equal(f.events.filter((e) => e === 'dispose').length, 2);
});
test('private budget does not alter public Java v2 path', async (t) => {
  const f = await fixture(t),
    r = await f.publicRun();
  assert.equal(r.request.protocolVersion, 2);
  assert.equal(r.terminal.type, 'ANALYSIS_COMPLETED');
});
for (const dimension of ['bytes', 'items', 'depth'])
  test('Java response shared ' + dimension + ' exhaustion refuses without refund', async (t) => {
    const f = await fixture(t, 'fragmented'),
      b = ledger(
        dimension === 'bytes'
          ? { maxSerializedBytes: 256 }
          : dimension === 'items'
            ? { maxItems: 2 }
            : { maxDepth: 1 },
      );
    b.budget.serializedBytes = 1;
    b.budget.items = 1;
    await assert.rejects(f.run(b), (e) => e.code === 'OUTPUT_LIMIT_EXCEEDED');
    assert.ok(
      b.budget.serializedBytes >= 1 && b.budget.serializedBytes <= b.limits.maxSerializedBytes,
    );
    assert.ok(b.budget.items >= 1 && b.budget.items <= b.limits.maxItems);
    assert.ok(f.events.includes('close'));
    assert.ok(f.events.includes('dispose'));
  });
test('fragmented response pays actual repeated pending copies', async (t) => {
  const a = await fixture(t),
    one = ledger();
  await a.run(one);
  const b = await fixture(t, 'fragmented'),
    many = ledger();
  await b.run(many);
  assert.ok(many.budget.serializedBytes > one.budget.serializedBytes);
});
for (const kind of ['invalid', 'spent'])
  test('Java ' + kind + ' ledger refuses before spawn', async (t) => {
    const f = await fixture(t),
      b = ledger();
    if (kind === 'invalid') b.limits.maxItems = 0;
    else b.budget.serializedBytes = b.limits.maxSerializedBytes;
    await assert.rejects(
      f.run(b),
      (e) => e.code === (kind === 'invalid' ? 'INVALID_CONFIGURATION' : 'OUTPUT_LIMIT_EXCEEDED'),
    );
    assert.equal(f.calls(), 0);
  });
test('Java malformed response remains protocol refusal', async (t) => {
  const f = await fixture(t, 'corrupt'),
    b = ledger();
  await assert.rejects(f.run(b), (e) => e.code === 'PROTOCOL_VIOLATION');
  assert.ok(b.budget.serializedBytes > 0);
});
test('Java response debit returns to genuine History ledger even on failure', async (t) => {
  const f = await fixture(t, 'fragmented');
  const limits = {
    maxRows: 100000,
    maxItems: 100000,
    maxDepth: 64,
    maxSerializedBytes: 4096,
    memoryBudgetBytes: 4096,
  };
  // Existing Bridge owns the genuine account exclusively; no new limit/default policy.
  const account = beginMixedSourceAccount(limits, {
    signal: new AbortController().signal,
    deadlineEpochMs: Date.now() + 10000,
    maxInputBytes: 4096,
  });
  const start = account.budget.serializedBytes;
  try {
    await assert.rejects(withMixedNativeTransportBudget(account.budget, (b) => f.run(b)));
    assert.ok(account.budget.serializedBytes > start);
    assert.ok(account.budget.retainedLogicalBytes > 0);
  } finally {
    account.account.invalidate();
  }
});

test('shared Java ledger preserves checksum verification', async (t) => {
  const f = await fixture(t, 'checksum'),
    b = ledger();
  await assert.rejects(f.run(b), (e) => e.code === 'CHECKSUM_MISMATCH');
  assert.ok(b.budget.serializedBytes > 0);
});
test('response ledger remains a private argument, not a public option/export', async (t) => {
  const f = await fixture(t),
    unrecognized = ledger({ maxItems: 0 });
  // Existing public option policy ignores unrelated keys; do not make it stricter here.
  const result = await f.publicRun({ responseBudget: unrecognized });
  assert.equal(result.terminal.type, 'ANALYSIS_COMPLETED');
  assert.equal(f.calls(), 1);
  assert.deepEqual(unrecognized.budget, { serializedBytes: 0, items: 0 });
  assert.equal((await import('../dist/index.js')).executeOwnedJavaRequest, undefined);
});
