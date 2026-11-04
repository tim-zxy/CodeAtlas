import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { instantiateProducerCase } from './fixtures/code-syntax-producer-helpers.mjs';
let api = {};
try {
  api = await import('../dist/native-code-syntax-client.js');
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
const error = (c) => (e) => e.code === c;
async function harness(t, mode = 'success', provided) {
  const input = provided ?? (await instantiateProducerCase('no-files', '/fixture/producer'));
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
    run: (lifecycle, options = {}) =>
      api.default(
        input.requestBytes,
        { executablePath: process.execPath, timeoutMs: 1000, ...options },
        lifecycle,
      ),
  };
}
test('AR private v5 client exists without public export', async () => {
  assert.equal(typeof api.default, 'function');
  assert.equal((await import('../dist/index.js')).observeOwnedCodeSyntax, undefined);
});
test('AR sends no input before lifecycle ready and returns the original byte streams', async (t) => {
  const h = await harness(t);
  let release;
  const ready = new Promise((r) => (release = r));
  const pending = h.run({
    async beforeInput(child) {
      h.events.push('beforeInput');
      assert.equal(child.pid, h.child.pid);
      await ready;
    },
    async afterClose() {
      assert.ok(h.events.includes('close'));
      h.events.push('afterClose');
    },
    async dispose() {
      h.events.push('dispose');
    },
  });
  await new Promise(setImmediate);
  assert.equal(h.writes.length, 0);
  release();
  const result = await pending;
  assert.deepEqual(result.requestBytes, h.input.requestBytes);
  assert.deepEqual(result.outputBytes, h.input.expectedOutputBytes);
  assert.deepEqual(Buffer.concat(h.writes), h.input.requestBytes);
  assert.deepEqual(h.events, ['spawn', 'beforeInput', 'stdin', 'close', 'afterClose', 'dispose']);
});
for (const kind of ['reject-ready', 'cancel-ready', 'exit-ready', 'timeout-ready'])
  test('AR ' + kind + ' never sends input and always disposes', async (t) => {
    const h = await harness(t),
      c = new AbortController();
    let dispose = 0,
      after = 0;
    const l = {
      async beforeInput(child, signal) {
        if (kind === 'reject-ready') throw Error('REDACTED');
        if (kind === 'exit-ready') {
          h.close(0);
          await new Promise((r) =>
            signal.aborted ? r() : signal.addEventListener('abort', r, { once: true }),
          );
          return;
        }
        if (kind === 'cancel-ready') queueMicrotask(() => c.abort());
        await new Promise((r) =>
          signal.aborted ? r() : signal.addEventListener('abort', r, { once: true }),
        );
      },
      async afterClose() {
        after++;
      },
      async dispose() {
        dispose++;
      },
    };
    await assert.rejects(
      h.run(l, { signal: c.signal, timeoutMs: kind === 'timeout-ready' ? 20 : 1000 }),
      error(
        kind === 'cancel-ready'
          ? 'CANCELLED'
          : kind === 'timeout-ready'
            ? 'TIMEOUT'
            : 'PROCESS_FAILED',
      ),
    );
    assert.equal(h.writes.length, 0);
    assert.equal(dispose, 1);
    assert.equal(after, 1);
    assert.ok(h.events.includes('close'));
  });
test('AR a protocol failure still closes and disposes before refusing', async (t) => {
  const h = await harness(t, 'corrupt');
  let dispose = 0;
  await assert.rejects(
    h.run({
      async beforeInput() {},
      async afterClose() {},
      async dispose() {
        dispose++;
      },
    }),
  );
  assert.equal(dispose, 1);
  assert.ok(h.events.includes('close'));
});
for (const method of ['afterClose', 'dispose'])
  test('AR ' + method + ' failure cannot return success', async (t) => {
    const h = await harness(t),
      l = { async beforeInput() {}, async afterClose() {}, async dispose() {} };
    l[method] = async () => {
      throw Error('secret callback payload');
    };
    await assert.rejects(h.run(l), (e) => {
      assert.equal(e.code, 'PROCESS_FAILED');
      assert.ok(!e.message.includes('secret'));
      return true;
    });
  });
test('AR null lifecycle keeps the direct private process path', async (t) => {
  const h = await harness(t);
  const result = await h.run(null);
  assert.deepEqual(result.outputBytes, h.input.expectedOutputBytes);
  assert.equal(h.writes.length, 1);
});
test('AR pre-abort and public lifecycle option are rejected before spawn', async (t) => {
  const h = await harness(t),
    c = new AbortController();
  c.abort();
  await assert.rejects(h.run(null, { signal: c.signal }), error('CANCELLED'));
  assert.equal(h.events.length, 0);
  await assert.rejects(h.run(null, { lifecycle: {} }), error('INVALID_CONFIGURATION'));
  assert.equal(h.events.length, 0);
});

test('AR lowered caller byte limits cannot return a complete stream', async (t) => {
  const h = await harness(t);
  await assert.rejects(h.run(null, { limits: { maxStdoutBytes: 1 } }));
});

