import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAccount } from '../../source/test/fixtures/mixed-source-git-double.mjs';
const api = await import('../dist/secret-preflight.js').catch(() => ({}));
const scan = (raw, candidate = {}) =>
  api.inspectDocumentSecrets(Buffer.from(raw), candidate, makeAccount().account);
const masking = await import('../dist/document-range-mask.js').catch(() => ({}));
const candidateScanner = await import('../dist/secret-candidate.js').catch(() => ({}));
const candidateCorpus = JSON.parse(
  await readFile(
    new URL('./fixtures/secret-indicators-v2-candidate.json', import.meta.url),
    'utf8',
  ),
);
for (const vector of candidateCorpus.cases)
  test('proposed coverage corpus: ' + vector.id, () => {
    const result = candidateScanner.inspectDocumentSecretCandidate(
      Buffer.from(vector.source),
      vector.candidate,
      makeAccount().account,
    );
    assert.equal(result.ruleSet, candidateCorpus.version);
    assert.equal(result.status, 'PROPOSED');
    assert.equal(result.detected, vector.detected);
    assert.equal(result.coverage, 'LIMITED');
    assert.equal(result.clearance, false);
    assert.equal(JSON.stringify(result).includes('synthetic-only'), false);
    assert.equal(Object.isFrozen(result) && Object.isFrozen(result.rules), true);
  });

test('proposed scanner rejects invalid bytes and candidate accessors without returning a receipt', () => {
  let calls = 0;
  for (const [source, candidate] of [
    [Buffer.from([255]), {}],
    [new Uint8Array(new SharedArrayBuffer(4)), {}],
    [
      Buffer.from('ordinary'),
      {
        get text() {
          calls++;
          return 'ordinary';
        },
      },
    ],
    [
      Buffer.from('ordinary'),
      new Proxy(
        {},
        {
          ownKeys() {
            calls++;
            return [];
          },
        },
      ),
    ],
  ]) {
    const owner = makeAccount();
    assert.throws(() =>
      candidateScanner.inspectDocumentSecretCandidate(source, candidate, owner.account),
    );
    assert.equal(owner.usage.invalid, true);
  }
  assert.equal(calls, 0);
});

test('proposed scanner cannot yield a receipt after cancellation or work budget failure', () => {
  const controller = new AbortController();
  controller.abort();
  const cancelled = makeAccount(controller.signal);
  assert.throws(
    () =>
      candidateScanner.inspectDocumentSecretCandidate(
        Buffer.from('ordinary'),
        {},
        cancelled.account,
      ),
    { code: 'CANCELLED' },
  );
  assert.equal(cancelled.usage.invalid, true);
  const limited = makeAccount();
  limited.account.visitItem = () => {
    throw Object.assign(Error('budget'), { code: 'HISTORY_LIMIT_EXCEEDED' });
  };
  assert.throws(
    () =>
      candidateScanner.inspectDocumentSecretCandidate(Buffer.from('ordinary'), {}, limited.account),
    { code: 'HISTORY_LIMIT_EXCEEDED' },
  );
  assert.equal(limited.usage.invalid, true);
});

test('offline range mask preserves exact byte offsets, CRLF and the original Unicode input', () => {
  const original = Buffer.from([0x41, 0xc3, 0xa9, 13, 10, 0x42, 0xf0, 0x9f, 0x98, 0x80, 0x43]);
  const before = Buffer.from(original);
  const ranges = [{ startByte: 1, endByte: 10 }];
  const result = masking.maskDocumentRanges(original, ranges, makeAccount().account);
  assert.deepEqual([...result], [0x41, 42, 42, 13, 10, 42, 42, 42, 42, 42, 0x43]);
  assert.deepEqual(original, before);
  assert.deepEqual(ranges, [{ startByte: 1, endByte: 10 }]);
  assert.equal(result.length, original.length);
  assert.equal(result.toString('utf8').includes('\ufffd'), false);
  assert.equal(result.clearance, undefined);
  result[0] = 0;
  assert.deepEqual(original, before);
});

test('offline range mask snapshots only the selected typed-array view; empty ranges grant nothing', () => {
  const backing = Buffer.from('OUTsecretOUT');
  const result = masking.maskDocumentRanges(backing.subarray(3, 9), [], makeAccount().account);
  assert.equal(result.toString(), 'secret');
  result.fill(42);
  assert.equal(backing.toString(), 'OUTsecretOUT');
  assert.equal(result.clearance, undefined);
});

