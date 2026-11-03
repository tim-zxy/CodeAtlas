import test from 'node:test';
import assert from 'node:assert/strict';
test('api is callable', async () => {
  const api = await import('../dist/native-composition.js');
  assert.equal(typeof api.composeNativeProjection, 'function');
});
import { loadCompositionCase, limits } from './fixtures/native-composition-helpers.mjs';
for (const id of ['empty', 'python-only', 'java-only', 'mixed'])
  test('full independent candidate ' + id, async () => {
    const { composeNativeProjection } = await import('../dist/native-composition.js'),
      c = await loadCompositionCase(id);
    assert.deepEqual(
      composeNativeProjection(c.metadata, c.requestBytes, c.outputBytes, limits),
      c.expected,
    );
  });
import { readFile } from 'node:fs/promises';
import * as publicAPI from '../dist/index.js';
import { reseal, sha } from './fixtures/native-composition-helpers.mjs';
async function compose(c, l = limits) {
  const { composeNativeProjection } = await import('../dist/native-composition.js');
  return composeNativeProjection(c.metadata, c.requestBytes, c.outputBytes, l);
}
for (const id of [
  'python-partial',
  'syntax-partial',
  'java-partial',
  'mismatched-target',
  'mismatched-snapshot',
  'inventory-omission',
  'unsupported-source',
  'temporal-mismatch',
])
  test('composer exact refusal ' + id, async () => {
    const c = await loadCompositionCase(id);
    await assert.rejects(
      () => compose(c),
      (e) => e.code === c.expected.error && e.message === e.code,
    );
  });
function frozen(v) {
  if (v !== null && typeof v === 'object') {
    assert.ok(Object.isFrozen(v));
    for (const child of Object.values(v)) frozen(child);
  }
}
test('structural_candidate_has_no_execution_or_apply_authority', async () => {
  const c = await loadCompositionCase('mixed'),
    r = await compose(c);
  assert.deepEqual(
    Object.keys(r).sort(),
    ['kind', 'snapshot', 'normalized', 'merged', 'codeSyntax', 'scope', 'provenance'].sort(),
  );
  frozen(r);
  assert.deepEqual(await compose(c), r);
  assert.notEqual(r.codeSyntax.request.payload.ownerBinding.stageDigest, undefined);
  assert.equal(r.provenance.codeSyntax.outputChecksum, sha(c.outputBytes));
  assert.equal(Object.hasOwn(r.provenance.java, 'requestChecksum'), false);
  for (const word of [
    'authenticated',
    'ready',
    'applicable',
    'settled',
    'basis',
    'handle',
    'token',
  ])
    assert.equal(Object.hasOwn(r, word), false);
  assert.equal(Object.hasOwn(publicAPI, 'composeNativeProjection'), false);
  assert.equal(Object.hasOwn(publicAPI, 'readNativeCompositionInputs'), false);
  assert.equal(
    (await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')).includes(
      'native-composition',
    ),
    false,
  );
  c.metadata.inventory.length = 0;
  c.requestBytes.fill(0);
  assert.equal(r.scope.inventory.length, 2);
  assert.equal(r.codeSyntax.request.protocolVersion, 5);
});
test('merged_result_is_charged_before_return', async () => {
  const c = await loadCompositionCase('mixed');
  const { readNativeCompositionInputs } = await import('../dist/native-composition-input.js'),
    p = readNativeCompositionInputs(c.metadata, c.requestBytes, c.outputBytes, limits);
  await assert.rejects(
    () => compose(c, { ...limits, maxSerializedBytes: p.budget.serializedBytes }),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
  let lo = p.budget.serializedBytes,
    hi = 1000000;
  while (lo < hi) {
    const n = Math.floor((lo + hi) / 2);
    try {
      await compose(c, { ...limits, maxSerializedBytes: n });
      hi = n;
    } catch (e) {
      assert.equal(e.code, 'RESOURCE_LIMIT_EXCEEDED');
      lo = n + 1;
    }
  }
  assert.deepEqual(await compose(c, { ...limits, maxSerializedBytes: lo }), c.expected);
  await assert.rejects(
    () => compose(c, { ...limits, maxSerializedBytes: lo - 1 }),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
});
test('old owner map cannot masquerade as final candidate owner', async () => {
  const c = await loadCompositionCase('mixed');
  const r = JSON.parse(c.requestBytes),
    es = c.outputBytes.toString().trimEnd().split('\n').map(JSON.parse);
  const j = c.metadata.java.events.find(
    (e) => e.type === 'NODE' && e.payload.providerFactId === 'java:Box',
  );
  j.payload.qualifiedName = 'Other';
  c.metadata.java.terminal = structuredClone(c.metadata.java.events.at(-1));
  await assert.rejects(
    () => compose(c),
    (e) => e.code === 'INVALID_CONTEXT',
  );
});
test('normalization errors do not expose source', async () => {
  const c = await loadCompositionCase('mixed');
  c.metadata.java.events.find((e) => e.type === 'NODE').payload.providerKind =
    'java.private-secret';
  await assert.rejects(
    () => compose(c),
    (e) => e.code === 'NORMALIZATION_FAILED' && e.message === e.code,
  );
});
