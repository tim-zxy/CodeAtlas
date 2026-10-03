import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import * as providers from '../dist/index.js';

const childHelper = fileURLToPath(new URL('./fixtures/native-client-child.mjs', import.meta.url));
const analyzeRequest = JSON.parse(
  await readFile(
    new URL(
      '../../../fixtures/ipc/protocol-v1/analyze-java-basic-v1/request.jsonl',
      import.meta.url,
    ),
    'utf8',
  ),
);
const analyzeRequestV2 = { ...structuredClone(analyzeRequest), protocolVersion: 2 };

function options(scenario, overrides = {}) {
  const allowedEnvironment = Object.fromEntries(
    ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]]),
  );
  return {
    executablePath: process.execPath,
    arguments: [childHelper, scenario],
    timeoutMs: 3_000,
    allowedEnvironment,
    ...overrides,
  };
}

test('streamNativeAnalysis releases a v1 result only after exact terminal validation', async () => {
  assert.equal(typeof providers.streamNativeAnalysis, 'function');
  const provisional = [];
  const result = await providers.streamNativeAnalysis(analyzeRequest, options('valid-analyze'), {
    async accept(event) {
      provisional.push(event.type);
    },
  });
  assert.deepEqual(provisional, ['ANALYSIS_STARTED']);
  assert.equal(result.terminal.type, 'ANALYSIS_COMPLETED');
  assert.equal(result.terminal.payload.outcome, 'SUCCEEDED');
});

test('streamNativeAnalysis accepts strict v2 coverage without downgrading its version', async () => {
  const received = [];
  const result = await providers.streamNativeAnalysis(
    analyzeRequestV2,
    options('valid-analyze-v2'),
    {
      async accept(event) {
        received.push(event);
      },
    },
  );
  assert.deepEqual(
    received.map((event) => event.type),
    ['ANALYSIS_STARTED', 'SOURCE_FILE', 'COVERAGE'],
  );
  assert.ok(received.every((event) => event.protocolVersion === 2));
  assert.equal(received.at(-1).payload.statistics.eligibleSites, 0);
  assert.equal(result.terminal.type, 'ANALYSIS_COMPLETED');
});

test('streamNativeAnalysis awaits a slow sink and never overlaps event delivery', async () => {
  const request = structuredClone(analyzeRequest);
  request.payload.resourceBudget.maxEvents = 2_000;
  request.payload.resourceBudget.maxDurationMs = 15_000;
  let inFlight = 0;
  let maximum = 0;
  let count = 0;
  const blocked = Promise.withResolvers();
  const entered = Promise.withResolvers();
  const stream = providers.streamNativeAnalysis(
    request,
    options('burst-output', { timeoutMs: 15_000 }),
    {
      async accept() {
        inFlight++;
        maximum = Math.max(maximum, inFlight);
        if (count === 0) {
          entered.resolve();
          await blocked.promise;
        }
        await new Promise((resolve) => setImmediate(resolve));
        count++;
        inFlight--;
      },
    },
  );
  // Hold the real first accept until the test releases it. Timer resolution is
  // not the contract: no second accept may overlap this pending sink promise.
  try {
    await Promise.race([entered.promise, stream]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(count, 0);
    assert.equal(maximum, 1);
  } finally {
    blocked.resolve();
  }
  const result = await stream;
  assert.equal(maximum, 1);
  assert.equal(count, 1_001);
  assert.equal(result.terminal.type, 'ANALYSIS_COMPLETED');
});

test('corruption and failed outcomes never return an applicable stream', async () => {
  const scenarios = [
    ['checksum-mismatch', 'CHECKSUM_MISMATCH', analyzeRequest],
    ['invalid-checksum', 'CHECKSUM_MISMATCH', analyzeRequest],
    ['analyze-post-terminal', 'PROTOCOL_VIOLATION', analyzeRequest],
    ['premature-eof', 'PROTOCOL_VIOLATION', analyzeRequest],
    ['count-mismatch', 'PROTOCOL_VIOLATION', analyzeRequest],
    ['sequence-drift', 'PROTOCOL_VIOLATION', analyzeRequest],
    ['version-mismatch-v2', 'PROTOCOL_VIOLATION', analyzeRequestV2],
    ['invalid-coverage-v2', 'PROTOCOL_VIOLATION', analyzeRequestV2],
    ['analyzer-failed', 'ANALYZER_FAILED', analyzeRequest],
  ];
  for (const [scenario, code, request] of scenarios) {
    let applicable = false;
    await assert.rejects(
      providers.streamNativeAnalysis(request, options(scenario), { async accept() {} }).then(() => {
        applicable = true;
      }),
      (error) => error instanceof providers.NativeClientError && error.code === code,
      scenario,
    );
    assert.equal(applicable, false, scenario);
  }
});

test('PARTIAL is transport-valid but remains distinguishable from SUCCEEDED', async () => {
  const result = await providers.streamNativeAnalysis(analyzeRequest, options('partial-analyze'), {
    async accept() {},
  });
  assert.equal(result.terminal.type, 'ANALYSIS_COMPLETED');
  assert.equal(result.terminal.payload.outcome, 'PARTIAL');
});

test('stream respects byte, line, and event limits before releasing a result', async () => {
  for (const limits of [{ maxEvents: 1 }, { maxLineBytes: 20 }, { maxStdoutBytes: 50 }]) {
    await assert.rejects(
      providers.streamNativeAnalysis(analyzeRequest, options('valid-analyze', { limits }), {
        async accept() {},
      }),
      (error) =>
        error instanceof providers.NativeClientError && error.code === 'OUTPUT_LIMIT_EXCEEDED',
    );
  }
});

test('stream cancellation and timeout reject without an applicable result', async () => {
  await assert.rejects(
    providers.streamNativeAnalysis(analyzeRequest, options('hang', { timeoutMs: 50 }), {
      async accept() {},
    }),
    (error) => error instanceof providers.NativeClientError && error.code === 'TIMEOUT',
  );
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 25);
  await assert.rejects(
    providers.streamNativeAnalysis(analyzeRequest, options('hang', { signal: controller.signal }), {
      async accept() {},
    }),
    (error) => error instanceof providers.NativeClientError && error.code === 'CANCELLED',
  );
});
