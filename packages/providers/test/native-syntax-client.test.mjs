import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as api from '../dist/index.js';
const root = new URL('../../../fixtures/phase1/syntax-budget-contract/', import.meta.url);
const request = JSON.parse(await readFile(new URL('inputs/java-request.json', root), 'utf8'));
const child = fileURLToPath(new URL('./fixtures/native-syntax-child.mjs', import.meta.url));
const events = fileURLToPath(new URL('inputs/java-events.jsonl', root));
function context() {
  const p = structuredClone(request.payload);
  delete p.ownerBinding.ownerMapDigest;
  return {
    expectedActivationBasis: p.expectedActivationBasis,
    targetSource: p.targetSource,
    ownerBinding: p.ownerBinding,
    providerId: p.providerId,
    providerSnapshotId: p.providerSnapshotId,
    sourceFiles: p.sourceFiles,
    owners: p.owners,
  };
}
function run(mode = 'valid', overrides = {}, capture = context()) {
  assert.equal(typeof api.observeNativeSyntax, 'function');
  const env = Object.fromEntries(
    ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
      .filter((k) => process.env[k] !== undefined)
      .map((k) => [k, process.env[k]]),
  );
  return api.observeNativeSyntax(request, {
    capturedContext: capture,
    options: {
      executablePath: process.execPath,
      arguments: [child, mode, events],
      timeoutMs: 2000,
      allowedEnvironment: env,
      ...overrides,
    },
  });
}
test('fake child complete stream validates only after process settles', async () => {
  const result = await run();
  assert.equal(result.outcome, 'SUCCEEDED');
  assert.equal(Object.isFrozen(result), true);
});
for (const mode of ['corrupt', 'truncate', 'post-terminal'])
  test('fake child ' + mode + ' is refused', async () => {
    await assert.rejects(
      () => run(mode),
      (e) => e.code === 'PROTOCOL_VIOLATION',
    );
  });
test('timeout settles and returns no applicable observations', async () => {
  await assert.rejects(
    () => run('hold', { timeoutMs: 100 }),
    (e) => e.code === 'TIMEOUT',
  );
});
test('pre-cancellation refuses before spawn', async () => {
  const c = new AbortController();
  c.abort();
  await assert.rejects(
    () => run('valid', { signal: c.signal }),
    (e) => e.code === 'CANCELLED',
  );
});
test('lower caller byte limit is enforced', async () => {
  await assert.rejects(
    () => run('valid', { limits: { maxStdoutBytes: 32 } }),
    (e) => e.code === 'OUTPUT_LIMIT_EXCEEDED',
  );
});
test('unapproved environment names never reach a child', async () => {
  await assert.rejects(
    () => run('valid', { allowedEnvironment: { CODEATLAS_SYNTAX_TEST_SECRET: 'secret' } }),
    (e) => e.code === 'INVALID_CONFIGURATION',
  );
});
test('parent environment is not inherited by fake child', async () => {
  const previous = process.env.CODEATLAS_SYNTAX_TEST_SECRET;
  process.env.CODEATLAS_SYNTAX_TEST_SECRET = 'secret';
  try {
    assert.equal((await run()).stderr, '');
  } finally {
    if (previous === undefined) delete process.env.CODEATLAS_SYNTAX_TEST_SECRET;
    else process.env.CODEATLAS_SYNTAX_TEST_SECRET = previous;
  }
});
test('foreign current basis refuses before unavailable executable', async () => {
  const c = context();
  c.expectedActivationBasis.codeActivationDigest = 'f'.repeat(64);
  await assert.rejects(
    () => run('valid', { executablePath: process.execPath + '/missing' }, c),
    (e) => e.code === 'BASE_REVISION_MISMATCH',
  );
});
