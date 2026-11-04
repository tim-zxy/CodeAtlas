import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../../../fixtures/phase1/syntax-contract/binding-history/', import.meta.url);
const input = JSON.parse(readFileSync(new URL('inputs.json', root))),
  expected = JSON.parse(readFileSync(new URL('expected.json', root)));
const budget = () => ({
  limits: {
    maxSerializedBytes: Number.MAX_SAFE_INTEGER,
    maxItems: Number.MAX_SAFE_INTEGER,
    maxDepth: Number.MAX_SAFE_INTEGER,
  },
  budget: { items: 0, serializedBytes: 0 },
});
const canonical = (v) =>
  Array.isArray(v)
    ? '[' + v.map(canonical).join(',') + ']'
    : v && typeof v === 'object'
      ? '{' +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
          .join(',') +
        '}'
      : JSON.stringify(v);
const digest = (d, v) =>
  createHash('sha256')
    .update(d + '\0')
    .update(canonical(v))
    .digest('hex');
test('binding v2 pair uses independent initial/origin/projection domains and full fields', async () => {
  const api = await import('../dist/syntax-history-candidate.js');
  assert.equal(typeof api.createBindingSyntaxHistoryPair, 'function');
  const p = api.createBindingSyntaxHistoryPair(
    { body: input.body, selectedNodes: input.selectedNodes },
    budget(),
  );
  const origin = digest(expected.originDomain, input.body),
    { id, ...meaning } = input.body.envelope.payload;
  assert.equal(id, 'syntax:' + digest(expected.initialDomain, meaning));
  assert.equal(p.origin.id, 'syntax-origin:' + origin);
  assert.equal(p.origin.origin_json, canonical(input.body));
  assert.equal(
    p.projection.id,
    'syntax:' + digest(expected.projectionDomain, { originId: p.origin.id, payload: meaning }),
  );
  assert.deepEqual(
    JSON.parse(p.projection.envelope_json).payload.lexicalScope,
    input.body.envelope.payload.lexicalScope,
  );
  assert.throws(() =>
    api.createSyntaxHistoryPair({ body: input.body, selectedNodes: input.selectedNodes }, budget()),
  );
});
test('v2 retained preserves immutable origin/meaning and refreshes complete support basis', async () => {
  const api = await import('../dist/syntax-history-candidate.js');
  assert.equal(typeof api.reprojectBindingSyntaxHistoryPair, 'function');
  const currentBasis = { ...input.state.basis, contentFingerprint: 'content:retained' };
  const p = api.reprojectBindingSyntaxHistoryPair(
    {
      body: input.body,
      originNodes: input.selectedNodes,
      currentBasis,
      currentNodes: input.selectedNodes,
    },
    budget(),
  );
  assert.equal(p.origin.origin_json, canonical(input.body));
  const projected = JSON.parse(p.projection.envelope_json).payload;
  const { id: oldId, supportRefs: oldRefs, ...oldMeaning } = input.body.envelope.payload,
    { id: newId, supportRefs: newRefs, ...newMeaning } = projected;
  assert.deepEqual(newMeaning, oldMeaning);
  assert.ok(newRefs.every((s) => s.basis.contentFingerprint === 'content:retained'));
});
test('v2 pair rejects malformed scope, version/domain and exhausted ledger', async () => {
  const api = await import('../dist/syntax-history-candidate.js');
  assert.equal(typeof api.createBindingSyntaxHistoryPair, 'function');
  for (const change of [
    (x) => (x.body.envelope.version = 1),
    (x) => (x.body.envelope.version = 3),
    (x) => (x.body.envelope.payload.lexicalScope.entity.id = 'code:missing'),
    (x) => (x.body.envelope.payload.id = 'syntax:wrong'),
  ]) {
    const x = structuredClone(input);
    change(x);
    assert.throws(() =>
      api.createBindingSyntaxHistoryPair(
        { body: x.body, selectedNodes: x.selectedNodes },
        budget(),
      ),
    );
  }
  const b = budget();
  b.limits.maxItems = 1;
  assert.throws(
    () =>
      api.createBindingSyntaxHistoryPair(
        { body: input.body, selectedNodes: input.selectedNodes },
        b,
      ),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
});

import { reseal } from './fixtures/native-composition-helpers.mjs';
const composition = JSON.parse(
  readFileSync(
    new URL(
      '../../../fixtures/phase1/mixed-analysis-store/binding-history/inputs.json',
      import.meta.url,
    ),
  ),
);
const complete = () => {
  const x = structuredClone(composition);
  return { ...x, ...reseal(x.request, x.events) };
};
test('fixed v6 full composer preserves Code/Evidence and strict legacy refusal', async () => {
  const api = await import('../dist/native-composition.js');
  assert.equal(typeof api.composeBindingProjectionForHistory, 'function');
  const x = complete(),
    b = budget();
  const out = api.composeBindingProjectionForHistory(x.metadata, x.requestBytes, x.outputBytes, b);
  const old = JSON.parse(
    readFileSync(
      new URL(
        '../../../fixtures/phase1/native-composition-candidate/python-only/expected.json',
        import.meta.url,
      ),
    ),
  );
  assert.deepEqual(out.candidate.normalized, old.normalized);
  assert.deepEqual(out.candidate.merged, old.merged);
  assert.equal(out.candidate.codeSyntax.request.protocolVersion, 6);
  assert.equal(out.candidate.provenance.codeSyntax.kind, 'RAW_V6');
  assert.throws(() =>
    api.composeNativeProjection(x.metadata, x.requestBytes, x.outputBytes, b.limits),
  );
  const broken = Buffer.from(x.outputBytes);
  broken[3] = 33;
  assert.throws(() =>
    api.composeBindingProjectionForHistory(x.metadata, x.requestBytes, broken, budget()),
  );
  const tiny = budget();
  tiny.limits.maxItems = 1;
  assert.throws(
    () => api.composeBindingProjectionForHistory(x.metadata, x.requestBytes, x.outputBytes, tiny),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
});
for (const name of ['python-direct.py', 'python-nested.py'])
  test(
    'existing actual v6 PARTIAL is refused: ' + name,
    {
      skip: process.env.CODEATLAS_BINDING_LIBRARY_OUTPUT
        ? false
        : 'Requires explicitly selected existing library capture',
    },
    async () => {
      const api = await import('../dist/native-composition.js');
      assert.equal(typeof api.composeBindingProjectionForHistory, 'function');
      const path = process.env.CODEATLAS_BINDING_LIBRARY_OUTPUT,
        rb = readFileSync(path + '/' + name + '.request.jsonl'),
        ob = readFileSync(path + '/' + name + '.output.jsonl'),
        p = JSON.parse(rb).payload;
      const m = structuredClone(composition.metadata);
      m.targetSource = p.targetSource;
      m.inventory = p.sourceFiles;
      assert.throws(
        () => api.composeBindingProjectionForHistory(m, rb, ob, budget()),
        (e) => e.code === 'INCOMPLETE_OBSERVATION',
      );
    },
  );

import { loadRawHistoryCase } from '../../../fixtures/phase1/declared-raw-history-candidate/corpus.mjs';
test('binding full support and delta scope keep contract change obligations', async () => {
  const api = await import('../dist/declared-delta-raw-support-candidate.js');
  assert.equal(typeof api.composeDeclaredBindingFullRawSupportCandidate, 'function');
  assert.equal(typeof api.composeDeclaredBindingDeltaRawSupportCandidateWithBudget, 'function');
  const x = complete(),
    target = {
      source: x.metadata.targetSource,
      repositoryLocatorDigest: 'a'.repeat(64),
      inventory: x.metadata.inventory,
      contracts: x.contracts,
    };
  const full = api.composeDeclaredBindingFullRawSupportCandidate(
    target,
    x.metadata,
    x.requestBytes,
    x.outputBytes,
    budget(),
  );
  assert.equal(full.raw.codeSyntax.request.protocolVersion, 6);
  assert.ok(full.activeSupports.length > 0);
  const wrong = structuredClone(target);
  wrong.contracts[0].normalizer = 'fixture-v1';
  assert.throws(() =>
    api.composeDeclaredBindingFullRawSupportCandidate(
      wrong,
      x.metadata,
      x.requestBytes,
      x.outputBytes,
      budget(),
    ),
  );
  const delta = loadRawHistoryCase('S02');
  delta.input.target.contracts = x.contracts;
  assert.throws(() =>
    api.composeDeclaredBindingDeltaRawSupportCandidateWithBudget(
      delta.input,
      delta.metadata,
      delta.requestBytes,
      delta.outputBytes,
      budget(),
    ),
  );
});

test('v2 pair exact cumulative byte/item boundary includes new fields and parser context', async () => {
  const { createBindingSyntaxHistoryPair: create } =
      await import('../dist/syntax-history-candidate.js'),
    x = { body: input.body, selectedNodes: input.selectedNodes },
    measured = budget();
  create(x, measured);
  for (const [limit, cost] of [
    ['maxItems', 'items'],
    ['maxSerializedBytes', 'serializedBytes'],
  ]) {
    const exact = budget();
    exact.limits[limit] = measured.budget[cost];
    create(x, exact);
    const below = budget();
    below.limits[limit] = measured.budget[cost] - 1;
    assert.throws(
      () => create(x, below),
      (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
    );
  }
});
