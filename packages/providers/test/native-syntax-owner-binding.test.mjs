import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as api from '../dist/index.js';
const root = new URL('../../../fixtures/phase1/syntax-budget-contract/', import.meta.url);
const expected = JSON.parse(await readFile(new URL('expected/outcomes.json', root), 'utf8'));
const names = Object.keys(expected),
  requests = {},
  events = {};
for (const name of names) {
  requests[name] = JSON.parse(
    await readFile(new URL('inputs/' + name + '-request.json', root), 'utf8'),
  );
  events[name] = (await readFile(new URL('inputs/' + name + '-events.jsonl', root), 'utf8'))
    .trimEnd()
    .split('\n')
    .map((s) => Buffer.from(s + '\n'));
}
const fresh = (n) => structuredClone(requests[n ?? 'java']);
function input(r) {
  const p = structuredClone(r.payload);
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
function compute(r) {
  assert.equal(typeof api.computeSyntaxOwnerMapDigest, 'function');
  return api.computeSyntaxOwnerMapDigest(input(r));
}
function parse(r = fresh()) {
  assert.equal(typeof api.parseSyntaxObservationRequest, 'function');
  return api.parseSyntaxObservationRequest(r);
}
function bad(fn, code = 'INVALID_REQUEST') {
  assert.throws(fn, (e) => e.code === code);
}
for (const name of names)
  test('literal owner binding ' + name, () => {
    const r = requests[name];
    assert.equal(compute(r), expected[name].ownerMapDigest);
    assert.deepEqual(parse(r), r);
    assert.equal(
      api.validateSyntaxObservationStream(r, events[name]).checksum,
      expected[name].checksum,
    );
  });
test('historical unpublished request bytes are retained but not silently adapted', async () => {
  const r = JSON.parse(
    await readFile(
      new URL('../../../fixtures/phase1/syntax-contract/inputs/java-request.json', import.meta.url),
      'utf8',
    ),
  );
  bad(() => parse(r));
});
for (const [name, change] of [
  ['changed stage', (r) => (r.payload.ownerBinding.stageDigest = 'd'.repeat(64))],
  ['changed owner', (r) => (r.payload.owners[0].canonicalRef.entity.id = 'other')],
  ['changed source', (r) => (r.payload.sourceFiles[0].contentFingerprint = 'source:changed')],
  [
    'changed expected activation',
    (r) => (r.payload.expectedActivationBasis.codeActivationDigest = 'e'.repeat(64)),
  ],
  ['changed snapshot', (r) => (r.payload.providerSnapshotId = 'other')],
])
  test('request binds ' + name, () => {
    const r = fresh('java-provisional');
    assert.doesNotThrow(() => parse(r));
    change(r);
    bad(() => parse(r));
  });
test('active owner cannot claim a provisional source target', () => {
  const r = fresh('java-provisional');
  r.payload.ownerBinding = {
    kind: 'ACTIVE_CODE',
    codeActivationDigest: r.payload.expectedActivationBasis.codeActivationDigest,
  };
  r.payload.ownerBinding.ownerMapDigest = compute(r);
  bad(() => parse(r));
});
test('initial absent activation cannot claim active owners', () => {
  const r = fresh('python-initial');
  r.payload.ownerBinding = { kind: 'ACTIVE_CODE', codeActivationDigest: 'a'.repeat(64) };
  r.payload.ownerBinding.ownerMapDigest = compute(r);
  bad(() => parse(r));
});
test('final candidate is not fabricated before observation', () => {
  const r = fresh();
  r.payload.finalCandidateCodeBasis = r.payload.expectedActivationBasis;
  bad(() => parse(r));
});
test('trusted capture crosscheck is required and does not accept a scalar token', () => {
  assert.equal(typeof api.validateSyntaxOwnerContext, 'function');
  const r = fresh('java-provisional'),
    c = input(r);
  assert.doesNotThrow(() => api.validateSyntaxOwnerContext(r, c));
  bad(() => api.validateSyntaxOwnerContext(r, { stageDigest: c.ownerBinding.stageDigest }));
  c.ownerBinding.stageDigest = 'f'.repeat(64);
  bad(() => api.validateSyntaxOwnerContext(r, c));
});
test('changed current activation is refused against the captured expected basis', () => {
  assert.equal(typeof api.validateSyntaxOwnerContext, 'function');
  const r = fresh(),
    c = input(r);
  c.expectedActivationBasis.codeActivationDigest = 'f'.repeat(64);
  bad(() => api.validateSyntaxOwnerContext(r, c), 'BASE_REVISION_MISMATCH');
});
test('wrong terminal stage is refused even when event integrity was independently resealed', async () => {
  const { createHash } = await import('node:crypto');
  const r = fresh('java-provisional'),
    es = events['java-provisional'].map((b) => JSON.parse(b));
  es.at(-1).payload.ownerBinding.stageDigest = 'd'.repeat(64);
  es.at(-1).payload.checksum = createHash('sha256')
    .update(
      es
        .slice(0, -1)
        .map((e) => JSON.stringify(e) + '\n')
        .join(''),
    )
    .digest('hex');
  bad(
    () =>
      api.validateSyntaxObservationStream(
        r,
        es.map((e) => Buffer.from(JSON.stringify(e) + '\n')),
      ),
    'PROTOCOL_CORRUPTION',
  );
});
