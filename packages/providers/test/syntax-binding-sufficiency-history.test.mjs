import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../../../fixtures/phase1/syntax-contract/binding-pipeline/', import.meta.url),
  input = JSON.parse(readFileSync(new URL('history-inputs.json', root))),
  expected = JSON.parse(readFileSync(new URL('history-expected.json', root)));
const budget = () => ({
  limits: {
    maxSerializedBytes: Number.MAX_SAFE_INTEGER,
    maxItems: Number.MAX_SAFE_INTEGER,
    maxDepth: Number.MAX_SAFE_INTEGER,
  },
  budget: { items: 0, serializedBytes: 0 },
});
const canon = (v) =>
  Array.isArray(v)
    ? '[' + v.map(canon).join(',') + ']'
    : v && typeof v === 'object'
      ? '{' +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canon(v[k]))
          .join(',') +
        '}'
      : JSON.stringify(v);
const digest = (d, v) =>
  createHash('sha256')
    .update(d + '\0' + canon(v))
    .digest('hex');
test('v3 history pair uses all independent identity domains and rejects old factory', async () => {
  const a = await import('../dist/syntax-history-candidate.js');
  assert.equal(typeof a.createBindingAwareSyntaxHistoryPair, 'function');
  for (const body of input.bodies) {
    const p = a.createBindingAwareSyntaxHistoryPair(
      { body, selectedNodes: input.selectedNodes },
      budget(),
    );
    assert.equal(p.origin.id, 'syntax-origin:' + digest(expected.originDomain, body));
    assert.equal(p.origin.origin_json, canon(body));
    const { id, ...meaning } = body.envelope.payload;
    assert.equal(id, 'syntax:' + digest(expected.initialDomain, meaning));
    assert.equal(
      p.projection.id,
      'syntax:' + digest(expected.projectionDomain, { originId: p.origin.id, payload: meaning }),
    );
    assert.throws(() =>
      a.createBindingSyntaxHistoryPair({ body, selectedNodes: input.selectedNodes }, budget()),
    );
  }
});
test('v3 retained keeps immutable origin and new refs while refreshing basis', async () => {
  const a = await import('../dist/syntax-history-candidate.js');
  assert.equal(typeof a.reprojectBindingAwareSyntaxHistoryPair, 'function');
  const body = input.bodies[1];
  const p = a.reprojectBindingAwareSyntaxHistoryPair(
    {
      body,
      originNodes: input.selectedNodes,
      currentBasis: { ...input.basis, contentFingerprint: 'content:retained-v3' },
      currentNodes: input.selectedNodes,
    },
    budget(),
  );
  assert.equal(p.origin.origin_json, canon(body));
  const v = JSON.parse(p.projection.envelope_json);
  assert.equal(v.version, 3);
  assert.deepEqual(v.payload.payload, body.envelope.payload.payload);
  assert.ok(
    v.payload.supportRefs.every((s) => s.basis.contentFingerprint === 'content:retained-v3'),
  );
});
test('v3 history rejects foreign parent ref, wrong domain/version and budget loss', async () => {
  const a = await import('../dist/syntax-history-candidate.js');
  assert.equal(typeof a.createBindingAwareSyntaxHistoryPair, 'function');
  for (const alter of [
    (x) => (x.body.envelope.version = 2),
    (x) => (x.body.envelope.payload.id = 'syntax:wrong'),
    (x) => (x.body.envelope.payload.payload.parentScopeRef.entity.id = 'code:missing'),
  ]) {
    const x = { body: structuredClone(input.bodies[1]), selectedNodes: input.selectedNodes };
    alter(x);
    assert.throws(() => a.createBindingAwareSyntaxHistoryPair(x, budget()));
  }
  const b = budget();
  b.limits.maxItems = 1;
  assert.throws(
    () =>
      a.createBindingAwareSyntaxHistoryPair(
        { body: input.bodies[0], selectedNodes: input.selectedNodes },
        b,
      ),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
});
test('shared scope collection is required by persisted projection validation', async () => {
  const a = await import('../../storage/dist/analysis/activation-history-format.js'),
    { historyLimits } = await import('../../storage/test/helpers/r011-history-fixture.mjs');
  assert.equal(typeof a.validateSyntaxProjectionClosure, 'function');
  const state = { nodes: input.selectedNodes, inventory: [input.bodies[0].sourceFile] };
  const envelopes = input.bodies.map((b) => b.envelope);
  assert.doesNotThrow(() =>
    a.validateSyntaxProjectionClosure(envelopes, state, new a.HistoryReadBudget(historyLimits)),
  );
  assert.throws(() =>
    a.validateSyntaxProjectionClosure(
      envelopes.slice(1),
      state,
      new a.HistoryReadBudget(historyLimits),
    ),
  );
  const bad = structuredClone(envelopes);
  bad[0].payload.payload.parentScopeRef = bad[1].payload.payload.scopeRef;
  assert.throws(() =>
    a.validateSyntaxProjectionClosure(bad, state, new a.HistoryReadBudget(historyLimits)),
  );
  assert.throws(() =>
    a.validateSyntaxProjectionClosure(
      [{ ...envelopes[0], version: 2 }, ...envelopes.slice(1)],
      state,
      new a.HistoryReadBudget(historyLimits),
    ),
  );
});
