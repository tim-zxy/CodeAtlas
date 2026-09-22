import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { executeNativeRequest, NativeClientError } from '../dist/index.js';

const fixtureRoot = new URL('../../../fixtures/ipc/client-v1/', import.meta.url);
const childHelper = fileURLToPath(new URL('./fixtures/native-client-child.mjs', import.meta.url));
const analyzeRequest = JSON.parse(
  await readFile(new URL('../../../fixtures/ipc/protocol-v1/analyze-java-basic-v1/request.jsonl', import.meta.url), 'utf8'),
);
const describeRequest = {
  protocolVersion: 1,
  requestId: 'client-describe-a',
  type: 'DESCRIBE',
  payload: { clientProtocolVersions: [1], clientIrSchemaVersions: [1] },
};

function runScenario(scenario, overrides = {}, request = describeRequest) {
  const platformEnvironment = Object.fromEntries(
    ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]]),
  );
  return executeNativeRequest(request, {
    executablePath: process.execPath,
    arguments: [childHelper, scenario],
    timeoutMs: 2_000,
    ...overrides,
    allowedEnvironment: { ...platformEnvironment, ...overrides.allowedEnvironment },
  });
}

const hasCode = (code) =>
  (error) => error instanceof NativeClientError && error.code === code;

function largeAnalyzeRequest() {
  const request = structuredClone(analyzeRequest);
  const template = request.payload.sourceFiles[0];
  request.requestId = 'request-large-stdin';
  request.payload.sourceFiles = Array.from({ length: 2_000 }, (_, index) => ({
    ...template,
    id: `file-${index}`,
    path: `src/File${index}.java`,
    contentFingerprint: `file-fp-${index}`,
  }));
  return request;
}

test('p0-native-client-v1 declares the P0-W3-004 acceptance surface', async () => {
  const manifest = JSON.parse(await readFile(new URL('cases.json', fixtureRoot), 'utf8'));
  assert.equal(manifest.id, 'p0-native-client-v1');
  assert.equal(manifest.task, 'P0-W3-004');
  assert.equal(manifest.governingSpec, 'docs/handoff/specs/NATIVE_IPC.md');
  assert.equal(new Set(manifest.cases).size, 30);
  assert.ok(manifest.cases.includes('malformed-json'));
  assert.ok(manifest.cases.includes('out-of-order'));
  assert.ok(manifest.cases.includes('total-oversize'));
  assert.ok(manifest.cases.includes('hang'));
  assert.ok(manifest.cases.includes('abort-close-race'));
});

test('configuration rejects relative paths, command strings, unsafe environment, and raised limits', async () => {
  const invalid = [
    { executablePath: 'node', timeoutMs: 1_000 },
    { executablePath: process.execPath, arguments: '--version', timeoutMs: 1_000 },
    { executablePath: process.execPath, timeoutMs: 1_000, allowedEnvironment: { PATH: 'x' } },
    {
      executablePath: process.execPath,
      timeoutMs: 1_000,
      allowedEnvironment: { TEMP: 'a', temp: 'b' },
    },
    { executablePath: process.execPath, timeoutMs: 0 },
    { executablePath: process.execPath, timeoutMs: 1_000, limits: { maxLineBytes: 1_000_001 } },
  ];

  for (const options of invalid) {
    await assert.rejects(
      executeNativeRequest(describeRequest, options),
      (error) => error instanceof NativeClientError && error.code === 'INVALID_CONFIGURATION',
    );
  }
});

test('invalid requests fail before spawning', async () => {
  await assert.rejects(
    executeNativeRequest(
      { ...describeRequest, extra: true },
      { executablePath: 'Z:\\definitely-not-spawned.exe', timeoutMs: 1_000 },
    ),
    (error) => error instanceof NativeClientError && error.code === 'INVALID_REQUEST',
  );
});

test('valid configuration executes one shell-free DESCRIBE process', async () => {
  const result = await runScenario('valid-describe');
  assert.equal(result.terminal.type, 'DESCRIBE_COMPLETED');
  assert.equal(result.events.length, 1);
  assert.equal(result.request.requestId, describeRequest.requestId);
});

test('native client errors omit captured diagnostics from serialization', () => {
  const error = new NativeClientError('PROCESS_FAILED', 'Native process failed', {
    requestId: 'request-a',
    exitCode: 7,
    stderr: 'sensitive diagnostic',
  });
  assert.equal(error.stderr, 'sensitive diagnostic');
  assert.deepEqual(error.toJSON(), {
    name: 'NativeClientError',
    code: 'PROCESS_FAILED',
    requestId: 'request-a',
    message: 'Native process failed',
    exitCode: 7,
  });
});

test('strict framing rejects malformed bytes and invalid protocol records', async () => {
  const scenarios = [
    'malformed-json',
    'invalid-utf8',
    'bom',
    'crlf',
    'blank-line',
    'wrong-request-id',
    'out-of-order',
    'post-terminal',
  ];
  for (const scenario of scenarios) {
    await assert.rejects(
      runScenario(scenario),
      (error) => error instanceof NativeClientError && error.code === 'PROTOCOL_VIOLATION',
      scenario,
    );
  }
  await assert.rejects(
    runScenario('premature-eof', {}, analyzeRequest),
    (error) => error instanceof NativeClientError && error.code === 'PROTOCOL_VIOLATION',
  );
});

