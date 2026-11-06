import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAccount } from '../../source/test/fixtures/mixed-source-git-double.mjs';
const api = await import('../dist/secret-preflight.js').catch(() => ({}));
const scan = (raw, candidate = {}) =>
  api.inspectDocumentSecrets(Buffer.from(raw), candidate, makeAccount().account);
test('private secret detector exists', () =>
  assert.equal(typeof api.inspectDocumentSecrets, 'function'));
for (const raw of [
  '-----BEGIN RSA PRIVATE KEY-----',
  'password = synthetic-only',
  'API_KEY: synthetic-only',
])
  test('known raw pattern blocks without disclosing its value: ' + raw.split(' ')[0], () => {
    const r = scan(raw);
    assert.equal(r.detected, true);
    assert.equal(r.coverage, 'LIMITED');
    assert.equal(r.clearance, false);
    assert.equal(JSON.stringify(r).includes('synthetic-only'), false);
    assert.equal(JSON.stringify(r).includes(raw), false);
    assert.ok(Object.isFrozen(r) && Object.isFrozen(r.rules));
  });
test('candidate properties, prose, diagnostics and nested arrays are inspected', () => {
  for (const value of [
    { nested: [{ password: 'synthetic-only' }] },
    { diagnostic: 'token=synthetic-only' },
    { text: '-----BEGIN OPENSSH PRIVATE KEY-----' },
  ]) {
    const r = scan('ordinary text', value);
    assert.equal(r.detected, true);
    assert.equal(JSON.stringify(r).includes('synthetic-only'), false);
  }
});
test('no known pattern including opaque value never grants clearance', () => {
  const r = scan('ordinary text', { text: 'opaque-unknown-value' });
  assert.deepEqual(r, {
    ruleSet: 'document-secret-indicators-v1',
    detected: false,
    coverage: 'LIMITED',
    clearance: false,
    rules: [],
  });
});
test('invalid UTF8, shared/proxy bytes and accessors fail closed', () => {
  let calls = 0;
  for (const raw of [
    Buffer.from([255]),
    new Uint8Array(new SharedArrayBuffer(4)),
    new Proxy(new Uint8Array(1), {}),
  ]) {
    const a = makeAccount();
    assert.throws(() => api.inspectDocumentSecrets(raw, {}, a.account));
    assert.equal(a.usage.invalid, true);
  }
  const a = makeAccount();
  assert.throws(() =>
    api.inspectDocumentSecrets(
      Buffer.from('x'),
      {
        get text() {
          calls++;
          return 'x';
        },
      },
      a.account,
    ),
  );
  assert.equal(calls, 0);
  assert.equal(a.usage.invalid, true);
});
test('cancellation and copy-budget failure never yield a partial scan', () => {
  const c = new AbortController();
  c.abort();
  assert.throws(
    () => api.inspectDocumentSecrets(Buffer.from('x'), {}, makeAccount(c.signal).account),
    { code: 'CANCELLED' },
  );
  const a = makeAccount();
  a.account.reserveBuffer = () => {
    throw Object.assign(Error('budget'), { code: 'HISTORY_LIMIT_EXCEEDED' });
  };
  assert.throws(() => api.inspectDocumentSecrets(Buffer.from('x'), {}, a.account), {
    code: 'HISTORY_LIMIT_EXCEEDED',
  });
  assert.equal(a.usage.invalid, true);
});

const corpus = JSON.parse(
  await readFile(new URL('./fixtures/secret-indicators-v1.json', import.meta.url), 'utf8'),
);
for (const vector of corpus.cases)
  test('versioned indicator corpus: ' + vector.id, () => {
    const r = scan(vector.source, vector.candidate);
    assert.equal(r.ruleSet, corpus.version);
    assert.equal(r.detected, vector.detected);
    assert.equal(r.clearance, false);
    assert.equal(r.coverage, 'LIMITED');
  });
