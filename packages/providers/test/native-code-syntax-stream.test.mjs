import { readHistoricalInput } from '../../../fixtures/phase1/syntax-contract/ci-portability/historical-inputs.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { getEventListeners } from 'node:events';
import { readFile } from 'node:fs/promises';
import * as publicAPI from '../dist/index.js';
import {
  instantiateProducerCase,
  loadProducerCase,
  instantiateTemplates,
  producerJSON,
} from './fixtures/code-syntax-producer-helpers.mjs';
let api = {};
try {
  api = await import('../dist/native-code-syntax-stream.js');
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
const signal = () => new AbortController().signal;
const run = (x, stream = Readable.from([x.expectedOutputBytes]), s = signal()) =>
  api.consumeCodeSyntaxObservationStream(x.requestBytes, stream, s);
const error = (code) => (e) => {
  assert.equal(e.code, code);
  assert.ok(!e.message.includes('SENTINEL'));
  return true;
};
test('new private bounded reader API is present', () =>
  assert.equal(typeof api.consumeCodeSyntaxObservationStream, 'function'));
for (const { id } of await producerJSON('cases.json'))
  test('whole wire returns same frozen result: ' + id, async () => {
    const x = await instantiateProducerCase(id, '/fixture/producer');
    const r = await run(x);
    assert.deepEqual(
      r,
      publicAPI.validateCodeSyntaxObservationStream(x.requestBytes, x.expectedOutputBytes),
    );
    assert.ok(Object.isFrozen(r));
  });
test('every split of compact wire returns same complete result', async () => {
  const x = await instantiateProducerCase('no-files', '/fixture/producer'),
    expected = publicAPI.validateCodeSyntaxObservationStream(x.requestBytes, x.expectedOutputBytes);
  for (let i = 0; i <= x.expectedOutputBytes.length; i++) {
    assert.deepEqual(
      await run(
        x,
        Readable.from([x.expectedOutputBytes.subarray(0, i), x.expectedOutputBytes.subarray(i)]),
      ),
      expected,
    );
  }
});
test('single byte chunks and UTF8 splits preserve exact bytes', async () => {
  const x = await instantiateProducerCase('unicode-control', '/fixture/producer');
  function* pieces() {
    for (let i = 0; i < x.expectedOutputBytes.length; i++)
      yield x.expectedOutputBytes.subarray(i, i + 1);
  }
  assert.deepEqual(
    await run(x, Readable.from(pieces())),
    publicAPI.validateCodeSyntaxObservationStream(x.requestBytes, x.expectedOutputBytes),
  );
});
test('mutated caller request does not change binding', async () => {
  const x = await instantiateProducerCase('alias-reference-python', '/fixture/producer');
  const expected = publicAPI.validateCodeSyntaxObservationStream(
    x.requestBytes,
    x.expectedOutputBytes,
  );
  const p = run(x);
  x.requestBytes.fill(32);
  assert.deepEqual(await p, expected);
});
test('abort during pending read destroys owned readable and removes listener', async () => {
  const x = await instantiateProducerCase('empty-python', '/fixture/producer'),
    c = new AbortController();
  let destroyed = 0;
  const stream = new Readable({
    read() {},
    destroy(e, cb) {
      destroyed++;
      cb(e);
    },
  });
  const p = run(x, stream, c.signal);
  c.abort();
  await assert.rejects(p, error('CANCELLED'));
  assert.equal(destroyed, 1);
  assert.equal(getEventListeners(c.signal, 'abort').length, 0);
});
test('request failure and pre-abort read zero output bytes', async () => {
  const x = await instantiateProducerCase('empty-python', '/fixture/producer');
  let reads = 0;
  const stream = new Readable({
    read() {
      reads++;
    },
  });
  await assert.rejects(
    run({ ...x, requestBytes: Buffer.from('invalid\n') }, stream),
    error('INVALID_REQUEST'),
  );
  assert.equal(reads, 0);
  const c = new AbortController();
  c.abort();
  await assert.rejects(run(x, stream, c.signal), error('CANCELLED'));
  assert.equal(reads, 0);
  stream.destroy();
});
test('transport error removes listeners and returns controlled PROCESS_FAILED', async () => {
  const x = await instantiateProducerCase('empty-python', '/fixture/producer'),
    c = new AbortController();
  const stream = new Readable({
    read() {
      this.destroy(new Error('SENTINEL'));
    },
  });
  await assert.rejects(run(x, stream, c.signal), (e) => {
    assert.ok(e instanceof publicAPI.NativeClientError);
    return error('PROCESS_FAILED')(e);
  });
  assert.equal(getEventListeners(c.signal, 'abort').length, 0);
  assert.ok(stream.destroyed);
});
for (const [name, mutate] of [
  ['early EOF', (b) => b.subarray(0, -1)],
  ['post terminal', (b) => Buffer.concat([b, Buffer.from('{}\n')])],
  ['CR', (b) => Buffer.from(b.toString().replaceAll('\n', '\r\n'))],
  ['bad checksum', (b) => Buffer.from(b.toString().replace('"checksum":"', '"checksum":"0'))],
])
  test('reader refuses ' + name, async () => {
    const x = await instantiateProducerCase('empty-python', '/fixture/producer');
    await assert.rejects(
      run({ ...x, expectedOutputBytes: mutate(x.expectedOutputBytes) }),
      error('PROTOCOL_CORRUPTION'),
    );
  });
for (const field of ['maxOutputBytes', 'maxEvents'])
  test('reader enforces ' + field + ' before final validator', async () => {
    const x = await loadProducerCase('empty-python'),
      r = JSON.parse(x.requestTemplate);
    r.payload.resourceBudget[field] = 1;
    const y = instantiateTemplates(
      Buffer.from(JSON.stringify(r) + '\n'),
      x.eventsTemplate,
      '/fixture/producer',
    );
    await assert.rejects(run(y), error('RESOURCE_LIMIT_EXCEEDED'));
  });
test('non-byte stream chunk refuses without invoking property getters', async () => {
  const x = await instantiateProducerCase('empty-python', '/fixture/producer');
  let traps = 0;
  const chunk = {
    get byteLength() {
      traps++;
      throw Error('SENTINEL');
    },
  };
  await assert.rejects(run(x, Readable.from([chunk])), error('PROTOCOL_CORRUPTION'));
  assert.equal(traps, 0);
});
test('reader does not widen public index', async () => {
  const current = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8'),
    before = readHistoricalInput(
      '.superpowers/sdd/2026-10-24-phase1-code-syntax-producer/before-product/packages/providers/src/index.ts',
      'utf8',
    );
  assert.equal(current, before);
  assert.equal(publicAPI.consumeCodeSyntaxObservationStream, undefined);
});

test('upstream Promise assimilation is a controlled transport failure', async () => {
  const x = await instantiateProducerCase('empty-python', '/fixture/producer');
  const keys = [];
  const chunk = new Proxy(
    {},
    {
      get(_o, key) {
        keys.push(key);
        throw Error('SENTINEL');
      },
    },
  );
  await assert.rejects(run(x, Readable.from([chunk])), error('PROCESS_FAILED'));
  assert.deepEqual(keys, ['then']);
});
for (const field of ['maxOutputBytes', 'maxEvents'])
  test('reader exact and adjacent ' + field + ' boundaries', async () => {
    const x = await loadProducerCase('empty-python'),
      base = await instantiateProducerCase('empty-python', '/fixture/producer'),
      exact =
        field === 'maxOutputBytes'
          ? base.expectedOutputBytes.length
          : base.expectedOutputBytes.toString().trimEnd().split('\n').length;
    for (const delta of [0, 1, -1]) {
      const r = JSON.parse(x.requestTemplate);
      r.payload.resourceBudget[field] = exact + delta;
      const y = instantiateTemplates(
        Buffer.from(JSON.stringify(r) + '\n'),
        x.eventsTemplate,
        '/fixture/producer',
      );
      if (delta < 0) await assert.rejects(run(y), error('RESOURCE_LIMIT_EXCEEDED'));
      else assert.equal((await run(y)).outcome, 'SUCCEEDED');
    }
  });
test('reader hard line limit is enforced without waiting for LF', async () => {
  const x = await loadProducerCase('no-files'),
    r = JSON.parse(x.requestTemplate);
  r.payload.resourceBudget.maxOutputBytes = publicAPI.NATIVE_CLIENT_HARD_LIMITS.maxStdoutBytes;
  const y = instantiateTemplates(
    Buffer.from(JSON.stringify(r) + '\n'),
    x.eventsTemplate,
    '/fixture/producer',
  );
  y.expectedOutputBytes = Buffer.alloc(publicAPI.NATIVE_CLIENT_HARD_LIMITS.maxLineBytes + 1, 32);
  await assert.rejects(run(y), error('RESOURCE_LIMIT_EXCEEDED'));
});

test('AR raw reader private API exists', () =>
  assert.equal(typeof api.consumeCodeSyntaxObservationBytes, 'function'));
test('AR raw reader keeps original bytes and the old result shape', async () => {
  const x = await instantiateProducerCase('no-files', '/fixture/producer');
  const result = await api.consumeCodeSyntaxObservationBytes(
    x.requestBytes,
    Readable.from([x.expectedOutputBytes]),
    signal(),
  );
  assert.deepEqual(result.outputBytes, x.expectedOutputBytes);
  assert.deepEqual(result.observation, await run(x));
  assert.equal((await import('../dist/index.js')).consumeCodeSyntaxObservationBytes, undefined);
});
test('AR raw reader owns bytes after caller chunk mutation', async () => {
  const x = await instantiateProducerCase('no-files', '/fixture/producer'),
    chunk = Buffer.from(x.expectedOutputBytes);
  const result = await api.consumeCodeSyntaxObservationBytes(
    x.requestBytes,
    Readable.from([chunk]),
    signal(),
  );
  chunk.fill(32);
  assert.deepEqual(result.outputBytes, x.expectedOutputBytes);
});
