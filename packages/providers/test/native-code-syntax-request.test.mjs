import assert from 'node:assert/strict';
import test from 'node:test';
import { instantiateProducerCase, sha } from './fixtures/code-syntax-producer-helpers.mjs';
let api = {};
try {
  api = await import('../dist/native-code-syntax-request.js');
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
test('new private request snapshot API is present', () =>
  assert.equal(typeof api.readCodeSyntaxRequestSnapshot, 'function'));
test('snapshot owns the exact request bytes', async () => {
  const x = await instantiateProducerCase('alias-reference-python', '/fixture/producer'),
    raw = Buffer.from(x.requestBytes),
    r = api.readCodeSyntaxRequestSnapshot(raw);
  assert.equal(r.requestChecksum, sha(raw));
  raw.fill(32);
  assert.deepEqual(r.bytes, x.requestBytes);
  assert.equal(r.request.protocolVersion, 5);
});
for (const which of ['bytes', 'depth'])
  test('private request snapshot enforces ' + which + ' boundary', async () => {
    const x = await instantiateProducerCase('alias-reference-python', '/fixture/producer'),
      r = JSON.parse(x.requestBytes);
    if (which === 'bytes') {
      for (;;) {
        const n = Buffer.byteLength(JSON.stringify(r) + '\n');
        r.payload.resourceBudget.maxInputBytes = n;
        if (Buffer.byteLength(JSON.stringify(r) + '\n') === n) break;
      }
      assert.ok(api.readCodeSyntaxRequestSnapshot(Buffer.from(JSON.stringify(r) + '\n')));
      r.payload.resourceBudget.maxInputBytes--;
    } else {
      r.payload.resourceBudget.maxDepth = 1;
    }
    assert.throws(
      () => api.readCodeSyntaxRequestSnapshot(Buffer.from(JSON.stringify(r) + '\n')),
      (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
    );
  });