test('byte and event boundaries accept exact limits and reject one over', async () => {
  for (const [scenario, limits] of [
    ['line-boundary', { maxLineBytes: 502 }],
    ['total-boundary', { maxStdoutBytes: 503 }],
    ['event-boundary', { maxEvents: 1 }],
  ]) {
    await assert.doesNotReject(runScenario(scenario, { limits }), scenario);
  }
  for (const [scenario, limits] of [
    ['line-oversize', { maxLineBytes: 501 }],
    ['total-oversize', { maxStdoutBytes: 502 }],
    ['event-oversize', { maxEvents: 1 }],
  ]) {
    await assert.rejects(
      runScenario(scenario, { limits }),
      (error) => error instanceof NativeClientError && error.code === 'OUTPUT_LIMIT_EXCEEDED',
      scenario,
    );
  }
});

test('byte-at-a-time chunks preserve split UTF-8 and LF boundaries', async () => {
  const result = await runScenario('byte-at-a-time');
  assert.equal(result.terminal.type, 'DESCRIBE_COMPLETED');
  assert.equal(result.terminal.payload.build.profile, 'débug');
});

test('child environment contains only explicitly allowed values', async () => {
  const result = await runScenario('environment', {
    allowedEnvironment: { LANG: 'C', TEMP: 'native-temp' },
  });
  assert.equal(
    result.stderr,
    'LANG=C\nTEMP=native-temp\nPATH=<empty>\nLEAKED=<none>\n',
  );
});

test('stdin and stdout backpressure complete without deadlock', async () => {
  const slowInput = await runScenario('slow-stdin', {}, largeAnalyzeRequest());
  assert.equal(slowInput.terminal.type, 'ANALYSIS_COMPLETED');
  const burstRequest = structuredClone(analyzeRequest);
  burstRequest.payload.resourceBudget.maxEvents = 2_000;
  const burst = await runScenario('burst-output', {}, burstRequest);
  assert.equal(burst.terminal.type, 'ANALYSIS_COMPLETED');
  assert.equal(burst.events.length, 1_002);
});

test('stderr capture is exact and bounded', async () => {
  const result = await runScenario('stderr');
  assert.equal(result.stderr, 'native diagnostic\n');
  await assert.rejects(
    runScenario('stderr-oversize', { limits: { maxStderrBytes: 16 } }),
    hasCode('OUTPUT_LIMIT_EXCEEDED'),
  );
});

test('timeout and cancellation close the child before rejection settles', async () => {
  await assert.rejects(runScenario('hang', { timeoutMs: 50 }), hasCode('TIMEOUT'));
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 25);
  await assert.rejects(runScenario('hang', { signal: controller.signal }), hasCode('CANCELLED'));
});

test('already expired and aborted requests never spawn', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runScenario('should-not-run', { signal: controller.signal }),
    hasCode('CANCELLED'),
  );
  const expired = structuredClone(analyzeRequest);
  expired.payload.deadlineEpochMs = Date.now() - 1;
  await assert.rejects(runScenario('should-not-run', {}, expired), hasCode('TIMEOUT'));
});

test('early-close and nonzero exit report process failure without unhandled rejection', async () => {
  const unhandled = [];
  const collect = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', collect);
  try {
    await assert.rejects(
      runScenario('early-close', {}, largeAnalyzeRequest()),
      hasCode('PROCESS_FAILED'),
    );
    await assert.rejects(runScenario('nonzero-exit'), hasCode('PROCESS_FAILED'));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', collect);
  }
});

test('external cancellation wins the successful-close race', async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 25);
  await assert.rejects(
    runScenario('abort-close-race', { signal: controller.signal }),
    hasCode('CANCELLED'),
  );
});

test('valid analysis resolves only after checksum and returns a deeply frozen result', async () => {
  const result = await runScenario('valid-analyze', {}, analyzeRequest);
  assert.equal(result.terminal.type, 'ANALYSIS_COMPLETED');
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.events));
  assert.ok(result.events.every(Object.isFrozen));
  assert.ok(Object.isFrozen(result.terminal.payload));
  assert.throws(() => {
    result.events[0].sequence = 9;
  }, TypeError);
});

test('analyzer failures retain safe metadata and expose no event buffer or checksum requirement', async () => {
  await assert.rejects(runScenario('analyzer-failed', {}, analyzeRequest), (error) => {
    assert.equal(error.code, 'ANALYZER_FAILED');
    assert.equal(error.analyzerError.code, 'INTERNAL_ANALYZER_FAILURE');
    assert.equal('events' in error, false);
    assert.equal('stderr' in error.toJSON(), false);
    return true;
  });
});

test('invalid and mismatched checksums are rejected', async () => {
  for (const scenario of ['invalid-checksum', 'checksum-mismatch']) {
    await assert.rejects(runScenario(scenario, {}, analyzeRequest), hasCode('CHECKSUM_MISMATCH'));
  }
});

test('every corrupt valid prefix leaves application state unchanged', async () => {
  for (const scenario of ['out-of-order', 'premature-eof', 'post-terminal', 'checksum-mismatch']) {
    const applied = [];
    await assert.rejects(
      runScenario(scenario, {}, analyzeRequest).then((result) => applied.push(result)),
    );
    assert.deepEqual(applied, [], scenario);
  }
});