test('AR input cap refuses before request snapshot allocation', async (t) => {
  const h = await harness(t),
    alloc = Buffer.alloc;
  let copies = 0;
  Buffer.alloc = function (n, ...args) {
    if (n >= h.input.requestBytes.length) copies++;
    return alloc(n, ...args);
  };
  try {
    await assert.rejects(
      h.run(null, { limits: { maxStdinBytes: 1 } }),
      error('OUTPUT_LIMIT_EXCEEDED'),
    );
    assert.equal(copies, 0);
    assert.equal(h.events.length, 0);
  } finally {
    Buffer.alloc = alloc;
  }
});
test('AR rejects proxy argument arrays without invoking traps', async (t) => {
  const h = await harness(t);
  let touched = 0;
  await assert.rejects(
    h.run(null, {
      arguments: new Proxy([], {
        get() {
          touched++;
          throw Error('trap');
        },
      }),
    }),
    error('INVALID_CONFIGURATION'),
  );
  assert.equal(touched, 0);
  assert.equal(h.events.length, 0);
});
for (const version of [1, 3, 4])
  test(
    'AR legacy v' + version + ' uses the unchanged no-hook path with a fixed double',
    async (t) => {
      const read = async (name) => readFile(new URL('../../../fixtures/' + name, import.meta.url));
      let request, output;
      if (version === 1) {
        request = JSON.parse(await read('ipc/protocol-v1/describe-v1/request.jsonl'));
        output = await read('ipc/protocol-v1/describe-v1/events.jsonl');
      }
      if (version === 3) {
        request = JSON.parse(await read('ipc/analysis-v3/cases.json')).cases.find(
          (c) => c.id === 'valid-empty',
        ).request;
        output = await read('ipc/analysis-v3/valid-empty.jsonl');
      }
      if (version === 4) {
        request = JSON.parse(await read('phase1/syntax-budget-contract/inputs/java-request.json'));
        output = await read('phase1/syntax-budget-contract/inputs/java-events.jsonl');
      }
      const h = await harness(t, 'success', {
          requestBytes: Buffer.from(JSON.stringify(request) + '\n'),
          expectedOutputBytes: output,
        }),
        pub = await import('../dist/index.js');
      const options = { executablePath: process.execPath, timeoutMs: 2000 };
      if (version === 1)
        assert.equal(
          (await pub.executeNativeRequest(request, options)).terminal.type,
          'DESCRIBE_COMPLETED',
        );
      if (version === 3) {
        const accepted = [];
        const result = await pub.streamNativeFullAnalysisV3(request, options, {
          async accept(e) {
            accepted.push(e.type);
          },
        });
        assert.equal(result.terminal.type, 'ANALYSIS_COMPLETED');
        assert.ok(accepted.includes('ANALYSIS_SUMMARY'));
        assert.equal(Buffer.concat(h.writes).toString().trim().split('\n').length, 2);
      }
      if (version === 4) {
        const p = structuredClone(request.payload);
        delete p.ownerBinding.ownerMapDigest;
        const capturedContext = {
          expectedActivationBasis: p.expectedActivationBasis,
          targetSource: p.targetSource,
          ownerBinding: p.ownerBinding,
          providerId: p.providerId,
          providerSnapshotId: p.providerSnapshotId,
          sourceFiles: p.sourceFiles,
          owners: p.owners,
        };
        assert.equal(
          (await pub.observeNativeSyntax(request, { capturedContext, options })).outcome,
          'SUCCEEDED',
        );
      }
      assert.ok(h.events.includes('stdin'));
      assert.ok(h.events.includes('close'));
      assert.ok(!h.events.includes('beforeInput'));
    },
  );

test('AR private owner aliases never appear in the package facade', async () => {
  const pub = await import('../dist/index.js');
  for (const key of ['runOwnedNativeProcess', 'validateOwnedNativeOptions', 'ownedNativeTimeout'])
    assert.equal(pub[key], undefined);
});

test('AR stderr overflow during preparation writes no input and disposes after close', async (t) => {
  const h = await harness(t, 'no-output');
  const events = [];
  await assert.rejects(
    h.run(
      {
        async beforeInput(_child, signal) {
          h.child.stderr.write('xx');
          await new Promise((r) =>
            signal.aborted ? r() : signal.addEventListener('abort', r, { once: true }),
          );
        },
        async afterClose() {
          assert.ok(h.events.includes('close'));
          events.push('afterClose');
        },
        async dispose() {
          events.push('dispose');
        },
      },
      { limits: { maxStderrBytes: 1 } },
    ),
    error('OUTPUT_LIMIT_EXCEEDED'),
  );
  assert.equal(h.writes.length, 0);
  assert.deepEqual(events, ['afterClose', 'dispose']);
});
for (const mode of ['throw', 'error-event'])
  test(
    'AR startup ' + mode + ' preserves unavailable failure and disposes exactly once',
    async (t) => {
      const h = await harness(t, 'no-output');
      let before = 0,
        after = 0,
        dispose = 0;
      cp.spawn = () => {
        if (mode === 'throw') throw Error('private launch payload');
        queueMicrotask(() => h.child.emit('error', Error('private launch payload')));
        return h.child;
      };
      syncBuiltinESMExports();
      await assert.rejects(
        h.run({
          async beforeInput() {
            before++;
          },
          async afterClose() {
            after++;
          },
          async dispose() {
            dispose++;
            throw Error('private cleanup payload');
          },
        }),
        error('PROVIDER_UNAVAILABLE'),
      );
      assert.equal(before, 0);
      assert.equal(after, mode === 'throw' ? 0 : 1);
      assert.equal(dispose, 1);
      assert.equal(h.writes.length, 0);
    },
  );
