import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as api from '../dist/index.js';
const root = new URL('../../../fixtures/phase1/plugin-context/', import.meta.url);
const v = JSON.parse(await readFile(new URL('inputs/vectors.json', root), 'utf8'));
const expected = JSON.parse(await readFile(new URL('expected/decisions.json', root), 'utf8'));
const fresh = () => structuredClone(v);
function context(c = v.context) {
  assert.equal(typeof api.validatePluginV2Context, 'function');
  return api.validatePluginV2Context(c);
}
function candidate(x = fresh()) {
  assert.equal(typeof api.validatePluginV2Candidate, 'function');
  return api.validatePluginV2Candidate(
    { ...x.context, detection: x.detection },
    x.descriptor,
    x.candidate,
  );
}
function bad(fn) {
  assert.throws(fn, (e) => e.code === 'IR_VALIDATION_FAILED');
}
test('literal V2 context validates and is deeply immutable', () => {
  const input = fresh();
  const output = context(input.context);
  assert.equal(expected.validContext, true);
  assert.deepEqual(output, input.context);
  assert.equal(Object.isFrozen(output.syntaxEvidence[0].payload.arguments), true);
  assert.equal(Object.isFrozen(input.context), false);
});
test('literal detection and candidate match independent decisions', () => {
  assert.equal(typeof api.validatePluginV2Detection, 'function');
  assert.deepEqual(api.validatePluginV2Detection(v.context, v.detection), v.detection);
  assert.equal(expected.validDetection, true);
  assert.deepEqual(candidate(), v.candidate);
  assert.equal(expected.validCandidate, true);
});
test('V1 context refuses V2 rather than upgrading', () => {
  assert.equal(expected.v1RefusesV2, true);
  assert.throws(() => api.DetectionContextSchema.parse(v.context));
});
for (const [name, change] of [
  ['old context version', (x) => (x.contextVersion = 1)],
  ['foreign basis', (x) => (x.basis.repositoryId = 'other')],
  [
    'foreign syntax basis',
    (x) => (x.syntaxEvidence[0].supportRefs[0].basis.codeActivationDigest = 'f'.repeat(64)),
  ],
  ['foreign syntax owner', (x) => (x.syntaxEvidence[0].owner.entity.id = 'missing')],
  ['source fingerprint mismatch', (x) => (x.syntaxEvidence[0].sourceFingerprint = 'other')],
  ['duplicate syntax identity', (x) => x.syntaxEvidence.push(structuredClone(x.syntaxEvidence[0]))],
  ['duplicate canonical identity', (x) => x.nodes.push(structuredClone(x.nodes[0]))],
  ['duplicate source path', (x) => x.sourceFiles.push({ ...x.sourceFiles[0], id: 'file:two' })],
  ['missing source metadata', (x) => (x.sourceFiles = [])],
  ['missing support inventory', (x) => (x.supportInventory = [])],
  ['cross-file owner', (x) => (x.nodes[0].sourceRange.sourceFileId = 'other')],
  ['raw authority field', (x) => (x.environment = { PATH: 'no' })],
])
  test('context rejects ' + name, () => {
    const x = fresh();
    change(x.context);
    assert.equal(typeof api.validatePluginV2Context, 'function');
    bad(() => context(x.context));
  });
test('combined facts and syntax share original cap', () => {
  const x = fresh();
  x.context.nodes = [
    x.context.nodes[0],
    ...Array.from({ length: 9998 }, (_, i) => ({
      ...x.context.nodes[0],
      id: 'n' + i,
      factKey: 'k' + i,
    })),
  ];
  assert.doesNotThrow(() => context(x.context));
  x.context.nodes.push({ ...x.context.nodes[0], id: 'last', factKey: 'last' });
  assert.equal(expected.totalFactsLimit, api.MAX_PLUGIN_CONTEXT_FACTS);
  assert.equal(typeof api.validatePluginV2Context, 'function');
  bad(() => context(x.context));
});
for (const [name, change] of [
  ['undeclared semantic capability', (x) => (x.candidate.capability = 'OTHER')],
  [
    'duplicate mixed support',
    (x) => x.candidate.support.push(structuredClone(x.candidate.support[1])),
  ],
  ['absent syntax support', (x) => (x.candidate.support[1].id = 'missing')],
  ['absent canonical support', (x) => (x.candidate.support[0].ref.id = 'missing')],
  [
    'missing positive detection',
    (x) => {
      x.detection.matched = false;
      x.detection.support = [];
    },
  ],
  ['descriptor version selection', (x) => (x.descriptor.contextVersion = 1)],
  ['candidate publication authority', (x) => (x.candidate.published = true)],
])
  test('candidate rejects ' + name, () => {
    const x = fresh();
    assert.doesNotThrow(() => candidate(x));
    change(x);
    bad(() => candidate(x));
  });
test('detection cannot be matched without support or unmatched with support', () => {
  assert.equal(typeof api.validatePluginV2Detection, 'function');
  for (const d of [
    { ...v.detection, support: [] },
    { ...v.detection, matched: false },
  ])
    bad(() => api.validatePluginV2Detection(v.context, d));
});
test('hostile getters never execute', () => {
  let seen = false;
  const x = fresh();
  Object.defineProperty(x.context, 'nodes', {
    enumerable: true,
    get() {
      seen = true;
      throw Error('raw');
    },
  });
  assert.equal(typeof api.validatePluginV2Context, 'function');
  bad(() => context(x.context));
  assert.equal(seen, false);
});

test('support inventory cannot bind competing values to one captured entity', () => {
  const x = fresh();
  assert.doesNotThrow(() => context(x.context));
  const conflicting = structuredClone(x.context.supportInventory[0]);
  conflicting.valueDigest = 'f'.repeat(64);
  x.context.supportInventory.push(conflicting);
  bad(() => context(x.context));
});
