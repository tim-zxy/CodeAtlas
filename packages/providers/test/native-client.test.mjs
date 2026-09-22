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
  return executeNativeRequest(request, {
    executablePath: process.execPath,
    arguments: [childHelper, scenario],
    timeoutMs: 2_000,
    ...overrides,
  });
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
