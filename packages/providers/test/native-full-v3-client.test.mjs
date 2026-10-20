import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Writable } from 'node:stream';
import * as writer from '../dist/native-request-json.js';
import * as providers from '../dist/index.js';

const manifest = JSON.parse(
  await readFile(new URL('../../../fixtures/ipc/analysis-v3/cases.json', import.meta.url)),
);
const request = manifest.cases.find((value) => value.id === 'valid-empty').request;
const helper = fileURLToPath(new URL('./fixtures/native-full-v3-child.mjs', import.meta.url));
function options(mode = 'valid', overrides = {}) {
  return {
    executablePath: process.execPath,
    arguments: [helper, mode],
    timeoutMs: 3000,
    allowedEnvironment: Object.fromEntries(
      ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
        .filter((name) => process.env[name] !== undefined)
        .map((name) => [name, process.env[name]]),
    ),
    ...overrides,
  };
}
const run = (mode, overrides = {}, sink = { async accept() {} }, value = request) =>
  providers.streamNativeFullAnalysisV3(value, options(mode, overrides), sink);
const code = (value) => (error) =>
  error instanceof providers.NativeClientError && error.code === value;

for (const boundary of ['hard ceiling', 'lowered line ceiling', 'aggregate completion'])
  test(`shared preflight bounds ${boundary} before schema traversal`, () => {
    const value = structuredClone(request);
    const overrides = {};
    let tailReads = 0;
    if (boundary === 'aggregate completion') {
      overrides.limits = { maxStdinBytes: Buffer.byteLength(JSON.stringify(value)) + 1 };
    } else {
      value.payload.sourceFiles = Array.from({ length: 10_000 }, (_, i) => ({
        id: `file-${i}`,
        path: `src/File${i}.java`,
        contentFingerprint: 'x'.repeat(100),
      }));
      Object.defineProperty(value.payload.sourceFiles.at(-1), 'path', {
        enumerable: true,
        get() {
          tailReads++;
          throw new Error('UNBOUNDED_SCHEMA_TRAVERSAL');
        },
      });
      if (boundary === 'lowered line ceiling') overrides.limits = { maxLineBytes: 2_000 };
    }
    assert.throws(
      () => providers.preflightNativeFullAnalysisV3(value, options('valid', overrides)),
      code('OUTPUT_LIMIT_EXCEEDED'),
    );
    assert.equal(tailReads, 0);
  });

test('full-v3 process verifies exactly two input records before returning a terminal', async () => {
  assert.equal(typeof providers.streamNativeFullAnalysisV3, 'function');
  const accepted = [];
  const result = await run(
    'valid',
    {},
    {
      async accept(event) {
        accepted.push(event.type);
      },
    },
  );
  assert.deepEqual(accepted, ['ANALYSIS_STARTED', 'SOURCE_FILE', 'COVERAGE', 'ANALYSIS_SUMMARY']);
  assert.equal(result.terminal.type, 'ANALYSIS_COMPLETED');
  assert.equal(result.terminal.payload.summaryRecords, 1);
  assert.match(result.stderr, /^verified-request:\d+\n$/);
  assert.equal(Object.isFrozen(result.terminal), true);
  assert.equal('events' in result, false);
});

test('full-v3 cancellation between header and completion writes no completion record', async () => {
  assert.equal(typeof writer.writeFullRequestRecords, 'function');
  const received = [],
    controller = new AbortController();
  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      received.push(Buffer.from(chunk));
      controller.abort();
      callback();
    },
  });
  try {
    await assert.rejects(
      writer.writeFullRequestRecords(
        stdin,
        [Buffer.from('header\n'), Buffer.from('completion\n')],
        controller.signal,
        'req',
      ),
      code('CANCELLED'),
    );
    assert.equal(Buffer.concat(received).toString(), 'header\n');
    assert.equal(stdin.listenerCount('drain'), 0);
    assert.equal(stdin.listenerCount('finish'), 0);
    assert.equal(stdin.listenerCount('error'), 0);
  } finally {
    stdin.destroy();
  }
});

test('full-v3 input EPIPE is a controlled process failure with no completion write', async () => {
  const received = [],
    signal = new AbortController().signal;
  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      received.push(Buffer.from(chunk));
      callback(Object.assign(new Error('broken pipe'), { code: 'EPIPE' }));
    },
  });
  try {
    await assert.rejects(
      writer.writeFullRequestRecords(
        stdin,
        [Buffer.from('header\n'), Buffer.from('completion\n')],
        signal,
        'req',
      ),
      code('PROCESS_FAILED'),
    );
    assert.equal(Buffer.concat(received).toString(), 'header\n');
  } finally {
    stdin.destroy();
  }
});

test('full-v3 failed analyzer terminal and excessive stderr cannot return a result', async () => {
  await assert.rejects(run('analyzer-failed'), code('ANALYZER_FAILED'));
  await assert.rejects(
    run('stderr-overflow', { limits: { maxStderrBytes: 128 } }),
    code('OUTPUT_LIMIT_EXCEEDED'),
  );
});

