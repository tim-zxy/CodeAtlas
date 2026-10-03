import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { executeNativeRequest } from '../dist/index.js';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const targetDirectory = process.env.CARGO_TARGET_DIR
  ? path.resolve(repositoryRoot, process.env.CARGO_TARGET_DIR)
  : path.join(repositoryRoot, 'target');
const nativeBinary =
  process.env.CODEATLAS_NATIVE_ANALYZER_TEST_PATH ??
  path.join(
    targetDirectory,
    'debug',
    process.platform === 'win32' ? 'codeatlas-native-analyzer.exe' : 'codeatlas-native-analyzer',
  );
const describeRequest = {
  protocolVersion: 1,
  requestId: 'client-describe-real',
  type: 'DESCRIBE',
  payload: { clientProtocolVersions: [1], clientIrSchemaVersions: [1] },
};

test('production client completes a real Rust DESCRIBE handshake', async () => {
  const result = await executeNativeRequest(describeRequest, {
    executablePath: nativeBinary,
    timeoutMs: 5_000,
  });
  assert.equal(result.terminal.type, 'DESCRIBE_COMPLETED');
  assert.deepEqual(result.terminal.payload.protocolVersions, [1, 2, 3]);
  assert.deepEqual(result.terminal.payload.irSchemaVersions, [1]);
  assert.equal(result.stderr, '');
});

test('production client maps real Rust negotiation failure', async () => {
  const incompatible = structuredClone(describeRequest);
  incompatible.requestId = 'client-describe-incompatible';
  incompatible.payload.clientProtocolVersions = [2];
  await assert.rejects(
    executeNativeRequest(incompatible, { executablePath: nativeBinary, timeoutMs: 5_000 }),
    (error) =>
      error.code === 'ANALYZER_FAILED' &&
      error.analyzerError.code === 'INCOMPATIBLE_PROTOCOL_VERSION',
  );
});