test('offline range mask refuses invalid, reordered, overlapping and mid-scalar ranges', () => {
  for (const ranges of [
    [{ startByte: 1, endByte: 2 }],
    [{ startByte: 0, endByte: 1 }],
    [{ startByte: 2, endByte: 2 }],
    [{ startByte: -1, endByte: 1 }],
    [{ startByte: 0, endByte: 99 }],
    [{ startByte: 0.5, endByte: 2 }],
    [
      { startByte: 2, endByte: 3 },
      { startByte: 0, endByte: 2 },
    ],
    [
      { startByte: 0, endByte: 3 },
      { startByte: 2, endByte: 3 },
    ],
    [{ startByte: 0, endByte: 2, clearance: true }],
  ]) {
    const owner = makeAccount();
    assert.throws(() => masking.maskDocumentRanges(Buffer.from('éx'), ranges, owner.account));
    assert.equal(owner.usage.invalid, true);
  }
});

test('offline range mask rejects getters, proxies, invalid UTF8 and shared bytes without hooks', () => {
  let called = 0;
  for (const [bytes, ranges] of [
    [Buffer.from([255]), []],
    [new Uint8Array(new SharedArrayBuffer(1)), []],
    [new Proxy(Buffer.from('x'), {}), []],
    [
      Buffer.from('x'),
      [
        {
          get startByte() {
            called++;
            return 0;
          },
          endByte: 1,
        },
      ],
    ],
    [
      Buffer.from('x'),
      new Proxy([], {
        get() {
          called++;
          return 0;
        },
      }),
    ],
  ]) {
    const owner = makeAccount();
    assert.throws(() => masking.maskDocumentRanges(bytes, ranges, owner.account));
    assert.equal(owner.usage.invalid, true);
  }
  assert.equal(called, 0);
});

test('offline range mask cancellation and allocation failure return no partial output', () => {
  const controller = new AbortController();
  controller.abort();
  const cancelled = makeAccount(controller.signal);
  assert.throws(() => masking.maskDocumentRanges(Buffer.from('secret'), [], cancelled.account), {
    code: 'CANCELLED',
  });
  assert.equal(cancelled.usage.invalid, true);
  const limited = makeAccount();
  limited.account.reserveBuffer = () => {
    throw Object.assign(Error('budget'), { code: 'HISTORY_LIMIT_EXCEEDED' });
  };
  assert.throws(() => masking.maskDocumentRanges(Buffer.from('secret'), [], limited.account), {
    code: 'HISTORY_LIMIT_EXCEEDED',
  });
  assert.equal(limited.usage.invalid, true);
});

test('offline range mask adjacent ranges work; cancellation during masking leaves source untouched', () => {
  const source = Buffer.from('abc');
  assert.equal(
    masking
      .maskDocumentRanges(
        source,
        [
          { startByte: 0, endByte: 1 },
          { startByte: 1, endByte: 3 },
        ],
        makeAccount().account,
      )
      .toString(),
    '***',
  );
  const controller = new AbortController();
  const owner = makeAccount(controller.signal);
  owner.account.visitItem = () => {
    if (++owner.usage.items === 2) controller.abort();
  };
  assert.throws(
    () => masking.maskDocumentRanges(source, [{ startByte: 0, endByte: 3 }], owner.account),
    { code: 'CANCELLED' },
  );
  assert.equal(source.toString(), 'abc');
  assert.equal(owner.usage.invalid, true);
});

test('offline range mask charges work for every byte even with empty or sparse ranges', () => {
  for (const ranges of [[], [{ startByte: 5, endByte: 6 }]]) {
    const owner = makeAccount();
    const source = Buffer.from('abcdef');
    owner.account.visitItem = () => {
      if (++owner.usage.items > ranges.length + 1)
        throw Object.assign(Error('budget'), { code: 'HISTORY_LIMIT_EXCEEDED' });
    };
    assert.throws(() => masking.maskDocumentRanges(source, ranges, owner.account), {
      code: 'HISTORY_LIMIT_EXCEEDED',
    });
    assert.equal(owner.usage.invalid, true);
    assert.equal(source.toString(), 'abcdef');
  }
});
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
