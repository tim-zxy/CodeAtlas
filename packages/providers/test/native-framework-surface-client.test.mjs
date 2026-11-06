import { createMixedNativePreparedRegistration } from '../../../scripts/mixed-native-prepared-registration.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { readSurfaceCapture } from '../../../fixtures/phase1/syntax-contract/surface-closure/corpus.mjs';
const budget = () => ({
  limits: {
    maxSerializedBytes: Number.MAX_SAFE_INTEGER,
    maxItems: Number.MAX_SAFE_INTEGER,
    maxDepth: Number.MAX_SAFE_INTEGER,
  },
  budget: { serializedBytes: 0, items: 0 },
});
let api = {};
try {
  api = await import('../dist/native-framework-surface-client.js');
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
const error = (c) => (e) => e.code === c;
async function harness(t, mode = 'success', provided) {
  const input =
    provided ??
    (() => {
      const raw = readSurfaceCapture('P5').syntax;
      return { requestBytes: raw.request, expectedOutputBytes: raw.output };
    })();
  const original = cp.spawn,
    events = [],
    writes = [],
    child = new EventEmitter();
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
    write(chunk, enc, done) {
      writes.push(Buffer.from(chunk));
      events.push('stdin');
      done();
    },
    final(done) {
      done();
      if (mode !== 'no-output')
        queueMicrotask(() => {
          child.stdout.end(mode === 'corrupt' ? Buffer.from('bad\n') : input.expectedOutputBytes);
          child.stderr.end();
          setImmediate(() => close());
        });
    },
  });
  cp.spawn = (file, args, options) => {
    // Simulate Node's own normalization on its private dictionary, not a process.
    if (mode === 'normalize-owned-env') options.env.FIXTURE_NORMALIZED = 'yes';
    assert.equal(options.shell, false);
    assert.equal(options.windowsHide, true);
    assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
    events.push('spawn');
    queueMicrotask(() => child.emit('spawn'));
    return child;
  };
  syncBuiltinESMExports();
  const keep = setTimeout(() => close(9), 3000);
  t.after(() => {
    clearTimeout(keep);
    cp.spawn = original;
    syncBuiltinESMExports();
  });
  return {
    input,
    events,
    writes,
    child,
    close,
    run: (lifecycle, options = {}, ledger = budget()) =>
      api.default(
        input.requestBytes,
        { executablePath: process.execPath, timeoutMs: 1000, ...options },
        lifecycle,
        ledger,
      ),
  };
}

test('wire8 owned private transport exists without public routing', async () => {
  assert.equal(typeof api.default, 'function');
  assert.equal((await import('../dist/index.js')).observeOwnedFrameworkSurface, undefined);
});
test('wire8 exact retained bytes and shared ledger follow owned lifecycle gates', async (t) => {
  const h = await harness(t),
    ledger = budget();
  let release;
  const ready = new Promise((r) => (release = r));
  const pending = h.run(
    {
      async beforeInput() {
        h.events.push('beforeInput');
        await ready;
      },
      async afterClose() {
        assert.ok(h.events.includes('close'));
        h.events.push('afterClose');
      },
      async dispose() {
        h.events.push('dispose');
      },
    },
    {},
    ledger,
  );
  await new Promise(setImmediate);
  assert.equal(h.writes.length, 0);
  release();
  const result = await pending;
  assert.deepEqual(result.requestBytes, h.input.requestBytes);
  assert.deepEqual(result.outputBytes, h.input.expectedOutputBytes);
  assert.deepEqual(Buffer.concat(h.writes), h.input.requestBytes);
  assert.equal(result.observation.request.protocolVersion, 8);
  assert.deepEqual(h.events, ['spawn', 'beforeInput', 'stdin', 'close', 'afterClose', 'dispose']);
  assert.ok(ledger.budget.serializedBytes > result.requestBytes.length + result.outputBytes.length);
  assert.ok(ledger.budget.items > 0);
});
for (const kind of ['reject-ready', 'cancel-ready', 'timeout-ready'])
  test('wire8 ' + kind + ' sends no input and disposes', async (t) => {
    const h = await harness(t),
      controller = new AbortController();
    let disposed = 0;
    await assert.rejects(
      h.run(
        {
          async beforeInput(_child, signal) {
            if (kind === 'reject-ready') throw Error('fixture');
            if (kind === 'cancel-ready') queueMicrotask(() => controller.abort());
            await new Promise((r) =>
              signal.aborted ? r() : signal.addEventListener('abort', r, { once: true }),
            );
          },
          async afterClose() {},
          async dispose() {
            disposed++;
          },
        },
        { signal: controller.signal, timeoutMs: kind === 'timeout-ready' ? 20 : 1000 },
      ),
      error(
        kind === 'cancel-ready'
          ? 'CANCELLED'
          : kind === 'timeout-ready'
            ? 'TIMEOUT'
            : 'PROCESS_FAILED',
      ),
    );
    assert.equal(h.writes.length, 0);
    assert.equal(disposed, 1);
  });
test('wire8 corrupt output fails after close and retains consumed ledger charges', async (t) => {
  const h = await harness(t, 'corrupt'),
    ledger = budget();
  let disposed = 0;
  await assert.rejects(
    h.run(
      {
        async beforeInput() {},
        async afterClose() {},
        async dispose() {
          disposed++;
        },
      },
      {},
      ledger,
    ),
  );
  assert.equal(disposed, 1);
  assert.ok(h.events.includes('close'));
  assert.ok(ledger.budget.serializedBytes > h.input.requestBytes.length);
});
for (const kind of ['missing-ledger', 'tiny-ledger', 'wrong-wire', 'option-getter'])
  test('wire8 ' + kind + ' is rejected before spawn', async (t) => {
    const h = await harness(t);
    let ledger = budget(),
      options = {};
    if (kind === 'missing-ledger') ledger = null;
    if (kind === 'tiny-ledger') ledger.limits.maxSerializedBytes = 1;
    if (kind === 'wrong-wire') {
      const r = JSON.parse(h.input.requestBytes);
      r.protocolVersion = 5;
      h.input.requestBytes = Buffer.from(JSON.stringify(r) + '\n');
    }
    if (kind === 'option-getter')
      Object.defineProperty(options, 'timeoutMs', {
        enumerable: true,
        get() {
          throw Error('getter must not run');
        },
      });
    // Pass getter-bearing options directly, without spreading them in the harness.
    const call =
      kind === 'option-getter'
        ? () => api.default(h.input.requestBytes, options, null, ledger)
        : () => h.run(null, options, ledger);
    await assert.rejects(call());
    assert.deepEqual(h.events, []);
    assert.equal(h.writes.length, 0);
  });

test('wire8 before-spawn plan cannot masquerade as an approved V5 registrar role', async (t) => {
  const h = await harness(t);
  const owner = (await import('../dist/native-client.js')).default;
  let prepared = false;
  const result = await h.run({
    async beforeSpawn(plan) {
      assert.equal(owner.readOwnedNativeLaunchPlan(plan).role, 'SURFACE_V8');
      const { stdinSha256, ...command } = plan;
      const old = createMixedNativePreparedRegistration({
        contextSha256: 'a'.repeat(64),
        slots: [{ launchId: 'legacy', role: 'V5', imageSha256: 'b'.repeat(64), command }],
      });
      assert.throws(() => old.prepare(plan), error('INVALID_MIXED_NATIVE_PREPARED_REGISTRATION'));
      prepared = true;
    },
    async beforeInput() {
      assert.equal(prepared, true);
    },
    async afterClose() {},
    async dispose() {},
  });
  assert.equal(result.observation.request.protocolVersion, 8);
});
