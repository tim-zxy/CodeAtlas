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

// All launches below are intercepted by harness's in-process EventEmitter double.
test('AR beforeSpawn settles before any process exists and binds frozen spawn inputs', async (t) => {
  const h = await harness(t);
  let release;
  const ready = new Promise((r) => (release = r));
  let plan;
  const pending = h
    .run({
      async beforeSpawn(p) {
        plan = p;
        h.events.push('beforeSpawn');
        await ready;
      },
      async beforeInput() {
        h.events.push('beforeInput');
      },
      async afterClose() {
        h.events.push('afterClose');
      },
      async dispose() {
        h.events.push('dispose');
      },
    })
    .catch((e) => e);
  await new Promise(setImmediate);
  assert.deepEqual(h.events, ['beforeSpawn']);
  assert.equal(h.writes.length, 0);
  assert.ok(
    Object.isFrozen(plan) && Object.isFrozen(plan.arguments) && Object.isFrozen(plan.environment),
  );
  assert.equal(plan.executablePath, process.execPath);
  assert.match(plan.stdinSha256, /^[a-f0-9]{64}$/);
  release();
  const result = await pending;
  assert.ok(!(result instanceof Error));
  assert.deepEqual(h.events, [
    'beforeSpawn',
    'spawn',
    'beforeInput',
    'stdin',
    'close',
    'afterClose',
    'dispose',
  ]);
});
for (const mode of ['reject', 'cancel', 'timeout'])
  test('AR beforeSpawn ' + mode + ' has zero spawn and exactly one dispose', async (t) => {
    const h = await harness(t),
      c = new AbortController();
    let before = 0,
      after = 0,
      disposed = 0;
    const pending = h.run(
      {
        async beforeSpawn(_plan, signal) {
          if (mode === 'reject') throw Error('SENSITIVE_SENTINEL');
          await new Promise((r) =>
            signal.aborted ? r() : signal.addEventListener('abort', r, { once: true }),
          );
        },
        async beforeInput() {
          before++;
        },
        async afterClose() {
          after++;
        },
        async dispose() {
          disposed++;
        },
      },
      { signal: c.signal, timeoutMs: mode === 'timeout' ? 25 : 1000 },
    );
    if (mode === 'cancel') setImmediate(() => c.abort());
    await assert.rejects(
      pending,
      error(mode === 'cancel' ? 'CANCELLED' : mode === 'timeout' ? 'TIMEOUT' : 'PROCESS_FAILED'),
    );
    assert.equal(h.events.includes('spawn'), false);
    assert.equal(h.writes.length, 0);
    assert.equal(before, 0);
    assert.equal(after, 0);
    assert.equal(disposed, 1);
  });
test('AR legacy lifecycle callbacks still have no pre-spawn requirement', async (t) => {
  const h = await harness(t);
  await h.run({ async beforeInput() {}, async afterClose() {}, async dispose() {} });
  assert.equal(h.events[0], 'spawn');
});