test('full-v3 slow sink prevents overlapping delivery and no terminal escapes while blocked', async () => {
  const entered = Promise.withResolvers(),
    release = Promise.withResolvers();
  let inFlight = 0,
    maximum = 0,
    accepted = 0,
    resolved = false;
  const promise = run(
    'valid',
    {},
    {
      async accept() {
        inFlight++;
        maximum = Math.max(maximum, inFlight);
        accepted++;
        if (accepted === 1) {
          entered.resolve();
          await release.promise;
        }
        await new Promise((resolve) => setImmediate(resolve));
        inFlight--;
      },
    },
  ).then((value) => {
    resolved = true;
    return value;
  });
  try {
    await Promise.race([entered.promise, promise]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(accepted, 1);
    assert.equal(maximum, 1);
    assert.equal(resolved, false);
  } finally {
    release.resolve();
  }
  await promise;
  assert.equal(accepted, 4);
  assert.equal(maximum, 1);
});

test('full-v3 large input completes drain-aware writing to a delayed reader', async () => {
  const large = structuredClone(request);
  large.payload.repository.rootPath = '/' + 'x'.repeat(300_000);
  const result = await run('slow-stdin', {}, undefined, large);
  const bytes = Number(result.stderr.match(/verified-request:(\d+)/)[1]);
  assert.ok(bytes > 300_000 && bytes <= 1_000_000);
  assert.equal(result.terminal.type, 'ANALYSIS_COMPLETED');
});

test('full-v3 cancellation with an in-flight pipe write remains a typed refusal', async () => {
  const large = structuredClone(request);
  large.payload.repository.rootPath = '/' + 'x'.repeat(300_000);
  const controller = new AbortController();
  const pending = run('slow-stdin', { signal: controller.signal }, undefined, large);
  controller.abort();
  await assert.rejects(pending, code('CANCELLED'));
});

for (const { id: mode, expectedCode: expected } of manifest.transportCases)
  test(`full-v3 ${mode} never exposes a successful result`, async () => {
    let returned = false;
    await assert.rejects(
      run(mode).then(() => {
        returned = true;
      }),
      code(expected),
    );
    assert.equal(returned, false);
  });

test('full-v3 enforces each lowered byte/event cap and rejects raised ceilings', async () => {
  for (const limits of [
    { maxStdinBytes: 1 },
    { maxLineBytes: 20 },
    { maxStdoutBytes: 20 },
    { maxEvents: 1 },
    { maxStderrBytes: 1 },
  ])
    await assert.rejects(run('valid', { limits }), code('OUTPUT_LIMIT_EXCEEDED'));
  for (const [name, ceiling] of Object.entries(providers.NATIVE_CLIENT_HARD_LIMITS))
    await assert.rejects(
      run('valid', { limits: { [name]: ceiling + 1 } }),
      code('INVALID_CONFIGURATION'),
    );
});

test('full-v3 timeout and cancellation kill the one-shot process without a terminal', async (t) => {
  await assert.rejects(run('hang', { timeoutMs: 250 }), code('TIMEOUT'));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(run('valid', { signal: controller.signal }), code('CANCELLED'));
  const active = new AbortController();
  let sinkEntries = 0;
  const started = performance.now();
  t.after(() =>
    t.diagnostic(
      JSON.stringify({
        sinkEntries,
        cancelled: active.signal.aborted,
        elapsedMs: performance.now() - started,
        requestBudgetMs: request.payload.resourceBudget.maxDurationMs,
      }),
    ),
  );
  const promise = run(
    'valid',
    { signal: active.signal },
    {
      async accept() {
        sinkEntries++;
        active.abort();
      },
    },
  );
  await assert.rejects(promise, code('CANCELLED'));
});

test('full-v3 rejects invalid requests, sinks and unsafe spawn options before execution', async () => {
  await assert.rejects(
    run('valid', {}, undefined, { ...request, type: 'REFRESH' }),
    code('INVALID_REQUEST'),
  );
  await assert.rejects(run('valid', {}, {}), code('INVALID_CONFIGURATION'));
  await assert.rejects(run('valid', { executablePath: 'node' }), code('INVALID_CONFIGURATION'));
  await assert.rejects(
    run('valid', { allowedEnvironment: { PATH: 'unsafe' } }),
    code('INVALID_CONFIGURATION'),
  );
});

test(
  'full-v3 cancellation interrupts a permanently blocked sink and closes the child',
  { timeout: 2000 },
  async (t) => {
    const controller = new AbortController();
    let sinkEntries = 0;
    const started = performance.now();
    t.after(() =>
      t.diagnostic(
        JSON.stringify({
          sinkEntries,
          cancelled: controller.signal.aborted,
          elapsedMs: performance.now() - started,
          requestBudgetMs: request.payload.resourceBudget.maxDurationMs,
        }),
      ),
    );
    await assert.rejects(
      run(
        'valid',
        { signal: controller.signal },
        {
          async accept() {
            sinkEntries++;
            controller.abort();
            await new Promise(() => {});
          },
        },
      ),
      code('CANCELLED'),
    );
  },
);

test('full-v3 budget exhaustion before sink entry is TIMEOUT, not cancellation', async () => {
  const controller = new AbortController();
  let sinkEntries = 0;
  await assert.rejects(
    run(
      'delay-before-output',
      { signal: controller.signal },
      {
        async accept() {
          sinkEntries++;
          controller.abort();
        },
      },
    ),
    code('TIMEOUT'),
  );
  assert.equal(sinkEntries, 0);
  assert.equal(controller.signal.aborted, false);
});
