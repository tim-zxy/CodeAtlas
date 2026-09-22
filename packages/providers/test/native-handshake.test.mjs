import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  NativeEventEnvelopeSchema,
  NativeEventStreamSchema,
  NativeRequestEnvelopeSchema,
} from '../dist/index.js';

const repositoryRoot = new URL('../../../', import.meta.url);
const fixtureRoot = new URL('../../../fixtures/ipc/handshake-v1/', import.meta.url);
const expectedIds = [
  'describe-v1',
  'incompatible-protocol-v1',
  'incompatible-ir-v1',
  'invalid-describe-v1',
  'malformed-request-v1',
];

function nativeBinaryPath({
  targetDirectory = process.env.CARGO_TARGET_DIR,
  platform = process.platform,
} = {}) {
  const root = targetDirectory
    ? path.isAbsolute(targetDirectory)
      ? targetDirectory
      : path.resolve(fileURLToPath(repositoryRoot), targetDirectory)
    : path.resolve(fileURLToPath(repositoryRoot), 'target');
  return path.join(
    root,
    'debug',
    platform === 'win32' ? 'codeatlas-native-analyzer.exe' : 'codeatlas-native-analyzer',
  );
}

function fixtureUrl(relative) {
  assert.equal(typeof relative, 'string');
  assert.equal(path.isAbsolute(relative), false);
  assert.doesNotMatch(relative, /^[A-Za-z]:/);
  assert.doesNotMatch(relative, /\\/);
  const components = relative.split('/');
  assert.ok(
    components.length > 0 && components.every((part) => part && part !== '.' && part !== '..'),
  );
  const resolved = new URL(components.map(encodeURIComponent).join('/'), fixtureRoot);
  assert.equal(resolved.href.startsWith(fixtureRoot.href), true);
  return resolved;
}

function runProcess(binary, arguments_, request, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, arguments_, {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {},
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const fail = (error) => {
      child.kill();
      finish(reject, error);
    };
    const collect = (chunks, kind) => (chunk) => {
      if (kind === 'stdout') stdoutBytes += chunk.length;
      else stderrBytes += chunk.length;
      if (stdoutBytes > limit || stderrBytes > limit) {
        fail(new Error(`native ${kind} exceeded capture limit`));
        return;
      }
      chunks.push(chunk);
    };
    const timer = setTimeout(() => fail(new Error('native handshake timed out')), 5_000);

    child.stdout.on('data', collect(stdout, 'stdout'));
    child.stderr.on('data', collect(stderr, 'stderr'));
    child.once('error', (error) => finish(reject, error));
    child.once('close', (code) =>
      finish(resolve, {
        code,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      }),
    );
    child.stdin.end(request);
  });
}

function runHandshake(binary, request, limit) {
  return runProcess(binary, [], request, limit);
}

async function loadManifest() {
  return JSON.parse(await readFile(new URL('cases.json', fixtureRoot), 'utf8'));
}

test('native binary path honors default, relative, absolute, and platform variants', () => {
  const root = fileURLToPath(repositoryRoot);
  assert.equal(
    nativeBinaryPath({ targetDirectory: undefined, platform: 'win32' }),
    path.join(root, 'target', 'debug', 'codeatlas-native-analyzer.exe'),
  );
  assert.equal(
    nativeBinaryPath({ targetDirectory: 'custom-target', platform: 'linux' }),
    path.join(root, 'custom-target', 'debug', 'codeatlas-native-analyzer'),
  );
  const absolute = path.resolve(root, '..', 'absolute-target');
  assert.equal(
    nativeBinaryPath({ targetDirectory: absolute, platform: 'win32' }),
    path.join(absolute, 'debug', 'codeatlas-native-analyzer.exe'),
  );
});

test('handshake manifest is exact, safe, and byte-accurate', async () => {
  const manifest = await loadManifest();
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.id, 'p0-native-ipc-handshake-v1');
  assert.equal(manifest.task, 'P0-W3-003');
  assert.equal(manifest.governingSpec, 'docs/handoff/specs/NATIVE_IPC.md');
  assert.equal(
    manifest.acceptance,
    'Rust and TypeScript negotiate the Native IPC v1 DESCRIBE handshake and explicit rejection paths',
  );
  assert.deepEqual(
    manifest.cases.map((fixtureCase) => fixtureCase.id),
    expectedIds,
  );
  assert.equal(new Set(expectedIds).size, manifest.cases.length);

  for (const fixtureCase of manifest.cases) {
    assert.deepEqual(Object.keys(fixtureCase).sort(), [
      'expected',
      'id',
      'requestBytes',
      'requestFile',
    ]);
    assert.deepEqual(Object.keys(fixtureCase.expected).sort(), [
      'errorCode',
      'eventType',
      'exitCode',
      'stderr',
    ]);
    assert.equal(Number.isSafeInteger(fixtureCase.requestBytes), true);
    assert.ok(fixtureCase.requestBytes > 0);
    const request = await readFile(fixtureUrl(fixtureCase.requestFile));
    assert.equal(request.length, fixtureCase.requestBytes, fixtureCase.id);
  }
});

test('real Rust process matches every handshake fixture and TypeScript schema', async () => {
  const manifest = await loadManifest();
  const binary = nativeBinaryPath();

  for (const fixtureCase of manifest.cases) {
    const requestBytes = await readFile(fixtureUrl(fixtureCase.requestFile));
    const result = await runHandshake(binary, requestBytes);
    assert.equal(result.code, fixtureCase.expected.exitCode, fixtureCase.id);

    if (fixtureCase.id === 'malformed-request-v1') {
      assert.equal(result.stdout.length, 0);
      assert.ok(result.stderr.length > 0 && result.stderr.length <= 1_000_000);
      assert.throws(() => JSON.parse(requestBytes.toString('utf8')));
      continue;
    }

    assert.equal(result.stderr.length, 0, fixtureCase.id);
    assert.equal(result.stdout.at(-1), 0x0a, fixtureCase.id);
    assert.equal(result.stdout.subarray(0, -1).includes(0x0a), false, fixtureCase.id);
    const request = JSON.parse(requestBytes.toString('utf8'));
    const event = JSON.parse(result.stdout.toString('utf8'));
    const requestResult = NativeRequestEnvelopeSchema.safeParse(request);
    if (fixtureCase.id === 'invalid-describe-v1') {
      assert.equal(requestResult.success, false);
    } else {
      assert.equal(requestResult.success, true);
    }
    assert.equal(NativeEventEnvelopeSchema.safeParse(event).success, true);
    assert.equal(event.type, fixtureCase.expected.eventType);
    assert.equal(event.requestId, request.requestId);
    assert.equal(event.sequence, 0);
    assert.equal(event.protocolVersion, 1);

    if (fixtureCase.expected.errorCode) {
      assert.equal(event.payload.error.code, fixtureCase.expected.errorCode);
    }
    if (requestResult.success) {
      assert.equal(NativeEventStreamSchema.safeParse({ request, events: [event] }).success, true);
    }
  }
});

test('process capture rejects output beyond its byte bound', async () => {
  await assert.rejects(
    runProcess(
      process.execPath,
      ['-e', 'process.stdout.write("x".repeat(33))'],
      Buffer.alloc(0),
      32,
    ),
    /native stdout exceeded capture limit/,
  );
});