async function boundedOutcome(p) {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((_r, j) => (timer = setTimeout(() => j(Error('UNBOUNDED_GUARD')), 200))),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
for (const stage of ['afterClose', 'dispose'])
  test('AR qualified hanging ' + stage + ' cannot outlive invocation deadline', async (t) => {
    const h = await harness(t);
    let disposed = 0;
    await assert.rejects(
      boundedOutcome(
        h.run(
          {
            async beforeSpawn() {},
            async beforeInput() {},
            async afterClose() {
              if (stage === 'afterClose') await new Promise(() => {});
            },
            async dispose() {
              disposed++;
              if (stage === 'dispose') await new Promise(() => {});
            },
          },
          { timeoutMs: 30 },
        ),
      ),
      error('TIMEOUT'),
    );
    assert.equal(disposed, 1);
  });
test('AR pre-spawn refusal with hanging dispose remains bounded and preserves failure', async (t) => {
  const h = await harness(t);
  let disposed = 0;
  await assert.rejects(
    boundedOutcome(
      h.run(
        {
          async beforeSpawn() {
            throw Error('private refusal');
          },
          async beforeInput() {},
          async afterClose() {},
          async dispose() {
            disposed++;
            await new Promise(() => {});
          },
        },
        { timeoutMs: 30 },
      ),
    ),
    error('PROCESS_FAILED'),
  );
  assert.equal(disposed, 1);
  assert.equal(h.events.includes('spawn'), false);
});
test('AR synthetic Windows clear dictionary composes with binding digest without host values', async () => {
  const owner = (await import('../dist/native-client.js')).default,
    { hashMixedNativeLaunch } = await import('../../../scripts/mixed-native-launch-handshake.mjs');
  assert.equal(typeof owner.buildOwnedNativeEnvironment, 'function');
  const env = owner.buildOwnedNativeEnvironment({ SYSTEMROOT: 'FIXED_ROOT' }, [
    'ProgramFiles(x86)',
    'CommonProgramFiles(x86)',
    'SystemRoot',
    'SYSTEMROOT',
  ]);
  const expected = Object.fromEntries(
    [
      'HOMEDRIVE',
      'HOMEPATH',
      'LOGONSERVER',
      'PATH',
      'SYSTEMDRIVE',
      'SYSTEMROOT',
      'TEMP',
      'USERDOMAIN',
      'USERNAME',
      'USERPROFILE',
      'WINDIR',
      'NODE_V8_COVERAGE',
    ].map((k) => [k, '']),
  );
  Object.assign(expected, {
    'PROGRAMFILES(X86)': '',
    'COMMONPROGRAMFILES(X86)': '',
    SYSTEMROOT: 'FIXED_ROOT',
  });
  assert.deepEqual(env, expected);
  assert.ok(Object.isFrozen(env));
  assert.match(
    hashMixedNativeLaunch({
      executablePath: process.execPath,
      arguments: [],
      environment: env,
      cwd: process.cwd(),
      stdinSha256: '1'.repeat(64),
    }),
    /^[a-f0-9]{64}$/,
  );
});

test('AR qualified hanging beforeInput is bounded even when callback ignores abort', async (t) => {
  const h = await harness(t);
  let disposed = 0,
    entered = 0;
  const now = Date.now,
    preparationEpoch = now();
  // Select the beforeInput phase regardless of host preparation scheduling.
  t.mock.method(Date, 'now', () => (entered ? now() : preparationEpoch));
  await assert.rejects(
    boundedOutcome(
      h.run(
        {
          async beforeSpawn() {},
          async beforeInput() {
            entered++;
            await new Promise(() => {});
          },
          async afterClose() {},
          async dispose() {
            disposed++;
          },
        },
        { timeoutMs: 30 },
      ),
    ),
    (e) => e.code === 'TIMEOUT' && e.cleanupState === 'UNKNOWN',
  );
  assert.equal(entered, 1);
  assert.equal(disposed, 1);
  assert.equal(h.writes.length, 0);
});
test('AR stderr attachment preserves unknown cleanup evidence', async (t) => {
  const h = await harness(t);
  let disposed = 0;
  await assert.rejects(
    boundedOutcome(
      h.run(
        {
          async beforeSpawn() {},
          async beforeInput() {
            h.child.stderr.write('fixture diagnostic');
          },
          async afterClose() {
            await new Promise(() => {});
          },
          async dispose() {
            disposed++;
          },
        },
        { timeoutMs: 30 },
      ),
    ),
    (e) =>
      e.code === 'TIMEOUT' && e.cleanupState === 'UNKNOWN' && e.stderr === 'fixture diagnostic',
  );
  assert.equal(disposed, 1);
});

test('AR late READY after deadline cannot cause a delayed spawn', async (t) => {
  const h = await harness(t);
  let disposed = 0;
  await assert.rejects(
    boundedOutcome(
      h.run(
        {
          async beforeSpawn() {
            await new Promise((r) => setTimeout(r, 60));
          },
          async beforeInput() {},
          async afterClose() {},
          async dispose() {
            disposed++;
          },
        },
        { timeoutMs: 20 },
      ),
    ),
    error('TIMEOUT'),
  );
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(h.events.includes('spawn'), false);
  assert.equal(h.writes.length, 0);
  assert.equal(disposed, 1);
});

for (const stage of ['beforeSpawn', 'afterClose', 'dispose'])
  test('AR frozen ' + stage + ' failure preserves primary and still disposes once', async (t) => {
    const h = await harness(t),
      { NativeClientError } = await import('../dist/native-client.js'),
      frozen = Object.freeze(new NativeClientError('PROCESS_FAILED', 'fixture frozen'));
    let disposed = 0;
    await assert.rejects(
      h.run({
        async beforeSpawn() {
          if (stage === 'beforeSpawn') throw frozen;
        },
        async beforeInput() {},
        async afterClose() {
          if (stage === 'afterClose') throw frozen;
        },
        async dispose() {
          disposed++;
          if (stage !== 'afterClose') throw frozen;
        },
      }),
      (e) => e.code === 'PROCESS_FAILED' && e.cleanupState === 'UNKNOWN',
    );
    assert.equal(disposed, 1);
  });

test('AR actual private owner plan composes with the fixed offline handshake', async (t) => {
  const h = await harness(t),
    { createMixedNativeLaunchSession, hashMixedNativeLaunch } =
      await import('../../../scripts/mixed-native-launch-handshake.mjs');
  let session, lifecycle;
  const messages = [];
  // Derived bindings here test API coupling only; they are not independent run approval.
  await h.run({
    async beforeSpawn(plan, signal) {
      session = createMixedNativeLaunchSession(
        [
          {
            launchId: 'fixture-v5',
            role: 'V5',
            commandSha256: hashMixedNativeLaunch(plan),
            imageSha256: 'a'.repeat(64),
          },
        ],
        async (m) => {
          messages.push(m.type);
          if (m.type === 'INTENT')
            return {
              type: 'READY',
              launchId: m.launchId,
              role: 'V5',
              commandSha256: m.commandSha256,
            };
          if (m.type === 'SPAWNED')
            return {
              type: 'ACQUIRED',
              launchId: m.launchId,
              role: 'V5',
              pid: h.child.pid,
              imageSha256: 'a'.repeat(64),
              creationIdentity: 'fixture-instance',
              parentOwned: true,
            };
          if (m.type === 'CLOSED')
            return {
              type: 'RELEASED',
              launchId: m.launchId,
              pid: h.child.pid,
              imageSha256: 'a'.repeat(64),
              creationIdentity: 'fixture-instance',
              osExited: true,
              handleReleased: true,
              unknownDescendants: false,
              cleanupComplete: true,
              queryStatus: 'RECORDED',
              peakWorkingSetBytes: 1024,
            };
          assert.fail('unexpected fixture message');
        },
      );
      lifecycle = session.take('V5');
      await lifecycle.beforeSpawn(plan, signal);
    },
    async beforeInput(child, signal) {
      await lifecycle.beforeInput(child, signal);
    },
    async afterClose(close, signal) {
      await lifecycle.afterClose(close, signal);
    },
    async dispose(signal) {
      await lifecycle.dispose(signal);
    },
  });
  assert.deepEqual(messages, ['INTENT', 'SPAWNED', 'CLOSED']);
  assert.equal(session.status().executionAuthorized, false);
  assert.equal(session.status().measurementEligible, false);
  assert.deepEqual(Buffer.concat(h.writes), h.input.requestBytes);
});

test('AR fixed clear dictionary covers required variables absent at capture time', async () => {
  const owner = (await import('../dist/native-client.js')).default,
    env = owner.buildOwnedNativeEnvironment({}, []),
    required = [
      'HOMEDRIVE',
      'HOMEPATH',
      'LOGONSERVER',
      'PATH',
      'SYSTEMDRIVE',
      'SYSTEMROOT',
      'TEMP',
      'USERDOMAIN',
      'USERNAME',
      'USERPROFILE',
      'WINDIR',
    ];
  const simulatedLaterParent = Object.fromEntries(required.map((k) => [k, 'FAKE_LATE_HOST_VALUE'])),
    consumed = { ...env };
  for (const key of required)
    if (!Object.hasOwn(consumed, key)) consumed[key] = simulatedLaterParent[key];
  for (const key of required) assert.equal(consumed[key], '');
  assert.equal(env.NODE_V8_COVERAGE, '');
});

test('AR legacy owner preserves Node normalization of its own environment dictionary', async (t) => {
  const h = await harness(t, 'normalize-owned-env');
  const result = await h.run(null);
  assert.deepEqual(result.outputBytes, h.input.expectedOutputBytes);
  assert.deepEqual(Buffer.concat(h.writes), h.input.requestBytes);
});
for (const outcome of ['success', 'reject', 'timeout', 'cancel'])
  test('prepared Native owner origin is active only inside the gate: ' + outcome, async (t) => {
    const h = await harness(t),
      owner = (await import('../dist/native-client.js')).default;
    assert.equal(typeof owner.readOwnedNativeLaunchPlan, 'function');
    let captured,
      lateRejected = false;
    const c = new AbortController();
    const invalid = (v) => assert.throws(() => owner.readOwnedNativeLaunchPlan(v));
    const running = h.run(
      {
        async beforeSpawn(plan, signal) {
          captured = plan;
          const proof = owner.readOwnedNativeLaunchPlan(plan);
          assert.equal(proof.role, 'V5');
          assert.equal(proof.plan, plan);
          assert.ok(Object.isFrozen(proof));
          assert.equal(owner.claimOwnedNativeLaunchPlan(plan).plan, plan);
          assert.throws(() => owner.claimOwnedNativeLaunchPlan(plan));
          assert.equal(owner.readOwnedNativeLaunchPlan(plan).plan, plan);
          invalid({ ...plan });
          invalid(structuredClone(plan));
          invalid(new Proxy(plan, {}));
          const { createHash } = await import('node:crypto');
          assert.equal(
            plan.stdinSha256,
            createHash('sha256').update(h.input.requestBytes).digest('hex'),
          );
          if (outcome === 'reject') throw Error('fixture stop');
          if (outcome === 'cancel') {
            c.abort();
            await new Promise(setImmediate);
          }
          if (outcome === 'timeout') {
            await new Promise((r) => setTimeout(r, 60));
            try {
              owner.readOwnedNativeLaunchPlan(plan);
            } catch {
              lateRejected = true;
            }
          }
        },
        async beforeInput() {
          invalid(captured);
        },
        async afterClose() {
          invalid(captured);
        },
        async dispose() {
          if (captured) invalid(captured);
        },
      },
      { signal: c.signal, timeoutMs: outcome === 'timeout' ? 20 : 1000 },
    );
    if (outcome === 'success') await running;
    else await assert.rejects(running);
    invalid(captured);
    if (outcome === 'timeout') {
      await new Promise((r) => setTimeout(r, 70));
      assert.equal(lateRejected, true);
    }
    if (outcome !== 'success') assert.equal(h.events.includes('spawn'), false);
    assert.equal((await import('../dist/index.js')).readOwnedNativeLaunchPlan, undefined);
  });

test('prepared Native owner classifies the validated private Java v2 gate', async (t) => {
  const h = await harness(t),
    owner = (await import('../dist/native-client.js')).default;
  assert.equal(typeof owner.readOwnedNativeLaunchPlan, 'function');
  const request = JSON.parse(
    await readFile(
      new URL(
        '../../../fixtures/ipc/protocol-v1/analyze-java-basic-v1/request.jsonl',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  request.protocolVersion = 2;
  request.payload.deadlineEpochMs = Date.now() + 2000;
  let captured;
  await assert.rejects(
    owner.executeOwnedJavaRequest(
      request,
      { executablePath: process.execPath, timeoutMs: 1000 },
      {
        async beforeSpawn(plan) {
          captured = plan;
          assert.equal(owner.readOwnedNativeLaunchPlan(plan).role, 'V2');
          throw Error('fixture no spawn');
        },
        async beforeInput() {},
        async afterClose() {},
        async dispose() {
          if (captured) assert.throws(() => owner.readOwnedNativeLaunchPlan(captured));
        },
      },
    ),
  );
  assert.ok(captured);
  assert.equal(h.events.includes('spawn'), false);
  assert.throws(() => owner.readOwnedNativeLaunchPlan(captured));
});

test('prepared registration binds a genuine dynamic Native plan to static constraints once', async (t) => {
  const h = await harness(t),
    owner = (await import('../dist/native-client.js')).default;
  const { createMixedNativePreparedRegistration } =
    await import('../../../scripts/mixed-native-prepared-registration.mjs');
  assert.equal(typeof createMixedNativePreparedRegistration, 'function');
  const command = {
    executablePath: process.execPath,
    arguments: [],
    environment: owner.buildOwnedNativeEnvironment(
      {},
      process.platform === 'win32' ? Object.keys(process.env) : [],
    ),
    cwd: process.cwd(),
  };
  const registry = createMixedNativePreparedRegistration({
    contextSha256: 'a'.repeat(64),
    slots: [{ launchId: 'dynamic-v5', role: 'V5', imageSha256: 'b'.repeat(64), command }],
  });
  const { hashMixedNativeLaunch } =
    await import('../../../scripts/mixed-native-launch-handshake.mjs');
  let receipt;
  await assert.rejects(
    h.run({
      async beforeSpawn(plan) {
        const ticket = registry.prepare(plan);
        assert.deepEqual(Object.keys(ticket), []);
        receipt = registry.consume(ticket);
        assert.equal(receipt.binding.commandSha256, hashMixedNativeLaunch(plan));
        assert.equal(receipt.binding.role, 'V5');
        assert.equal(receipt.executionAuthorized, false);
        assert.equal(receipt.registrationAuthority, false);
        assert.equal(receipt.contextAuthenticated, false);
        assert.equal(receipt.liveTransportConnected, false);
        assert.ok(Object.isFrozen(receipt) && Object.isFrozen(receipt.binding));
        assert.throws(() => registry.consume(ticket));
        throw Error('fixture registration review only');
      },
      async beforeInput() {},
      async afterClose() {},
      async dispose() {},
    }),
  );
  assert.ok(receipt);
  assert.equal(registry.status().status, 'FAILED');
  assert.equal(h.events.includes('spawn'), false);
});

for (const variant of [
  'plain',
  'clone-ticket',
  'proxy-ticket',
  'static-env',
  'role',
  'expired',
  'overlap',
])
  test('prepared registration refuses ' + variant, async (t) => {
    const h = await harness(t),
      owner = (await import('../dist/native-client.js')).default;
    const { createMixedNativePreparedRegistration } =
      await import('../../../scripts/mixed-native-prepared-registration.mjs');
    const command = {
      executablePath: process.execPath,
      arguments: [],
      environment: owner.buildOwnedNativeEnvironment(
        {},
        process.platform === 'win32' ? Object.keys(process.env) : [],
      ),
      cwd: process.cwd(),
    };
    if (variant === 'static-env')
      command.environment = { ...command.environment, FIXTURE_UNAPPROVED: '1' };
    const registry = createMixedNativePreparedRegistration({
      contextSha256: 'a'.repeat(64),
      slots: [
        {
          launchId: 'dynamic-v5',
          role: variant === 'role' ? 'V2' : 'V5',
          imageSha256: 'b'.repeat(64),
          command,
        },
      ],
    });
    let pending;
    await assert.rejects(
      h.run({
        async beforeSpawn(plan) {
          if (['plain', 'static-env', 'role'].includes(variant)) {
            assert.throws(() => registry.prepare(variant === 'plain' ? { ...plan } : plan));
          } else {
            const ticket = registry.prepare(plan);
            if (variant === 'expired') pending = ticket;
            else
              assert.throws(() =>
                variant === 'overlap'
                  ? registry.prepare(plan)
                  : registry.consume(
                      variant === 'proxy-ticket' ? new Proxy(ticket, {}) : { ...ticket },
                    ),
              );
          }
          throw Error('fixture no spawn');
        },
        async beforeInput() {},
        async afterClose() {},
        async dispose() {},
      }),
    );
    if (pending) assert.throws(() => registry.consume(pending));
    assert.equal(registry.status().status, 'FAILED');
    assert.equal(h.events.includes('spawn'), false);
  });

test('prepared registration leaves fixed wire REGISTER closed', async () => {
  const { createMixedNativeControlCodec } =
    await import('../../../scripts/mixed-native-control-codec.mjs');
  assert.throws(() =>
    createMixedNativeControlCodec('a'.repeat(64), {
      maxFrameBytes: 1024,
      maxTotalBytes: 4096,
      maxFrames: 10,
    }).encode({ type: 'REGISTER', launchId: 'slot', role: 'V5', commandSha256: 'b'.repeat(64) }),
  );
});

test('prepared owner claim cannot replay across registries', async (t) => {
  const h = await harness(t),
    owner = (await import('../dist/native-client.js')).default;
  const { createMixedNativePreparedRegistration } =
    await import('../../../scripts/mixed-native-prepared-registration.mjs');
  const input = {
    contextSha256: 'a'.repeat(64),
    slots: [
      {
        launchId: 'once',
        role: 'V5',
        imageSha256: 'b'.repeat(64),
        command: {
          executablePath: process.execPath,
          arguments: [],
          environment: owner.buildOwnedNativeEnvironment(
            {},
            process.platform === 'win32' ? Object.keys(process.env) : [],
          ),
          cwd: process.cwd(),
        },
      },
    ],
  };
  const a = createMixedNativePreparedRegistration(input),
    b = createMixedNativePreparedRegistration({ ...input, contextSha256: 'c'.repeat(64) });
  await assert.rejects(
    h.run({
      async beforeSpawn(plan) {
        const x = a.prepare(plan),
          y = b.prepare(plan);
        a.consume(x);
        assert.throws(() => b.consume(y));
        assert.equal(b.status().status, 'FAILED');
        throw Error('fixture no spawn');
      },
      async beforeInput() {},
      async afterClose() {},
      async dispose() {},
    }),
  );
  assert.equal(h.events.includes('spawn'), false);
});

test('dynamic request bytes remain in the prepared full command digest', async (t) => {
  const baseline = await instantiateProducerCase('no-files', '/fixture/producer'),
    request = JSON.parse(baseline.requestBytes.toString('utf8'));
  const { createHash, randomUUID } = await import('node:crypto');
  request.requestId = randomUUID();
  request.payload.deadlineEpochMs = Date.now() + 5000;
  const bytes = Buffer.from(JSON.stringify(request) + '\n'),
    h = await harness(t, 'success', { ...baseline, requestBytes: bytes }),
    owner = (await import('../dist/native-client.js')).default;
  const { createMixedNativePreparedRegistration } =
      await import('../../../scripts/mixed-native-prepared-registration.mjs'),
    { hashMixedNativeLaunch } = await import('../../../scripts/mixed-native-launch-handshake.mjs');
  const registry = createMixedNativePreparedRegistration({
    contextSha256: 'a'.repeat(64),
    slots: [
      {
        launchId: 'dynamic',
        role: 'V5',
        imageSha256: 'b'.repeat(64),
        command: {
          executablePath: process.execPath,
          arguments: [],
          environment: owner.buildOwnedNativeEnvironment(
            {},
            process.platform === 'win32' ? Object.keys(process.env) : [],
          ),
          cwd: process.cwd(),
        },
      },
    ],
  });
  let binding;
  await assert.rejects(
    h.run({
      async beforeSpawn(plan) {
        binding = registry.consume(registry.prepare(plan)).binding;
        assert.equal(binding.commandSha256, hashMixedNativeLaunch(plan));
        assert.notEqual(
          binding.commandSha256,
          hashMixedNativeLaunch({
            ...plan,
            stdinSha256: createHash('sha256').update(baseline.requestBytes).digest('hex'),
          }),
        );
        throw Error('fixture no spawn');
      },
      async beforeInput() {},
      async afterClose() {},
      async dispose() {},
    }),
  );
  assert.ok(binding);
  assert.equal(h.events.includes('spawn'), false);
});

test('Native prepared origin rejects inside the synchronous abort notification', async (t) => {
  const h = await harness(t),
    owner = (await import('../dist/native-client.js')).default,
    c = new AbortController();
  let observed = false,
    readRejected = false,
    claimRejected = false;
  await assert.rejects(
    h.run(
      {
        async beforeSpawn(plan, signal) {
          signal.addEventListener(
            'abort',
            () => {
              observed = true;
              try {
                owner.readOwnedNativeLaunchPlan(plan);
              } catch {
                readRejected = true;
              }
              try {
                owner.claimOwnedNativeLaunchPlan(plan);
              } catch {
                claimRejected = true;
              }
            },
            { once: true },
          );
          c.abort();
          await new Promise(setImmediate);
        },
        async beforeInput() {},
        async afterClose() {},
        async dispose() {},
      },
      { signal: c.signal },
    ),
  );
  assert.equal(observed, true);
  assert.equal(readRejected, true);
  assert.equal(claimRejected, true);
  assert.equal(h.events.includes('spawn'), false);
});

test('AR timed out pending beforeInput stays UNKNOWN when wall clock lags timer', async (t) => {
  const h = await harness(t);
  const epoch = Date.now();
  t.mock.method(Date, 'now', () => epoch);
  let entered = 0,
    disposed = 0;
  await assert.rejects(
    boundedOutcome(
      h.run(
        {
          async beforeSpawn() {},
          async beforeInput() {
            entered++;
            await new Promise(() => {});
          },
          async afterClose() {},
          async dispose() {
            disposed++;
          },
        },
        { timeoutMs: 30 },
      ),
    ),
    (e) => e.code === 'TIMEOUT' && e.cleanupState === 'UNKNOWN',
  );
  assert.equal(entered, 1);
  assert.equal(disposed, 1);
  assert.equal(h.writes.length, 0);
});
test('AR higher priority cancellation retains earlier unknown lifecycle cleanup', async (t) => {
  const h = await harness(t),
    controller = new AbortController();
  const { NativeClientError } = await import('../dist/native-client.js');
  const primary = Object.assign(
    new NativeClientError('PROCESS_FAILED', 'fixture lifecycle refusal'),
    {
      cleanupState: 'UNKNOWN',
    },
  );
  h.child.once('exit', () => {
    delete primary.cleanupState; // Already-observed uncertainty belongs to the owner.
    controller.abort();
  });
  let disposed = 0;
  await assert.rejects(
    h.run(
      {
        async beforeInput() {
          throw primary;
        },
        async afterClose() {},
        async dispose() {
          disposed++;
        },
      },
      { signal: controller.signal },
    ),
    (e) => e.code === 'CANCELLED' && e.cleanupState === 'UNKNOWN',
  );
  assert.equal(disposed, 1);
  assert.equal(h.writes.length, 0);
});

test('AR successful cleanup cannot erase already observed unknown evidence', async (t) => {
  const h = await harness(t);
  const { NativeClientError } = await import('../dist/native-client.js');
  const primary = Object.assign(new NativeClientError('PROCESS_FAILED', 'fixture refusal'), {
    cleanupState: 'UNKNOWN',
  });
  await assert.rejects(
    h.run({
      async beforeInput() {
        throw primary;
      },
      async afterClose() {
        delete primary.cleanupState;
      },
      async dispose() {},
    }),
    (e) => e.code === 'PROCESS_FAILED' && e.cleanupState === 'UNKNOWN' && e !== primary,
  );
  assert.equal(h.writes.length, 0);
});
